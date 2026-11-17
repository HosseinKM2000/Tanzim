import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markOffline: vi.fn(),
  markOnline: vi.fn(),
  refreshPending: vi.fn(),
  requestBackgroundSync: vi.fn(),
  start: vi.fn(),
  sync: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/shared/lib/infrastructure/network/network-service", () => ({
  networkService: {
    isOffline: () => false,
    subscribe: vi.fn(),
  },
}));
vi.mock("@/shared/access/entitlement-service", () => ({
  entitlementService: {
    start: mocks.start,
    markOffline: mocks.markOffline,
    markOnline: mocks.markOnline,
    verify: mocks.verify,
  },
}));
vi.mock("@/shared/lib/infrastructure/sync/sync-service", () => ({
  syncService: {
    refreshPending: mocks.refreshPending,
    sync: mocks.sync,
  },
}));
vi.mock("@/shared/lib/infrastructure/sync/background-sync", () => ({
  BACKGROUND_SYNC_TAG: "inventory-background-sync",
  requestBackgroundSync: mocks.requestBackgroundSync,
}));

describe("sync listener entitlement verification", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.verify.mockReturnValue(new Promise<boolean>(() => undefined));
  });

  it("does not re-gate access when a focus trigger joins an in-flight verification", async () => {
    const { startSyncListeners } = await import("@/shared/lib/infrastructure/sync/sync-listener");

    startSyncListeners();
    window.dispatchEvent(new Event("focus"));

    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.markOnline).not.toHaveBeenCalled();
  });
});
