import { Outlet } from "@tanstack/react-router";

import Header from "./header";
import NavMenu from "./nav-menu";
import DesktopSidebar from "./desktop-sidebar";

export function SectionLayout() {
  return (
    <div className="app-shell-frame h-dvh min-h-0 overflow-hidden">
      <DesktopSidebar />
      <div className="app-shell-main min-h-0 min-w-0">
        <Header />
        <main className="workspace-shell app-responsive-page app-shell-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <NavMenu />
    </div>
  );
}
