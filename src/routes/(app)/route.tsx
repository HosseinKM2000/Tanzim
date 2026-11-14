"use client";

import Header from "@/features/app/layout/header";
import NavMenu from "@/features/app/layout/nav-menu";
import ConnectionStatus from "@/features/app/layout/connection-status";
import DesktopSidebar from "@/features/app/layout/desktop-sidebar";

import { isAuthenticated } from "@/shared/api/token-store";
import { Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/(app)")({
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({
        to: "/auth/login",
      });
    }
  },

  component: ProtectedLayout,
});

function ProtectedLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
 
  const hideLayout = pathname === "/industry";

  return (
    <div className="app-shell-frame h-dvh min-h-0 overflow-hidden">
      {hideLayout && (
        <div className="fixed left-3 top-3 z-50">
          <ConnectionStatus />
        </div>
      )}
      {!hideLayout && <Header />}
      <div className="app-shell-body min-h-0 min-w-0">
        {!hideLayout && <DesktopSidebar />}
        <div className="app-shell-main min-h-0 min-w-0">
          <main
            data-scroll-restoration-id="app-shell"
            className="app-shell-content app-route-transition min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
          >
            <Outlet />
          </main>
        </div>
      </div>
      {!hideLayout && <NavMenu />}
    </div>
  );
}
