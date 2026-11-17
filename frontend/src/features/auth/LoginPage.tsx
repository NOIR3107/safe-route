import { useQuery } from "@tanstack/react-query";
import { Building2, Globe, LayoutDashboard, LogIn, Moon, ShieldCheck, Smartphone, Sun, Truck, UserCog, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, apiMode } from "@/api/client";
import type { UserRole } from "@/api/schemas";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/Logo";
import { Badge, Input, Label } from "@/components/ui/primitives";
import { useLogin, useSession } from "@/hooks/session";
import { homeFor, ROLE_LABEL } from "@/lib/rbac";
import { errorMessage } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";

const ROLE_INFO: Record<UserRole, { icon: LucideIcon; blurb: string }> = {
  "Evacuation Coordinator": { icon: LayoutDashboard, blurb: "Generate, approve and override plans; run drills" },
  "Emergency Authority": { icon: ShieldCheck, blurb: "Incident command, approvals and audit log" },
  Admin: { icon: UserCog, blurb: "Everything, including users and audit" },
  "Shelter Manager": { icon: Building2, blurb: "Own shelter only: check-in, walk-ins, reunification" },
  "Transport Coordinator": { icon: Truck, blurb: "Fleet and route status; read-only plan" },
  "Response Team": { icon: Smartphone, blurb: "Mobile field tasks with offline sync" },
};
const ORDER: UserRole[] = ["Evacuation Coordinator", "Emergency Authority", "Shelter Manager", "Response Team", "Transport Coordinator", "Admin"];

export function LoginPage() {
  const { user } = useSession();
  const login = useLogin();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const { data: accounts } = useQuery({ queryKey: ["demoAccounts"], queryFn: () => api.demoAccounts(), staleTime: Infinity });
  const [email, setEmail] = useState("coordinator@saferoute.org");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const doLogin = async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(e, p);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...(accounts ?? [])].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));

  return (
    <div className="grid min-h-full bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="absolute right-4 top-4 z-10">
        <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>

      <div className="flex flex-col px-6 py-10 sm:px-12 lg:px-16">
        <div className="flex items-center gap-3">
          <LogoMark className="size-9" />
          <div className="leading-tight">
            <h1 className="text-lg font-semibold tracking-[-0.01em]">SafeRoute</h1>
            <p className="text-[13px] text-muted">Disaster Evacuation &amp; Shelter Allocation</p>
          </div>
        </div>

        <div className="my-auto w-full max-w-sm py-12">
          <p className="text-[15px] leading-relaxed text-muted">
            A decision-support system: it <span className="text-fg">proposes</span> optimal, explainable evacuation plans and re-plans live as roads close and shelters fill. A human coordinator{" "}
            <span className="text-fg">approves or overrides</span>.
          </p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void doLogin(email, password);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
            </div>
            {error ? (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger-fg">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              <LogIn /> Sign in
            </Button>
          </form>
        </div>

        <Link to="/public" className="group inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-fg">
          <Globe className="size-4" aria-hidden />
          <span className="underline decoration-border underline-offset-4 group-hover:decoration-fg">Evacuee? Find your shelter (English · हिन्दी · தமிழ்)</span>
        </Link>
      </div>

      <div className="flex flex-col justify-center border-t border-border bg-surface px-6 py-10 sm:px-12 lg:border-t-0 lg:border-l lg:px-16">
        <div className="mx-auto w-full max-w-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">Demo mode: sign in as a role</h2>
            <Badge tone={apiMode === "mock" ? "violet" : "ok"}>{apiMode === "mock" ? "Mock API · seeded Chennai flood" : "Live API"}</Badge>
          </div>
          <p className="mt-1.5 text-[13px] text-muted">One click per role to see role-based access in action. Switch any time from the top bar.</p>
          <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {sorted.map((a) => {
              const info = ROLE_INFO[a.role];
              return (
                <li key={a.email}>
                  <button
                    onClick={() => void doLogin(a.email, a.password)}
                    disabled={busy}
                    className="group flex w-full cursor-pointer items-center gap-3.5 bg-surface px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:relative focus-visible:z-10 disabled:opacity-60"
                    data-testid={`demo-login-${a.role.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <info.icon className="size-[18px] shrink-0 text-muted transition-colors group-hover:text-fg" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">{ROLE_LABEL[a.role]}</span>
                      <span className="mt-0.5 block text-xs text-muted">{info.blurb}</span>
                    </span>
                    <span className="hidden truncate text-xs text-muted sm:block">{a.email}</span>
                    <LogIn className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
