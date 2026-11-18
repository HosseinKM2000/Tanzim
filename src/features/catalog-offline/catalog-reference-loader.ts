import { syncStatusStore } from "@/shared/lib/infrastructure/sync/sync-status";

import { getPublishedReferenceAsset } from "./catalog-offline.api";
import { catalogOfflineRepository } from "./catalog-offline.repository";
import { referenceImageRepository } from "./reference-image.repository";
import type { CatalogManifestAsset, CatalogOfflineScope } from "./types";

export type CatalogReferencePriority = "visible" | "near" | "detail" | "recovery" | "bulk";

type LoadRequest = {
  scope: CatalogOfflineScope;
  asset: CatalogManifestAsset;
  variant: "preview" | "detail";
  releaseId: string;
  familySlug?: string;
  priority: CatalogReferencePriority;
  signal?: AbortSignal;
};

type QueueTask = LoadRequest & {
  key: string;
  resolve: (file: File) => void;
  reject: (error: unknown) => void;
};

const PRIORITY: Record<CatalogReferencePriority, number> = {
  visible: 0,
  near: 1,
  detail: 2,
  recovery: 3,
  bulk: 4,
};

function positiveLimit(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class CatalogReferenceLoader {
  private readonly queued: QueueTask[] = [];
  private readonly shared = new Map<string, Promise<File>>();
  private running = 0;
  private runningBulk = 0;
  private readonly maxRequests: number;
  private readonly maxBulk: number;

  constructor(
    maxRequests = positiveLimit(import.meta.env.VITE_CATALOG_REFERENCE_MAX_REQUESTS, 4),
    maxBulk = positiveLimit(import.meta.env.VITE_CATALOG_REFERENCE_MAX_BULK_REQUESTS, 2),
  ) {
    this.maxRequests = maxRequests;
    this.maxBulk = maxBulk;
    syncStatusStore.subscribe(() => this.pump());
  }

  async load(request: LoadRequest): Promise<File> {
    if (request.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const cached = await catalogOfflineRepository.asset(request.scope, request.asset.content_hash);
    if (cached?.state === "verified") {
      try {
        const file = await referenceImageRepository.read(request.scope, request.asset);
        await catalogOfflineRepository.markAssetAccessed(request.scope, request.asset.content_hash);
        return file;
      } catch {
        // A stale metadata row is repaired by the shared network path below.
      }
    }
    const key = `${request.scope.scopeKey}:${request.asset.content_hash}`;
    let shared = this.shared.get(key);
    if (!shared) {
      shared = new Promise<File>((resolve, reject) => {
        // A consumer abort only detaches that consumer. It must not cancel a
        // deduplicated transfer that another card or download job still uses.
        this.queued.push({ ...request, signal: undefined, key, resolve, reject });
        this.queued.sort((left, right) => PRIORITY[left.priority] - PRIORITY[right.priority]);
        this.pump();
      }).finally(() => this.shared.delete(key));
      this.shared.set(key, shared);
    }
    if (!request.signal) return shared;
    return Promise.race([
      shared,
      new Promise<File>((_, reject) => {
        request.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
    ]);
  }

  private pump() {
    while (this.running < this.maxRequests) {
      const index = this.queued.findIndex((task) => {
        if (task.priority !== "bulk") return true;
        return this.runningBulk < this.maxBulk && syncStatusStore.get().state !== "syncing";
      });
      if (index < 0) return;
      const [task] = this.queued.splice(index, 1);
      this.running += 1;
      if (task.priority === "bulk") this.runningBulk += 1;
      void this.run(task).finally(() => {
        this.running -= 1;
        if (task.priority === "bulk") this.runningBulk -= 1;
        this.pump();
      });
    }
  }

  private async run(task: QueueTask) {
    try {
      const blob = await getPublishedReferenceAsset(
        task.asset,
        task.releaseId,
        task.familySlug,
        task.signal,
      );
      await referenceImageRepository.verifyDownload(task.asset, blob);
      const localPath = await referenceImageRepository.save(task.scope, task.asset, blob);
      await catalogOfflineRepository.upsertVerifiedAsset(task.scope, task.asset, task.variant, localPath);
      task.resolve(await referenceImageRepository.read(task.scope, task.asset));
    } catch (error) {
      task.reject(error);
    }
  }
}

export const catalogReferenceLoader = new CatalogReferenceLoader();
