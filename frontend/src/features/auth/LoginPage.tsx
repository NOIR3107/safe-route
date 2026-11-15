import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Globe, LayoutDashboard, LogIn, Moon, ShieldAlert, ShieldCheck, Smartphone, Sun, Truck, UserCog, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, apiMode } from "@/api/client";
import type { UserRole } from "@/api/schemas";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Label } from "@/components/ui/primitives";
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
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <div className="absolute right-4 top-4">
        <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-fg">
              <ShieldAlert className="size-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">SafeRoute</h1>
              <p className="text-sm text-muted">Disaster Evacuation & Shelter Allocation</p>
            </div>
          </div>
          <p className="mt-6 text-muted">
            A decision-support system: it <span className="text-fg">proposes</span> optimal, explainable evacuation plans and re-plans live as roads close and shelters fill. A human coordinator{" "}
            <span className="text-fg">approves or overrides</span>.
          </p>
          <Card className="mt-6 p-5">
            <form
              className="space-y-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void doLogin(email, password);
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-danger-fg">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy}>
                <LogIn /> Sign in
              </Button>
            </form>
          </Card>
          <Link to="/public" className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
            <Globe className="size-4" aria-hidden /> Evacuee? Find your shelter (English · हिन्दी · தமிழ்)
          </Link>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Demo mode: sign in as a role</h2>
            <Badge tone={apiMode === "mock" ? "violet" : "ok"}>{apiMode === "mock" ? "Mock API · seeded Chennai flood" : "Live API"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">One click per role to see role-based access in action. Switch any time from the top bar.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {sorted.map((a) => {
              const info = ROLE_INFO[a.role];
              return (
                <li key={a.email}>
                  <button
                    onClick={() => void doLogin(a.email, a.password)}
                    disabled={busy}
                    className="group flex h-full w-full cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-2/40 p-3 text-left transition-colors hover:border-accent/60 hover:bg-accent/10 disabled:opacity-60"
                    data-testid={`demo-login-${a.role.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <info.icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-1 font-medium">
                        {ROLE_LABEL[a.role]}
                        <ArrowRight className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                      </span>
                      <span className="block text-xs text-muted">{info.blurb}</span>
                      <span className="mt-1 block truncate font-mono text-[11px] text-muted">{a.email}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
