import { ApiError } from "@/shared/api/api-error";
import { accessState } from "@/shared/access/access-state";
import { networkService } from "@/shared/lib/infrastructure/network/network-service";
import { storageQuotaService } from "@/shared/lib/infrastructure/storage/storage-quota.service";

import { getCatalogFamilies, getCatalogFamilyManifest, getCurrentCatalogRelease } from "./catalog-offline.api";
import { catalogOfflineRepository } from "./catalog-offline.repository";
import { catalogReferenceLoader } from "./catalog-reference-loader";
import { referenceImageRepository } from "./reference-image.repository";
import { currentCatalogScope } from "./scope";
import type {
  CatalogDownloadEntry,
  CatalogDownloadJob,
  CatalogFamilySummary,
  CatalogManifestAsset,
  CatalogOfflineScope,
} from "./types";

const controllers = new Map<string, AbortController>();
const activeScopes = new Map<string, string>();
const MAX_ATTEMPTS = 3;
const CACHE_BUDGET = Number(import.meta.env.VITE_CATALOG_REFERENCE_CACHE_BYTES) || 64 * 1024 * 1024;

function permanent(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

function entryAsset(entry: CatalogDownloadEntry): CatalogManifestAsset {
  return {
    asset_id: entry.assetId,
    content_hash: entry.contentHash,
    storage_key: entry.storageKey,
    byte_size: entry.byteSize,
    width: entry.width,
    height: entry.height,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "CATALOG_DOWNLOAD_FAILED";
}

async function delay(attempt: number, signal: AbortSignal) {
  const milliseconds = Math.min(8_000, 400 * (2 ** attempt)) + Math.floor(Math.random() * 250);
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

async function runEntry(job: CatalogDownloadJob, entry: CatalogDownloadEntry, signal: AbortSignal) {
  let attempts = entry.attempts;
  while (attempts < MAX_ATTEMPTS) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (currentCatalogScope()?.scopeKey !== job.scopeKey) throw new Error("CATALOG_DOWNLOAD_SCOPE_CHANGED");
    attempts += 1;
    await catalogOfflineRepository.updateEntry(entry.key, { state: "downloading", attempts, lastError: undefined });
    try {
      await catalogReferenceLoader.load({
        scope: {
          ownerUserId: job.ownerUserId,
          storeId: job.storeId,
          industryId: job.industryId,
          scopeKey: job.scopeKey,
        },
        asset: entryAsset(entry),
        variant: entry.variant,
        releaseId: job.releaseId,
        familySlug: job.familySlug,
        priority: "bulk",
        signal,
      });
      await catalogOfflineRepository.updateEntry(entry.key, { state: "verified", attempts, lastError: undefined });
      const progress = await catalogOfflineRepository.entries(job.id);
      const verified = progress.filter((item) => item.state === "verified");
      const completedBytes = verified.reduce((sum, item) => sum + item.byteSize, 0);
      await catalogOfflineRepository.updateJob(job.id, { completedEntries: verified.length, completedBytes });
      await catalogOfflineRepository.updateFamily(
        { ownerUserId: job.ownerUserId, storeId: job.storeId, industryId: job.industryId, scopeKey: job.scopeKey },
        job.familyId,
        { verifiedAssets: verified.length, verifiedBytes: completedBytes },
      );
      return;
    } catch (error) {
      if (signal.aborted) throw error;
      await catalogOfflineRepository.updateEntry(entry.key, {
        state: "failed",
        attempts,
        lastError: errorMessage(error),
        nextAttemptAt: Date.now() + 400 * (2 ** attempts),
      });
      if (permanent(error) || attempts >= MAX_ATTEMPTS) throw error;
      await delay(attempts, signal);
    }
  }
}

accessState.subscribe(() => {
  const active = currentCatalogScope()?.scopeKey;
  for (const [jobId, scopeKey] of activeScopes) {
    if (scopeKey === active) continue;
    controllers.get(jobId)?.abort();
    controllers.delete(jobId);
    activeScopes.delete(jobId);
    void catalogOfflineRepository.updateJob(jobId, { state: "paused", autoResume: false, lastError: "CATALOG_DOWNLOAD_SCOPE_CHANGED" });
  }
});

export const catalogDownloadService = {
  async discovery(scope: CatalogOfflineScope) {
    if (networkService.isOffline()) throw new Error("CATALOG_DOWNLOAD_REQUIRES_NETWORK");
    const [families, release] = await Promise.all([getCatalogFamilies(), getCurrentCatalogRelease()]);
    if (release) {
      const local = await catalogOfflineRepository.families(scope);
      await Promise.all(local.map((family) => catalogOfflineRepository.updateFamily(scope, family.familyId, {
        updateAvailable: Boolean(family.activeReleaseId && family.activeReleaseId !== release.id),
        state: family.activeReleaseId && family.activeReleaseId !== release.id ? "update_available" : family.state,
      })));
    }
    return { families, release };
  },

  async preflight(scope: CatalogOfflineScope, family: CatalogFamilySummary, includeDetails: boolean) {
    if (networkService.isOffline()) throw new Error("CATALOG_DOWNLOAD_REQUIRES_NETWORK");
    const release = await getCurrentCatalogRelease();
    if (!release || !["published", "superseded"].includes(release.status)) {
      throw new Error("CATALOG_RELEASE_UNAVAILABLE");
    }
    const manifest = await getCatalogFamilyManifest(scope.industryId, release.id, family.slug);
    const staged = await catalogOfflineRepository.stageManifest(scope, {
      familyId: family.id,
      slug: family.slug,
      name: family.name,
    }, manifest, includeDetails);
    const candidates: CatalogDownloadEntry[] = [];
    for (const product of staged.products) {
      for (const [variant, asset] of [["preview", product.preview], ["detail", product.detail]] as const) {
        if (!asset || (variant === "detail" && !includeDetails)) continue;
        if (candidates.some((entry) => entry.contentHash === asset.content_hash)) continue;
        candidates.push({
          key: "",
          jobId: "",
          scopeKey: scope.scopeKey,
          assetId: asset.asset_id,
          contentHash: asset.content_hash,
          storageKey: asset.storage_key,
          variant,
          byteSize: asset.byte_size,
          width: asset.width,
          height: asset.height,
          state: "pending",
          attempts: 0,
          nextAttemptAt: 0,
          updatedAt: Date.now(),
        });
      }
    }
    const entries: CatalogDownloadEntry[] = [];
    for (const entry of candidates) {
      const known = await catalogOfflineRepository.asset(scope, entry.contentHash);
      if (!known || known.state !== "verified" || !await referenceImageRepository.exists(scope, entryAsset(entry))) {
        entries.push(entry);
      }
    }
    const quota = await storageQuotaService.estimate();
    const totalBytes = entries.reduce((sum, entry) => sum + entry.byteSize, 0);
    return { family, release, manifest, entries, totalBytes, quota, fits: !quota || quota.available >= totalBytes };
  },

  async create(scope: CatalogOfflineScope, family: CatalogFamilySummary, includeDetails: boolean) {
    const plan = await this.preflight(scope, family, includeDetails);
    if (!plan.fits) throw new Error("CATALOG_DOWNLOAD_STORAGE_INSUFFICIENT");
    const id = crypto.randomUUID();
    const now = Date.now();
    const entries = plan.entries.map((entry) => ({ ...entry, jobId: id, key: `${id}:${entry.contentHash}` }));
    const job: CatalogDownloadJob = {
      id,
      scopeKey: scope.scopeKey,
      ownerUserId: scope.ownerUserId,
      storeId: scope.storeId,
      industryId: scope.industryId,
      familyId: family.id,
      familySlug: family.slug,
      familyName: family.name,
      releaseId: plan.release.id,
      releaseVersion: plan.release.version,
      includeDetails,
      state: "queued",
      totalEntries: entries.length,
      completedEntries: 0,
      totalBytes: plan.totalBytes,
      completedBytes: 0,
      retryCount: 0,
      autoResume: true,
      createdAt: now,
      updatedAt: now,
    };
    await catalogOfflineRepository.putJob(job, entries);
    return job;
  },

  async start(jobId: string) {
    const job = await catalogOfflineRepository.job(jobId);
    if (!job) throw new Error("CATALOG_DOWNLOAD_JOB_NOT_FOUND");
    controllers.get(jobId)?.abort();
    const controller = new AbortController();
    controllers.set(jobId, controller);
    activeScopes.set(jobId, job.scopeKey);
    await catalogOfflineRepository.updateJob(jobId, { state: "downloading", lastError: undefined });
    await catalogOfflineRepository.updateFamily(
      { ownerUserId: job.ownerUserId, storeId: job.storeId, industryId: job.industryId, scopeKey: job.scopeKey },
      job.familyId,
      { state: "downloading", lastError: undefined },
    );
    const entries = await catalogOfflineRepository.entries(jobId);
    for (const entry of entries.filter((item) => item.state === "verified")) {
      if (!await referenceImageRepository.exists(
        { ownerUserId: job.ownerUserId, storeId: job.storeId, industryId: job.industryId, scopeKey: job.scopeKey },
        entryAsset(entry),
      )) await catalogOfflineRepository.updateEntry(entry.key, { state: "pending", attempts: 0 });
    }
    const reconciled = await catalogOfflineRepository.entries(jobId);
    const pending = reconciled.filter((entry) => entry.state !== "verified");
    const results = await Promise.allSettled(pending.map((entry) => runEntry(job, entry, controller.signal)));
    if (controller.signal.aborted) return;
    const refreshed = await catalogOfflineRepository.entries(jobId);
    const verified = refreshed.filter((entry) => entry.state === "verified");
    const completedBytes = verified.reduce((sum, entry) => sum + entry.byteSize, 0);
    const failed = results.find((result) => result.status === "rejected");
    if (failed || verified.length !== refreshed.length) {
      const message = failed?.status === "rejected" ? errorMessage(failed.reason) : "CATALOG_DOWNLOAD_PARTIAL";
      await catalogOfflineRepository.updateJob(jobId, {
        state: verified.length ? "partial" : "failed",
        completedEntries: verified.length,
        completedBytes,
        lastError: message,
      });
      await catalogOfflineRepository.updateFamily(
        { ownerUserId: job.ownerUserId, storeId: job.storeId, industryId: job.industryId, scopeKey: job.scopeKey },
        job.familyId,
        { state: verified.length ? "partial" : "failed", verifiedAssets: verified.length, verifiedBytes: completedBytes, lastError: message },
      );
      return;
    }
    const scope = { ownerUserId: job.ownerUserId, storeId: job.storeId, industryId: job.industryId, scopeKey: job.scopeKey };
    await catalogOfflineRepository.updateJob(jobId, { state: "verifying", completedEntries: verified.length, completedBytes });
    await catalogOfflineRepository.activateFamily(scope, job.familyId, job.releaseId);
    await catalogOfflineRepository.updateJob(jobId, { state: "complete", completedEntries: verified.length, completedBytes });
    controllers.delete(jobId);
    activeScopes.delete(jobId);
  },

  async pause(jobId: string) {
    controllers.get(jobId)?.abort();
    controllers.delete(jobId);
    activeScopes.delete(jobId);
    await catalogOfflineRepository.updateJob(jobId, { state: "paused", autoResume: false });
  },

  async cancel(jobId: string) {
    controllers.get(jobId)?.abort();
    controllers.delete(jobId);
    activeScopes.delete(jobId);
    await catalogOfflineRepository.updateJob(jobId, { state: "cancelled", autoResume: false });
  },

  async retry(jobId: string) {
    const entries = await catalogOfflineRepository.entries(jobId);
    await Promise.all(entries.filter((entry) => entry.state === "failed").map((entry) =>
      catalogOfflineRepository.updateEntry(entry.key, { state: "pending", attempts: 0, nextAttemptAt: 0, lastError: undefined })));
    await catalogOfflineRepository.updateJob(jobId, { state: "queued", autoResume: true });
    return this.start(jobId);
  },

  async remove(scope: CatalogOfflineScope, familyId: number) {
    const hashes = await catalogOfflineRepository.removeFamily(scope, familyId);
    for (const hash of hashes) {
      const asset = await catalogOfflineRepository.asset(scope, hash);
      if (asset?.pinCount === 0) {
        await referenceImageRepository.remove(scope, hash);
        await catalogOfflineRepository.deleteAsset(scope, hash);
      }
    }
  },

  async reconcile(scope: CatalogOfflineScope) {
    await referenceImageRepository.cleanupTemporary(scope);
    const jobs = await catalogOfflineRepository.jobs(scope);
    for (const job of jobs) {
      if (job.autoResume && ["queued", "downloading", "verifying"].includes(job.state) && networkService.isOnline()) {
        void this.start(job.id);
      }
    }
  },

  async trimAutomaticCache(scope: CatalogOfflineScope, budget = CACHE_BUDGET) {
    const candidates = await catalogOfflineRepository.unpinnedAssetsOldestFirst(scope);
    let total = candidates.reduce((sum, asset) => sum + asset.byteSize, 0);
    for (const asset of candidates) {
      if (total <= budget) break;
      await referenceImageRepository.remove(scope, asset.contentHash);
      await catalogOfflineRepository.deleteAsset(scope, asset.contentHash);
      total -= asset.byteSize;
    }
  },
};
