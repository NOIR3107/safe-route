import {
  Bell,
  Building2,
  Bus,
  Globe,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Map as MapIcon,
  Menu,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Route as RouteIcon,
  ScanLine,
  ScrollText,
  ShieldAlert,
  Smartphone,
  Sun,
  UserCog,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import type { DisasterSeverity } from "@/api/schemas";
import { Wordmark } from "@/components/Logo";
import { Badge } from "@/components/ui/primitives";
import { useDisasters, useMarkRead, useNotifications } from "@/hooks/queries";
import { useLogin, useSession } from "@/hooks/session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OpsStatus } from "./OpsStatus";
import { ROLE_LABEL, rolesFor, type Permission } from "@/lib/rbac";
import { cn, errorMessage, fmtTime } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { toast } from "sonner";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  staffOnly?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Command",
    items: [
      { to: "/", label: "Command Dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
      { to: "/plan", label: "Allocation Plan", icon: ListChecks, permission: "plan:view" },
      { to: "/plan/versions", label: "Plan Versions", icon: History, permission: "plan:view" },
      { to: "/drill", label: "Simulation / Drill", icon: PlayCircle, permission: "drill:run" },
    ],
  },
  {
    section: "Resources",
    items: [
      { to: "/zones", label: "Zones", icon: MapIcon, staffOnly: true },
      { to: "/shelters", label: "Shelters", icon: Building2, staffOnly: true },
      { to: "/fleet", label: "Vehicles & Teams", icon: Bus, staffOnly: true },
      { to: "/routes", label: "Routes", icon: RouteIcon, staffOnly: true },
    ],
  },
  {
    section: "Operations",
    items: [
      { to: "/checkin", label: "Shelter Check-in", icon: ScanLine, permission: "shelter:checkin" },
      { to: "/field", label: "Field Team", icon: Smartphone, permission: "field:update" },
      { to: "/audit", label: "Audit & Notifications", icon: ScrollText, permission: "audit:read" },
    ],
  },
  {
    section: "About",
    items: [
      { to: "/architecture", label: "Architecture & FRs", icon: Network, staffOnly: true },
      { to: "/public", label: "Public Evacuee Page", icon: Globe },
    ],
  },
];

export function AppShell() {
  const { user, can } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useUiStore((s) => s.navCollapsed);
  const setCollapsed = useUiStore((s) => s.setNavCollapsed);
  if (!user) return <Navigate to="/login" replace />;

  const visible = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => (i.permission ? can(i.permission) : true)),
  })).filter((s) => s.items.length > 0);

  const sidebar = (rail: boolean) => (
    <nav aria-label="Main" className={cn("flex h-full flex-col gap-5 overflow-y-auto pt-5 pb-3", rail ? "px-2" : "px-3")}>
      {visible.map((s) => (
        <div key={s.section}>
          {rail ? <div className="mx-2 mb-2 border-t border-border" aria-hidden /> : <p className="px-2 pb-1 text-xs font-medium text-muted/80">{s.section}</p>}
          <ul className="space-y-0.5">
            {s.items.map((i) => (
              <li key={i.to}>
                <NavLink
                  to={i.to}
                  end={i.to === "/" || i.to === "/plan"}
                  onClick={() => setMobileOpen(false)}
                  title={rail ? i.label : undefined}
                  aria-label={rail ? i.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center gap-2.5 rounded-md py-[7px] text-[13.5px] transition-colors duration-100",
                      rail ? "justify-center px-0" : "px-2",
                      isActive
                        ? cn(
                            "bg-surface-2 font-medium text-fg before:absolute before:inset-y-1.5 before:w-[3px] before:rounded-r-sm before:bg-signal",
                            rail ? "before:-left-2" : "before:-left-3",
                          )
                        : "text-muted hover:bg-surface-2/70 hover:text-fg",
                    )
                  }
                >
                  <i.icon className="size-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
                  {rail ? null : i.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className={cn("mt-auto flex items-center gap-2.5 border-t border-border pt-3 text-xs text-muted", rail ? "-mx-2 justify-center px-2" : "-mx-3 px-5")}>
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-fg ring-1 ring-border">
          {initials(user.name)}
        </span>
        <div className={cn("min-w-0 leading-snug", rail && "sr-only")}>
          <p className="truncate font-medium text-fg">{user.name}</p>
          <p className="truncate">
            {ROLE_LABEL[user.role]}
            {user.scope.shelter_id ? ` · shelter #${user.scope.shelter_id}` : ""}
            {user.scope.team_id ? ` · team #${user.scope.team_id}` : ""}
          </p>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[2000] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">
        Skip to content
      </a>
      <TopBar onMenu={() => setMobileOpen((o) => !o)} menuOpen={mobileOpen} />
      <div className="flex min-h-0 flex-1">
        <aside className={cn("relative hidden shrink-0 border-r border-border bg-surface lg:block", collapsed ? "w-14" : "w-60")}>
          {sidebar(collapsed)}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="absolute top-2 -right-3 z-30 flex size-6 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:text-fg"
          >
            {collapsed ? <PanelLeftOpen className="size-3.5" strokeWidth={1.75} /> : <PanelLeftClose className="size-3.5" strokeWidth={1.75} />}
          </button>
        </aside>
        {mobileOpen ? (
          <div className="fixed inset-0 top-14 z-[900] flex lg:hidden">
            <aside className="w-64 border-r border-border bg-surface shadow-[16px_0_40px_-16px_rgb(0_0_0/0.4)]">{sidebar(false)}</aside>
            <button className="flex-1 bg-black/45" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          </div>
        ) : null}
        <main id="main" className="min-w-0 flex-1 overflow-y-auto" tabIndex={-1}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function TopBar({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const { data: disasters } = useDisasters();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const disaster = disasters?.find((d) => d.status === "Active") ?? disasters?.[0];
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
      {/* The one bold line in the UI: the top edge of every screen carries the incident's severity. */}
      {disaster ? <span aria-hidden className={cn("absolute inset-x-0 -bottom-px h-[2px]", SEVERITY_RULE[disaster.severity])} /> : null}
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMenu} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen}>
        {menuOpen ? <X /> : <Menu />}
      </Button>
      <Wordmark sub="Evacuation Command" className="lg:w-[13.5rem]" />
      {disaster ? (
        <div className="ml-1 hidden min-w-0 items-baseline gap-2.5 border-l border-border pl-4 md:flex">
          <p className="truncate text-[13.5px] font-medium">{disaster.title}</p>
          <span className={cn("text-xs font-medium", SEVERITY_TEXT[disaster.severity])}>{disaster.severity}</span>
        </div>
      ) : null}
      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <OpsStatus />
        <NotificationsMenu />
        <RoleSwitcher />
        <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
}

function NotificationsMenu() {
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const unread = data?.filter((n) => n.status === "Unread").length ?? 0;
  const toneOf = (t: string) => (t === "CRITICAL" ? "danger" : t === "WARNING" || t === "ALERT" ? "warn" : "info") as "danger" | "warn" | "info";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Notifications, ${unread} unread`}>
          <Bell />
          {unread > 0 ? (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[9.5px] font-medium text-white ring-2 ring-surface dark:text-[#1a0605]">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <div className="max-h-96 overflow-y-auto">
          {(data ?? []).slice(0, 15).map((n) => (
            <DropdownMenuItem key={n.notification_id} onSelect={(e) => { e.preventDefault(); if (n.status === "Unread") markRead.mutate(n.notification_id); }} className="items-start">
              <Badge tone={toneOf(n.type)} className="mt-0.5 shrink-0">{n.type}</Badge>
              <div className={cn("min-w-0 text-xs", n.status === "Read" && "opacity-60")}>
                <p className="line-clamp-3">{n.message}</p>
                <p className="mt-0.5 text-muted">{fmtTime(n.timestamp)}</p>
              </div>
            </DropdownMenuItem>
          ))}
          {data && data.length === 0 ? <p className="px-2 py-4 text-center text-sm text-muted">No notifications</p> : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SEVERITY_TEXT: Record<DisasterSeverity, string> = {
  Low: "text-muted",
  Medium: "text-warn-fg",
  High: "text-caution-fg",
  Critical: "text-danger-fg",
};
const SEVERITY_RULE: Record<DisasterSeverity, string> = { Low: "bg-ok", Medium: "bg-warn", High: "bg-caution", Critical: "bg-danger" };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Demo-mode role switcher: instantly re-login as any seeded account to show RBAC. */
function RoleSwitcher() {
  const { user } = useSession();
  const logout = useAuthStore((s) => s.logout);
  const login = useLogin();
  const { data: accounts } = useQuery({ queryKey: ["demoAccounts"], queryFn: () => api.demoAccounts(), staleTime: Infinity });
  const location = useLocation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label="Switch demo role" data-testid="role-switcher">
          <UserCog />
          <span className="hidden max-w-36 truncate md:inline">{user ? ROLE_LABEL[user.role] : "Role"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Demo mode · switch role</DropdownMenuLabel>
        {(accounts ?? []).map((a) => (
          <DropdownMenuItem
            key={a.email}
            disabled={a.email === user?.email}
            onSelect={() => {
              login(a.email, a.password).then(
                (me) => toast.success(`Signed in as ${ROLE_LABEL[me.role]}`),
                (e) => toast.error(errorMessage(e)),
              );
            }}
          >
            <div className="min-w-0">
              <p className="truncate">{ROLE_LABEL[a.role]}</p>
              <p className="truncate text-xs text-muted">{a.email}</p>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout()} data-from={location.pathname}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Route guard: renders an explanatory 403 page (not a redirect) so RBAC is visible in demos. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can, user } = useSession();
  if (can(permission)) return <>{children}</>;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-border bg-surface p-7 text-center">
        <ShieldAlert className="mx-auto size-8 text-muted" strokeWidth={1.5} aria-hidden />
        <h1 className="mt-3 text-lg font-semibold">Access restricted</h1>
        <p className="mt-1 text-sm text-muted">
          {user ? ROLE_LABEL[user.role] : "Your role"} cannot open this screen. Allowed roles:
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {rolesFor(permission).map((r) => (
            <Badge key={r} tone="info">{ROLE_LABEL[r]}</Badge>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">Use the role switcher (top right) to change role in demo mode.</p>
      </div>
    </div>
  );
}
