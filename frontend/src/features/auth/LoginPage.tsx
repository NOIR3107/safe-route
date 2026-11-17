import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Moon, Sun } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/api/client";
import type { UserRole } from "@/api/schemas";
import type { DemoAccount } from "@/api/SafeRouteApi";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/Logo";
import { Input, Label } from "@/components/ui/primitives";
import { useLogin, useSession } from "@/hooks/session";
import { homeFor, ROLE_LABEL } from "@/lib/rbac";
import { cn, errorMessage } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

const ROLE_BLURB: Record<UserRole, string> = {
  "Evacuation Coordinator": "Generate, approve and override plans. Run drills.",
  "Emergency Authority": "Incident command, approvals and the audit log.",
  Admin: "Everything, including users and audit.",
  "Shelter Manager": "One shelter: check-in, walk-ins, reunification.",
  "Transport Coordinator": "Fleet and road status. Reads the plan.",
  "Response Team": "Field tasks on a phone, with offline sync.",
  "Relief Staff": "Dashboard, plan and shelters, read-only.",
  "NGO Volunteer": "Dashboard, plan and shelters, read-only.",
};

const GROUPS: { title: string; roles: UserRole[] }[] = [
  { title: "Command", roles: ["Evacuation Coordinator", "Emergency Authority", "Admin"] },
  { title: "Field", roles: ["Shelter Manager", "Response Team", "Transport Coordinator"] },
  { title: "Read-only", roles: ["Relief Staff", "NGO Volunteer"] },
];

export function LoginPage() {
  const { user } = useSession();
  const login = useLogin();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const { data: accounts } = useQuery({ queryKey: ["demoAccounts"], queryFn: () => api.demoAccounts(), staleTime: Infinity });
  const [email, setEmail] = useState("coordinator@saferoute.org");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const expired = useAuthStore((s) => s.expired);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const doLogin = async (e: string, p: string) => {
    setBusy(e);
    setError(null);
    try {
      await login(e, p);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const byRole = new Map<UserRole, DemoAccount>((accounts ?? []).map((a) => [a.role, a]));
  const hasDemo = (accounts ?? []).length > 0;

  return (
    <div className={cn("grid min-h-[100dvh] bg-bg", hasDemo && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]")}>
      <div className="flex flex-col px-6 py-6 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between">
          <Link to="/" className="group inline-flex items-center gap-2 text-[13.5px] text-muted transition-colors hover:text-fg">
            <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
            Home
          </Link>
          <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
        </header>

        <div className="mx-auto my-auto w-full max-w-[360px] animate-rise py-14">
          <LogoMark className="size-10" />
          <h1 className="mt-7 text-[1.9rem] leading-tight font-semibold tracking-[-0.035em]">Sign in to SafeRoute</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">For coordinators, shelter staff and field teams.</p>

          {expired ? (
            <p role="status" className="mt-7 rounded-md border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-warn-fg" data-testid="session-expired">
              Your session has ended. Sign-ins last 8 hours, or the server no longer accepts this one. Please sign in again.
            </p>
          ) : null}

          <form
            className="mt-9 space-y-5"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void doLogin(email, password);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[13px] text-fg">Email</Label>
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-[15px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[13px] text-fg">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 text-[15px]" />
            </div>
            {error ? (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger-fg">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" className="h-11 w-full text-[14px]" disabled={busy !== null}>
              {busy === email ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-10 text-[13.5px] text-muted">
            Evacuee?{" "}
            <Link to="/public" className="font-medium text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-brand">
              Find your shelter
            </Link>{" "}
            in English, हिन्दी or தமிழ்.
          </p>
        </div>
      </div>

      {hasDemo ? (
        <aside aria-labelledby="demo-title" className="flex flex-col border-t border-border bg-surface px-6 py-12 sm:px-10 lg:border-t-0 lg:border-l lg:px-14 lg:py-12">
          <div className="mx-auto my-auto w-full max-w-[520px]">
            <h2 id="demo-title" className="text-xl font-semibold tracking-[-0.025em]">Try a role</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">Lab accounts for the demo scenario. One click signs you in; switch any time from the top bar.</p>
            <div className="mt-8 space-y-6">
              {GROUPS.map((g) => {
                const list = g.roles.map((r) => byRole.get(r)).filter((a): a is DemoAccount => !!a);
                if (list.length === 0) return null;
                return (
                  <section key={g.title}>
                    <h3 className="text-[12.5px] font-medium text-muted">{g.title}</h3>
                    <ul className="mt-2.5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg/40">
                      {list.map((a) => (
                        <li key={a.email}>
                          <button
                            type="button"
                            onClick={() => void doLogin(a.email, a.password)}
                            disabled={busy !== null}
                            title={a.email}
                            className="group flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:relative focus-visible:z-10 disabled:cursor-wait disabled:opacity-60"
                            data-testid={`demo-login-${a.role.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-[14.5px] font-medium tracking-[-0.01em]">{ROLE_LABEL[a.role].replace(" (read-only)", "")}</span>
                              <span className="mt-0.5 block text-[13px] text-muted">{ROLE_BLURB[a.role]}</span>
                            </span>
                            <ArrowRight className={cn("size-4 shrink-0 text-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand-text", busy === a.email && "animate-pulse text-brand-text")} aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
