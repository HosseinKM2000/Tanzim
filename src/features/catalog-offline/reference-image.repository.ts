import { storageQuotaService } from "@/shared/lib/infrastructure/storage/storage-quota.service";

import type { CatalogManifestAsset, CatalogOfflineScope } from "./types";

const ROOT = "catalog-reference";
const SAFE_HASH = /^[a-f0-9]{64}$/;
const MIME = "image/webp";

async function directory(scope: CatalogOfflineScope, kind: "blobs" | "temporary", create = true) {
  if (!navigator.storage?.getDirectory) throw new Error("CATALOG_REFERENCE_OPFS_UNAVAILABLE");
  const root = await navigator.storage.getDirectory();
  const catalog = await root.getDirectoryHandle(ROOT, { create });
  const account = await catalog.getDirectoryHandle(`user-${scope.ownerUserId}`, { create });
  const store = await account.getDirectoryHandle(`store-${scope.storeId}`, { create });
  const industry = await store.getDirectoryHandle(`industry-${scope.industryId}`, { create });
  return industry.getDirectoryHandle(kind, { create });
}

async function digest(blob: Blob) {
  const value = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertAsset(asset: CatalogManifestAsset) {
  if (!SAFE_HASH.test(asset.content_hash) || asset.byte_size < 1 || !asset.asset_id) {
    throw new Error("CATALOG_REFERENCE_ASSET_INVALID");
  }
}

async function write(dir: FileSystemDirectoryHandle, name: string, blob: Blob) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

async function verifiedFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  asset: CatalogManifestAsset,
  verifyHash: boolean,
) {
  const file = await (await dir.getFileHandle(name)).getFile();
  if (file.size !== asset.byte_size) throw new Error("CATALOG_REFERENCE_SIZE_MISMATCH");
  if (file.type && file.type !== MIME) throw new Error("CATALOG_REFERENCE_MIME_MISMATCH");
  if (verifyHash && await digest(file) !== asset.content_hash) {
    throw new Error("CATALOG_REFERENCE_HASH_MISMATCH");
  }
  return file;
}

function fileName(contentHash: string) {
  if (!SAFE_HASH.test(contentHash)) throw new Error("CATALOG_REFERENCE_HASH_INVALID");
  return `${contentHash}.webp`;
}

export const referenceImageRepository = {
  localPath(scope: CatalogOfflineScope, contentHash: string) {
    return `catalog-reference://${scope.scopeKey}/${fileName(contentHash)}`;
  },

  async verifyDownload(asset: CatalogManifestAsset, blob: Blob) {
    assertAsset(asset);
    if (blob.size !== asset.byte_size) throw new Error("CATALOG_REFERENCE_SIZE_MISMATCH");
    if (blob.type && blob.type !== MIME) throw new Error("CATALOG_REFERENCE_MIME_MISMATCH");
    if (await digest(blob) !== asset.content_hash) throw new Error("CATALOG_REFERENCE_HASH_MISMATCH");
  },

  async save(scope: CatalogOfflineScope, asset: CatalogManifestAsset, blob: Blob) {
    assertAsset(asset);
    await this.verifyDownload(asset, blob);
    await storageQuotaService.ensureAvailable(blob.size);
    const blobs = await directory(scope, "blobs");
    const name = fileName(asset.content_hash);
    try {
      await verifiedFile(blobs, name, asset, true);
      return this.localPath(scope, asset.content_hash);
    } catch {
      // Missing/corrupt content is replaced only after a separately verified
      // temporary write. Metadata is committed by the caller afterwards.
    }
    const temporary = await directory(scope, "temporary");
    const pendingName = `${asset.content_hash}-${crypto.randomUUID()}.pending`;
    await write(temporary, pendingName, blob);
    try {
      await verifiedFile(temporary, pendingName, asset, true);
      await write(blobs, name, blob);
      await verifiedFile(blobs, name, asset, true);
    } catch (error) {
      await blobs.removeEntry(name).catch(() => undefined);
      throw error;
    } finally {
      await temporary.removeEntry(pendingName).catch(() => undefined);
    }
    return this.localPath(scope, asset.content_hash);
  },

  async read(scope: CatalogOfflineScope, asset: CatalogManifestAsset, verifyHash = false) {
    assertAsset(asset);
    return verifiedFile(await directory(scope, "blobs", false), fileName(asset.content_hash), asset, verifyHash);
  },

  async exists(scope: CatalogOfflineScope, asset: CatalogManifestAsset, verifyHash = false) {
    try {
      await this.read(scope, asset, verifyHash);
      return true;
    } catch {
      return false;
    }
  },

  async remove(scope: CatalogOfflineScope, contentHash: string) {
    try {
      await (await directory(scope, "blobs", false)).removeEntry(fileName(contentHash));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }
  },

  async cleanupTemporary(scope: CatalogOfflineScope) {
    try {
      const temporary = await directory(scope, "temporary", false);
      let removed = 0;
      for await (const name of temporary.keys()) {
        await temporary.removeEntry(name).catch(() => undefined);
        removed += 1;
      }
      return removed;
    } catch {
      return 0;
    }
  },
};

export const referenceImageIntegrity = { digest };
