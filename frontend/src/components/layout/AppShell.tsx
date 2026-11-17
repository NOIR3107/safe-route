import {
  Bell,
  ChevronRight,
  Search,
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
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
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
import { LogoMark } from "@/components/Logo";
import { CommandPalette } from "./CommandPalette";
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
      { to: "/app", label: "Command Dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
      { to: "/app/plan", label: "Allocation Plan", icon: ListChecks, permission: "plan:view" },
      { to: "/app/plan/versions", label: "Plan Versions", icon: History, permission: "plan:view" },
      { to: "/app/drill", label: "Simulation / Drill", icon: PlayCircle, permission: "drill:run" },
    ],
  },
  {
    section: "Resources",
    items: [
      { to: "/app/zones", label: "Zones", icon: MapIcon, staffOnly: true },
      { to: "/app/shelters", label: "Shelters", icon: Building2, staffOnly: true },
      { to: "/app/fleet", label: "Vehicles & Teams", icon: Bus, staffOnly: true },
      { to: "/app/routes", label: "Routes", icon: RouteIcon, staffOnly: true },
    ],
  },
  {
    section: "Operations",
    items: [
      { to: "/app/checkin", label: "Shelter Check-in", icon: ScanLine, permission: "shelter:checkin" },
      { to: "/app/field", label: "Field Team", icon: Smartphone, permission: "field:update" },
      { to: "/app/audit", label: "Audit & Notifications", icon: ScrollText, permission: "audit:read" },
    ],
  },
  {
    section: "About",
    items: [
      { to: "/app/architecture", label: "Architecture & FRs", icon: Network, staffOnly: true },
      { to: "/public", label: "Public Evacuee Page", icon: Globe },
    ],
  },
];

export function AppShell() {
  const { user, can } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const collapsed = useUiStore((s) => s.navCollapsed);
  const setCollapsed = useUiStore((s) => s.setNavCollapsed);
  const location = useLocation();

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return <Navigate to="/login" replace />;

  const visible = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => (i.permission ? can(i.permission) : true)),
  })).filter((s) => s.items.length > 0);
  const links = visible.flatMap((s) => s.items.map((i) => ({ to: i.to, label: i.label, section: s.section, icon: i.icon })));
  const current = [...links].sort((a, b) => b.to.length - a.to.length).find((l) => location.pathname === l.to || location.pathname.startsWith(`${l.to}/`));

  const sidebar = (rail: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center gap-2.5 border-b border-border", rail ? "justify-center px-2" : "px-4")}>
        <Link to="/app" className="flex min-w-0 items-center gap-2.5" aria-label="SafeRoute home">
          <LogoMark className="size-7" />
          {rail ? null : <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">SafeRoute</span>}
        </Link>
      </div>
      {rail ? null : <IncidentCard />}
      <nav aria-label="Main" className={cn("flex flex-1 flex-col gap-5 overflow-y-auto pt-4 pb-3", rail ? "px-2" : "px-3")}>
        {visible.map((s) => (
          <div key={s.section}>
            {rail ? <div className="mx-2 mb-2 border-t border-border" aria-hidden /> : <p className="px-2.5 pb-1.5 text-[11.5px] font-medium text-muted/80">{s.section}</p>}
            <ul className="space-y-px">
              {s.items.map((i) => (
                <li key={i.to}>
                  <NavLink
                    to={i.to}
                    end={i.to === "/app" || i.to === "/app/plan"}
                    onClick={() => setMobileOpen(false)}
                    title={rail ? i.label : undefined}
                    aria-label={rail ? i.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-2.5 rounded-md py-[7px] text-[13.5px] transition-colors duration-150",
                        rail ? "justify-center px-0" : "px-2.5",
                        isActive ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? <span aria-hidden className={cn("absolute inset-y-1.5 w-[3px] rounded-r-sm bg-brand", rail ? "-left-2" : "-left-3")} /> : null}
                        <i.icon className={cn("size-4 shrink-0 transition-colors", isActive ? "text-brand-text" : "opacity-80")} strokeWidth={1.75} aria-hidden />
                        {rail ? null : i.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn("flex items-center gap-2.5 border-t border-border py-3 text-xs text-muted", rail ? "justify-center px-2" : "px-4")}>
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-fg ring-1 ring-border">
          {initials(user.name)}
        </span>
        <div className={cn("min-w-0 leading-snug", rail && "sr-only")}>
          <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
          <p className="truncate">
            {ROLE_LABEL[user.role]}
            {user.scope.shelter_id ? ` · shelter #${user.scope.shelter_id}` : ""}
            {user.scope.team_id ? ` · team #${user.scope.team_id}` : ""}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[2000] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">
        Skip to content
      </a>
      <aside className={cn("relative hidden shrink-0 border-r border-border bg-surface transition-[width] duration-200 ease-out lg:block", collapsed ? "w-[60px]" : "w-64")}>
        {sidebar(collapsed)}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="absolute top-[18px] -right-3 z-30 flex size-6 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-muted shadow-panel transition-colors hover:text-fg"
        >
          {collapsed ? <PanelLeftOpen className="size-3.5" strokeWidth={1.75} /> : <PanelLeftClose className="size-3.5" strokeWidth={1.75} />}
        </button>
      </aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[900] flex lg:hidden">
          <aside className="w-72 border-r border-border bg-surface shadow-float animate-[sheet-in_220ms_var(--ease-out-quart)] [animation-direction:reverse]">{sidebar(false)}</aside>
          <button className="flex-1 bg-black/45" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMobileOpen((o) => !o)} menuOpen={mobileOpen} section={current?.section} page={current?.label} onSearch={() => setPaletteOpen(true)} />
        <main id="main" className="min-h-0 flex-1 overflow-y-auto" tabIndex={-1}>
          <ErrorBoundary>
            <div key={location.pathname} className="page-enter h-full">
              <Outlet />
            </div>
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} links={links} />
    </div>
  );
}

function IncidentCard() {
  const { data: disasters } = useDisasters();
  const disaster = disasters?.find((d) => d.status === "Active") ?? disasters?.[0];
  if (!disaster) return null;
  return (
    <div className="mx-3 mt-3 rounded-lg border border-border bg-bg/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", SEVERITY_RULE[disaster.severity])} />
        <span className={cn("text-[11.5px] font-medium", SEVERITY_TEXT[disaster.severity])}>{disaster.severity} incident</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug font-medium">{disaster.title}</p>
    </div>
  );
}

function TopBar({ onMenu, menuOpen, section, page, onSearch }: { onMenu: () => void; menuOpen: boolean; section?: string; page?: string; onSearch: () => void }) {
  const { data: disasters } = useDisasters();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const disaster = disasters?.find((d) => d.status === "Active") ?? disasters?.[0];
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/70 px-3 backdrop-blur-md sm:px-5">
      {/* The one bold line in the UI: the top edge of every screen carries the incident's severity. */}
      {disaster ? <span aria-hidden className={cn("absolute inset-x-0 -bottom-px h-[2px]", SEVERITY_RULE[disaster.severity])} /> : null}
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMenu} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen}>
        {menuOpen ? <X /> : <Menu />}
      </Button>
      <Link to="/app" className="lg:hidden" aria-label="SafeRoute home">
        <LogoMark className="size-6" />
      </Link>
      <nav aria-label="Breadcrumb" className="ml-1 hidden min-w-0 items-center gap-1.5 text-[13.5px] sm:flex">
        {section ? <span className="text-muted">{section}</span> : null}
        {section && page ? <ChevronRight className="size-3.5 shrink-0 text-muted/60" aria-hidden /> : null}
        {page ? <span className="truncate font-medium">{page}</span> : null}
      </nav>
      <button
        type="button"
        onClick={onSearch}
        className="ml-auto hidden h-8 w-56 cursor-pointer items-center gap-2 rounded-md border border-border bg-bg/60 px-2.5 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-fg md:flex xl:w-64"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="flex-1 text-left">Jump to…</span>
        <kbd className="rounded-sm border border-border px-1 font-mono text-[10.5px]">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-3 md:ml-3">
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
