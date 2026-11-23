import { useSyncExternalStore } from "react";
import { accessState } from "./access-state";

export function useEntitlementAccess() {
  const revision = useSyncExternalStore(accessState.subscribe, accessState.revision, accessState.revision);
  return { ...accessState.evaluate(revision), revision };
}

export function useEntitlement() {
  return useEntitlementAccess().entitlement;
}
