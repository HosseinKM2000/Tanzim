import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { accessState } from "@/shared/access/access-state";
import { useEntitlementAccess } from "@/shared/access/use-entitlement";

describe("useEntitlementAccess", () => {
  afterEach(() => {
    accessState.clear();
    accessState.useOfflineSnapshot();
  });

  it("publishes verification state changes to mounted consumers", () => {
    const now = new Date().toISOString();
    accessState.saveUser({
      id: 1,
      first_name: "Test",
      last_name: "Owner",
      username: "owner",
      email: null,
      phone: "09120000000",
      industry_id: 1,
      plan: "free",
      is_active: true,
      is_admin: false,
      role: "USER",
      is_system_admin: false,
      is_store_owner: true,
      store_id: 2,
      membership_id: 3,
      store_operating_mode: "solo",
      store_policy_version: 1,
      subscription_started_at: null,
      subscription_expires_at: null,
      created_at: now,
    });
    accessState.saveEntitlement({
      user_id: 1,
      store_id: 2,
      plan: "free",
      label: "Test",
      status: "active",
      account_status: "active",
      started_at: null,
      expires_at: null,
      server_time: now,
      synced_at: now,
      capabilities: { "inventory.read": true },
      limits: { inventory_items: null },
    });
    const { result } = renderHook(() => useEntitlementAccess());

    expect(result.current.requiresOnlineVerification).toBe(false);
    const initialRevision = result.current.revision;

    act(() => accessState.requireOnlineVerification());
    expect(result.current.requiresOnlineVerification).toBe(true);
    expect(result.current.revision).toBeGreaterThan(initialRevision);

    act(() => accessState.useOfflineSnapshot());
    expect(result.current.requiresOnlineVerification).toBe(false);
  });
});
