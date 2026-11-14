import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CubeIcon,
  ExitIcon,
  PersonIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { isAdmin } from "@/shared/access/authorization";
import { useAuth } from "@/shared/auth/use-auth";
import { isPathActive, isPrimaryNavigationActive } from "@/shared/lib/navigation/is-path-active";
import {
  managementNavigationItems,
  primaryNavigationItems,
  toolsNavigationItems,
  visibleNavigationItems,
  type NavigationItem,
} from "./navigation-items";

const SIDEBAR_STORAGE_KEY = "tanzim:desktop-sidebar-collapsed";
const OPERATION_ITEM_IDS = new Set(["invoices", "counterparties", "activity"]);

function initialCollapsedState() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

function SidebarLink({ item, active, collapsed }: { item: NavigationItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      className="desktop-sidebar-link"
      data-active={active}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
    >
      <span className="desktop-sidebar-active-marker" aria-hidden="true" />
      <span className="desktop-sidebar-link-icon" aria-hidden="true">
        <Icon width="20" height="20" />
      </span>
      <span className="desktop-sidebar-label">{item.label}</span>
    </Link>
  );
}

function SidebarGroup({
  label,
  items,
  pathname,
  collapsed,
  primary = false,
}: {
  label: string;
  items: NavigationItem[];
  pathname: string;
  collapsed: boolean;
  primary?: boolean;
}) {
  return (
    <section className="desktop-sidebar-group" aria-label={label}>
      <span className="desktop-sidebar-group-label" aria-hidden={collapsed}>{label}</span>
      <div className="desktop-sidebar-group-items">
        {items.map((item) => {
          const active = primary
            ? item.id === "tools"
              ? pathname === "/tools"
              : isPrimaryNavigationActive(pathname, item.to)
            : isPathActive(pathname, item.to);
          return <SidebarLink key={item.id} item={item} active={active} collapsed={collapsed} />;
        })}
      </div>
    </section>
  );
}

export default function DesktopSidebar() {
  const [collapsed, setCollapsed] = useState(initialCollapsedState);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { user, logout } = useAuth();

  const primaryItems = primaryNavigationItems(user);
  const operationItems = visibleNavigationItems(toolsNavigationItems, user).filter((item) =>
    OPERATION_ITEM_IDS.has(item.id),
  );
  const managementItems = isAdmin(user)
    ? [{ ...managementNavigationItems[0], id: "management-home", label: "مدیریت سامانه", to: "/management" as const }]
    : [];
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "کاربر تنظیم";
  const storeName = user?.store_name?.trim() || "مجموعه من";

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <aside
      className="app-desktop-sidebar"
      data-collapsed={collapsed}
      dir="rtl"
      aria-label="ناوبری دسکتاپ"
    >
      <div className="desktop-sidebar-brand-row">
        <Link to="/dashboard" className="desktop-sidebar-brand" aria-label="تنظیم؛ داشبورد">
          <span className="desktop-sidebar-logo" aria-hidden="true">
            <img src="/favicon-48.png" alt="" />
          </span>
          <span className="desktop-sidebar-brand-copy">
            <strong>تنظیم</strong>
            <small>مدیریت کسب‌وکار</small>
          </span>
        </Link>
        <button
          type="button"
          className="desktop-sidebar-collapse"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "باز کردن منوی کناری" : "جمع کردن منوی کناری"}
          title={collapsed ? "باز کردن منو" : "جمع کردن منو"}
        >
          {collapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </button>
      </div>

      <div className="desktop-sidebar-store" title={collapsed ? storeName : undefined}>
        <span className="desktop-sidebar-store-icon" aria-hidden="true"><CubeIcon /></span>
        <span className="desktop-sidebar-store-copy">
          <strong>{storeName}</strong>
          <small>فضای کاری فعال</small>
        </span>
      </div>

      <Link to="/inventory/add" className="desktop-sidebar-add" aria-label="افزودن محصول" title={collapsed ? "افزودن محصول" : undefined}>
        <PlusIcon width="20" height="20" aria-hidden="true" />
        <span className="desktop-sidebar-label">افزودن محصول</span>
      </Link>

      <nav className="desktop-sidebar-navigation" aria-label="بخش‌های برنامه">
        <SidebarGroup label="اصلی" items={primaryItems} pathname={pathname} collapsed={collapsed} primary />
        {operationItems.length > 0 ? (
          <SidebarGroup label="عملیات کسب‌وکار" items={operationItems} pathname={pathname} collapsed={collapsed} />
        ) : null}
        {managementItems.length > 0 ? (
          <SidebarGroup label="مدیریت" items={managementItems} pathname={pathname} collapsed={collapsed} />
        ) : null}
      </nav>

      <div className="desktop-sidebar-footer">
        <div className="desktop-sidebar-account">
          <Link to="/setting/profile" className="desktop-sidebar-user" aria-label={`پروفایل ${displayName}`} title={collapsed ? displayName : undefined}>
            <span className="desktop-sidebar-user-avatar" aria-hidden="true"><PersonIcon /></span>
            <span className="desktop-sidebar-user-copy">
              <strong>{displayName}</strong>
              <small>{user?.store_role_name || "حساب کاربری"}</small>
            </span>
          </Link>
          <button type="button" className="desktop-sidebar-logout" onClick={logout} aria-label="خروج از حساب" title="خروج از حساب">
            <ExitIcon aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
