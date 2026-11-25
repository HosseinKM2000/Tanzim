import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isOffline: vi.fn(() => false),
  markOffline: vi.fn(),
  markOnline: vi.fn(),
  refreshPending: vi.fn(async () => {}),
  requestBackgroundSync: vi.fn(async () => {}),
  start: vi.fn(),
  subscribe: vi.fn(),
  sync: vi.fn(async () => {}),
  verify: vi.fn(async () => true),
}));

vi.mock("@/shared/lib/infrastructure/network/network-service", () => ({
  networkService: {
    isOffline: mocks.isOffline,
    subscribe: mocks.subscribe,
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

const TWELVE_HOURS = 12 * 60 * 60 * 1000;
let focusListener: EventListener | undefined;

async function startListeners() {
  vi.resetModules();
  const module = await import("@/shared/lib/infrastructure/sync/sync-listener");
  module.startSyncListeners();
  await vi.advanceTimersByTimeAsync(0);
}

describe("sync listener", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    mocks.isOffline.mockReturnValue(false);
    mocks.verify.mockResolvedValue(true);
    mocks.sync.mockResolvedValue(undefined);
    focusListener = undefined;
    vi.spyOn(window, "addEventListener").mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "focus" && typeof listener === "function") focusListener = listener;
    }) as typeof window.addEventListener);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("synchronizes once at startup", async () => {
    await startListeners();
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it("does not synchronize again before twelve hours elapse", async () => {
    await startListeners();
    await vi.advanceTimersByTimeAsync(TWELVE_HOURS - 60 * 1000);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it("synchronizes again once twelve hours have elapsed", async () => {
    await startListeners();
    await vi.advanceTimersByTimeAsync(TWELVE_HOURS);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it("keeps synchronizing every twelve hours", async () => {
    await startListeners();
    await vi.advanceTimersByTimeAsync(TWELVE_HOURS * 3);
    expect(mocks.sync).toHaveBeenCalledTimes(4);
  });

  it("skips the periodic run while offline and resumes when back online", async () => {
    await startListeners();
    mocks.isOffline.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(TWELVE_HOURS);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(mocks.markOffline).toHaveBeenCalled();

    mocks.isOffline.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it("does not re-gate access when a focus trigger joins an in-flight verification", async () => {
    mocks.verify.mockReturnValue(new Promise<boolean>(() => undefined));
    const { startSyncListeners } = await import("@/shared/lib/infrastructure/sync/sync-listener");

    startSyncListeners();
    expect(focusListener).toBeDefined();
    focusListener?.(new Event("focus"));

    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.markOnline).not.toHaveBeenCalled();
  });
});
