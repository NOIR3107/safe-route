/**
 * Public landing page: presents SafeRoute as the JSS University Software Engineering Lab project.
 * Visuals are real screenshots of this app (scripts/landing-shots.mjs), one per theme, plus a live
 * canvas of the re-planning idea (RouteField) and the planner's real cost function (CostPlayground).
 * Figures are the seeded demo scenario (backend/app/seed), not invented numbers.
 */
import { ArrowRight, ArrowUpRight, Moon, Sun } from "lucide-react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { DICTIONARIES } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { CostPlayground } from "./CostPlayground";
import { EASE } from "./ease";
import { CountUp, Reveal, Shot, Spotlight, WordReveal } from "./motion";
import { RouteField } from "./RouteField";

const REPO = "https://github.com/Tanishq7690/se-project-";

const SCENARIO = [
  { value: 8, label: "affected zones" },
  { value: 1537, label: "households" },
  { value: 7, label: "shelters" },
  { value: 40, label: "road corridors" },
  { value: 58, label: "vehicles" },
];

const LOOP = [
  { verb: "Ingest", shot: "drill", body: "Road status, shelter occupancy and team positions arrive from the live feed and are stored in PostgreSQL." },
  { verb: "Plan", shot: "plan", body: "A min-cost-flow solver gives each household a shelter, a road and a vehicle within hard capacity limits." },
  { verb: "Approve", shot: "explain", body: "A coordinator reads why each assignment was made, then approves the version or overrides it." },
  { verb: "Re-plan", shot: "versions", body: "When a road floods or a shelter fills, only the affected groups move, and the change is shown as a diff." },
];

const ROLES: { name: string; line: string; shot: string; phone?: boolean }[] = [
  { name: "Coordinator", line: "Generates, approves and overrides plans. Runs drills.", shot: "dashboard" },
  { name: "Incident Commander", line: "Approves plans and reads the full audit trail.", shot: "audit" },
  { name: "Shelter Manager", line: "Checks people in at one shelter and reunites families.", shot: "checkin" },
  { name: "Transport Coordinator", line: "Keeps every vehicle and road status current.", shot: "fleet" },
  { name: "Field Team", line: "Works pickups from a phone, and keeps working offline.", shot: "field", phone: true },
  { name: "Evacuees", line: "Find their shelter in English, Hindi or Tamil. No sign-in.", shot: "public", phone: true },
];

const TEAM = ["Bhoomika", "Akshita Upadhyay", "Neel Tripathi", "Tanishq Saxena"];

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-bg text-fg">
      <Nav />
      <main>
        <Hero />
        <ProductReveal />
        <Scenario />
        <Loop />
        <Explain />
        <Roles />
        <Engineering />
        <Team />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ layout helpers */

function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-5 sm:px-8", className)}>{children}</div>;
}

function SectionTitle({ title, body, className }: { title: string; body?: string; className?: string }) {
  return (
    <Reveal className={cn("max-w-2xl", className)}>
      <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[2.6rem]">{title}</h2>
      {body ? <p className="mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-muted">{body}</p> : null}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ sections */

function Nav() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const { scrollYProgress } = useScroll();
  const links = [
    ["How it works", "#loop"],
    ["Explainability", "#explain"],
    ["Roles", "#roles"],
    ["Engineering", "#engineering"],
    ["Team", "#team"],
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/75 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label="SafeRoute home">
          <LogoMark className="size-7" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">SafeRoute</span>
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="rounded-md px-2.5 py-1.5 text-[13.5px] text-muted transition-colors hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button asChild size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </Container>
      <motion.span aria-hidden style={{ scaleX: scrollYProgress }} className="absolute inset-x-0 -bottom-px h-px origin-left bg-brand" />
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const rise = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease: EASE } });
  return (
    <section className="relative isolate">
      <div className="absolute inset-0 -z-10 opacity-35 [mask-image:linear-gradient(to_bottom,black_55%,transparent)] lg:opacity-100 lg:[mask-image:linear-gradient(to_right,transparent_22%,black_52%),linear-gradient(to_bottom,black_70%,transparent)] lg:[mask-composite:intersect]">
        <RouteField />
      </div>
      <Container className="flex min-h-[min(720px,calc(100dvh-9rem))] flex-col justify-center pt-16 pb-28 lg:pt-20">
        <div className="max-w-[34rem]">
          <motion.p {...rise(0)} className="text-[13.5px] text-muted">
            A Software Engineering Lab project, JSS University Noida
          </motion.p>
          <h1 className="mt-5 text-[2.7rem] leading-[1.02] font-semibold tracking-[-0.045em] sm:text-[3.4rem] lg:text-[4rem]">
            <WordReveal text="Evacuation plans that explain every decision." delay={0.05} />
          </h1>
          <motion.p {...rise(0.35)} className="mt-6 max-w-[42ch] text-[16.5px] leading-relaxed text-muted">
            SafeRoute gives every household a shelter, road and vehicle, re-plans when roads flood, and leaves the final call to people.
          </motion.p>
          <motion.div {...rise(0.45)} className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="group h-11 px-5 text-[14px]">
              <Link to="/login">
                Sign in
                <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-11 bg-surface/80 px-5 text-[14px] backdrop-blur">
              <Link to="/public">Find my shelter</Link>
            </Button>
          </motion.div>
        </div>
      </Container>
      <motion.p {...rise(0.9)} className="absolute right-8 bottom-28 hidden max-w-[19rem] rounded-md border border-border/70 bg-bg/80 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted backdrop-blur-sm lg:block">
        Live sketch: every few seconds a road floods and the people on it re-route to another shelter.
      </motion.p>
    </section>
  );
}

function ProductReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.2"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [0.35, 1]);
  return (
    <section aria-label="Command dashboard" className="relative -mt-20 pb-24 lg:pb-32">
      <Container className="[perspective:1800px]">
        <motion.div ref={ref} style={reduce ? undefined : { rotateX, scale, opacity, transformOrigin: "50% 0%" }} className="will-change-transform">
          <Shot name="dashboard" alt="SafeRoute command dashboard: map of the Adyar flood zones with shelters, routes and the people still at risk" width={2880} height={1800} priority className="rounded-xl" />
        </motion.div>
      </Container>
    </section>
  );
}

function Scenario() {
  return (
    <section aria-labelledby="scenario-title" className="border-y border-border bg-surface/60">
      <Container className="grid gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)] lg:items-center">
        <Reveal>
          <h2 id="scenario-title" className="text-[15px] font-medium">Demo scenario</h2>
          <p className="mt-1 text-[13.5px] text-muted">Adyar River flood, Greater Chennai</p>
        </Reveal>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-5">
          {SCENARIO.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-mono text-[2rem] leading-none font-medium tracking-[-0.04em] tabular-nums">
                <CountUp value={s.value} />
              </dd>
              <dd className="mt-2.5 text-[13px] text-muted">{s.label}</dd>
            </Reveal>
          ))}
        </dl>
      </Container>
    </section>
  );
}

/** Pinned on large screens: the section holds while scrolling walks through the four steps. */
function Loop() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(LOOP.length - 1, Math.floor(v * LOOP.length * 0.9999))));

  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const start = el.getBoundingClientRect().top + window.scrollY;
    const travel = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: start + (travel * (i + 0.5)) / LOOP.length, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section id="loop" className="scroll-mt-16">
      {/* large screens: pinned story */}
      <div ref={ref} className="relative hidden h-[380vh] lg:block">
        <div className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center">
          <Container className="grid grid-cols-[minmax(0,4fr)_minmax(0,8fr)] items-center gap-14">
            <div>
              <h2 className="text-[2.6rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance">One loop, running for the whole incident.</h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-muted">Field reports change the picture every few minutes. SafeRoute keeps the plan in step and asks a person before anything moves.</p>
              <ol className="relative mt-10 space-y-1 pl-6">
                <span aria-hidden className="absolute top-2 bottom-2 left-0 w-px bg-border" />
                <motion.span aria-hidden style={{ scaleY: scrollYProgress }} className="absolute top-2 bottom-2 left-0 w-px origin-top bg-brand" />
                {LOOP.map((s, i) => (
                  <li key={s.verb}>
                    <button type="button" onClick={() => goTo(i)} aria-current={i === active ? "step" : undefined} className="group w-full cursor-pointer py-3 text-left">
                      <span className="flex items-center gap-3">
                        <span className={cn("font-mono text-[12px] tabular-nums transition-colors", i === active ? "text-brand-text" : "text-muted")}>{String(i + 1).padStart(2, "0")}</span>
                        <span className={cn("text-lg font-semibold tracking-[-0.02em] transition-colors duration-300", i === active ? "text-fg" : "text-muted group-hover:text-fg")}>{s.verb}</span>
                      </span>
                      <span className={cn("grid transition-[grid-template-rows,opacity] duration-500 ease-out", i === active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                        <span className="overflow-hidden">
                          <span className="block pt-2 pl-9 text-[14.5px] leading-relaxed text-muted">{s.body}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <div className="relative aspect-[16/10]">
              {LOOP.map((s, i) => (
                <div
                  key={s.shot}
                  aria-hidden={i !== active}
                  className={cn("absolute inset-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]", i === active ? "translate-y-0 opacity-100" : i < active ? "-translate-y-4 opacity-0" : "translate-y-4 opacity-0")}
                >
                  <Shot name={s.shot} alt={`${s.verb}: SafeRoute screen`} width={2880} height={1800} />
                </div>
              ))}
            </div>
          </Container>
        </div>
      </div>

      {/* small screens: plain stack */}
      <Container className="py-24 lg:hidden">
        <SectionTitle title="One loop, running for the whole incident." body="Field reports change the picture every few minutes. SafeRoute keeps the plan in step and asks a person before anything moves." />
        <ol className="mt-12 space-y-14">
          {LOOP.map((s, i) => (
            <Reveal key={s.verb}>
              <li className="list-none">
                <p className="flex items-center gap-3">
                  <span className="font-mono text-[12px] text-brand-text">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-lg font-semibold tracking-[-0.02em]">{s.verb}</span>
                </p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
                <Shot name={s.shot} alt={`${s.verb}: SafeRoute screen`} width={2880} height={1800} className="mt-5" />
              </li>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function Explain() {
  const points = [
    { title: "Hard constraints come first", body: "Closed roads, full shelters and missing medical support are never traded away for a shorter trip." },
    { title: "Overrides need a reason", body: "A coordinator can move any household. The reason is written to the audit log." },
    { title: "Nothing moves unapproved", body: "The planner only proposes. Vehicles are dispatched after a person approves the version." },
  ];
  return (
    <section id="explain" className="scroll-mt-20 border-t border-border py-24 lg:py-32">
      <Container className="grid items-center gap-14 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-20">
        <Reveal className="order-2 lg:order-1">
          <CostPlayground />
        </Reveal>
        <div className="order-1 lg:order-2">
          <SectionTitle title="Every assignment comes with its reasons." body="Each option gets one cost, built from terms a person can check. Change the road on the left and watch the planner's arithmetic." />
          <dl className="mt-10 space-y-7">
            {points.map((p, i) => (
              <Reveal key={p.title} delay={0.08 * i} className="border-l-2 border-border pl-5 transition-colors duration-300 hover:border-brand">
                <dt className="text-[15px] font-medium">{p.title}</dt>
                <dd className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{p.body}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}

function Roles() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (active + d + ROLES.length) % ROLES.length;
    setActive(next);
    tabs.current[next]?.focus();
  };
  const role = ROLES[active]!;
  return (
    <section id="roles" className="scroll-mt-20 bg-surface/60 py-24 lg:py-32">
      <Container>
        <SectionTitle title="Eight roles. Each sees only its own job." body="Access is enforced by the API, not just hidden in the interface. Pick a role to see its screen." />
        <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
          <div>
            <div role="tablist" aria-label="Roles" aria-orientation="vertical" onKeyDown={onKey} className="space-y-1">
              {ROLES.map((r, i) => (
                <button
                  key={r.name}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  role="tab"
                  id={`role-tab-${i}`}
                  aria-selected={i === active}
                  aria-controls="role-panel"
                  tabIndex={i === active ? 0 : -1}
                  onClick={() => setActive(i)}
                  className={cn("relative w-full cursor-pointer rounded-md px-4 py-3 text-left transition-colors duration-200", i === active ? "bg-surface shadow-panel ring-1 ring-border" : "hover:bg-surface/70")}
                >
                  {i === active ? <motion.span layoutId="role-rail" aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-sm bg-brand" transition={{ type: "spring", stiffness: 380, damping: 32 }} /> : null}
                  <span className={cn("block text-[15px] font-medium tracking-[-0.01em]", i !== active && "text-muted")}>{r.name}</span>
                  <span className={cn("block text-[13.5px] leading-relaxed text-muted transition-[opacity] duration-300", i === active ? "mt-1 opacity-100" : "h-0 overflow-hidden opacity-0")}>{r.line}</span>
                </button>
              ))}
            </div>
            <p className="mt-6 px-4 text-[13px] leading-relaxed text-muted">Admin has full access. Relief staff and NGO volunteers get a read-only view of the plan, shelters and dashboard.</p>
          </div>
          <div id="role-panel" role="tabpanel" aria-labelledby={`role-tab-${active}`} className="relative h-[460px] sm:h-auto sm:aspect-[16/10]">
            {ROLES.map((r, i) => (
              <div key={r.shot} aria-hidden={i !== active} className={cn("absolute inset-0 flex items-start justify-center transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", i === active ? "scale-100 opacity-100" : "pointer-events-none scale-[0.98] opacity-0")}>
                {r.phone ? (
                  <Shot name={r.shot} alt={`${r.name}: SafeRoute on a phone`} width={780} height={1688} className="h-full w-auto max-w-[260px] rounded-[22px] border-border-strong [&_img]:h-full [&_img]:w-auto [&_img]:object-cover [&_img]:object-top" />
                ) : (
                  <Shot name={r.shot} alt={`${r.name}: SafeRoute screen`} width={2880} height={1800} />
                )}
              </div>
            ))}
            <span className="sr-only">{role.name}</span>
          </div>
        </div>
      </Container>
    </section>
  );
}

const CODE = `sev_w = cfg.severity_weight[group.zone.severity]
congestion = cfg.congestion_factor.get(route.status, 1.0)
travel_cost = route.travel_time * congestion * sev_w

risk = cfg.risk_penalty.get(route.risk_level, 0)
...
total = round1(travel_cost + risk + facility
               + utilization + stability)`;

function Engineering() {
  const [mode, setMode] = useState<"live" | "drill">("live");
  return (
    <section id="engineering" className="scroll-mt-20 py-24 lg:py-32">
      <Container>
        <SectionTitle title="Built like it has to work on the day." body="The parts that matter in a real incident are the ones tested hardest." />
        <div className="mt-14 grid gap-4 lg:grid-cols-6">
          <Spotlight className="flex flex-col p-6 lg:col-span-4 lg:p-8">
            <h3 className="text-lg font-semibold tracking-[-0.02em]">A cost function you can read</h3>
            <p className="mt-2 max-w-[56ch] text-[14.5px] leading-relaxed text-muted">
              Travel time, congestion, zone severity, route risk and shelter fit add up to one number per option. The same terms appear in every explanation.
            </p>
            <figure className="mt-7 overflow-hidden rounded-md border border-border bg-bg">
              <figcaption className="border-b border-border px-4 py-2.5 font-mono text-[12px] text-muted">backend/app/engine/cost.py</figcaption>
              <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7] text-fg/90">
                <code>{CODE}</code>
              </pre>
            </figure>
          </Spotlight>
          <Reveal delay={0.08} className="flex flex-col justify-between rounded-lg bg-brand p-6 text-brand-fg lg:col-span-2 lg:p-8">
            <p className="font-mono text-[4.4rem] leading-none font-medium tracking-[-0.05em]">
              <CountUp value={333} />
            </p>
            <p className="mt-10 text-[15px] leading-relaxed font-medium">backend tests run on every push, against a real PostgreSQL. CI fails below 80% coverage.</p>
          </Reveal>
          <Spotlight className="lg:col-span-3">
            <div className="flex flex-wrap items-start justify-between gap-4 p-6 lg:p-8">
              <div className="max-w-sm">
                <h3 className="text-lg font-semibold tracking-[-0.02em]">Drills never touch live data</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted">A drill copies the live database and runs there, and the top bar says so.</p>
              </div>
              <div role="radiogroup" aria-label="Show the dashboard in" className="flex rounded-md border border-border bg-bg p-0.5">
                {(["live", "drill"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("relative cursor-pointer rounded-[5px] px-3 py-1.5 font-mono text-[11.5px] font-medium uppercase transition-colors", mode === m ? "text-fg" : "text-muted hover:text-fg")}>
                    {mode === m ? <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-[5px] bg-surface-2 ring-1 ring-border" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
                    <span className="relative">{m}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="relative ml-6 aspect-[16/10] lg:ml-8">
              {(["live", "drill"] as const).map((m) => (
                <div key={m} aria-hidden={mode !== m} className={cn("absolute inset-0 transition-opacity duration-500", mode === m ? "opacity-100" : "opacity-0")}>
                  <Shot name={m === "live" ? "dashboard" : "drill-dashboard"} alt={`Dashboard in ${m} mode`} width={2880} height={1800} className="rounded-tr-none rounded-b-none border-r-0 border-b-0 shadow-none" />
                </div>
              ))}
            </div>
          </Spotlight>
          <Spotlight delay={0.08} className="flex flex-col p-6 lg:col-span-3 lg:p-8">
            <h3 className="text-lg font-semibold tracking-[-0.02em]">Live, then offline</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
              Every write is pushed to open screens over a WebSocket. Field teams queue their updates when the network drops and sync when it returns.
            </p>
            <div className="mt-auto pt-10">
              <p className="text-[13px] text-muted">The evacuee page, in the three languages of the scenario:</p>
              <ul className="mt-5 space-y-4 text-[1.55rem] leading-snug font-medium tracking-[-0.02em] [&>li]:border-b [&>li]:border-border [&>li]:pb-4 [&>li:last-child]:border-0 [&>li:last-child]:pb-0">
                <li>{DICTIONARIES.en.title}</li>
                <li lang="hi">{DICTIONARIES.hi.title}</li>
                <li lang="ta">{DICTIONARIES.ta.title}</li>
              </ul>
            </div>
          </Spotlight>
        </div>
      </Container>
    </section>
  );
}

function Team() {
  const links = [
    { label: "Source code", href: REPO },
    { label: "Lab file (PDF)", href: `${REPO}/blob/main/docs/lab-file/SafeRoute_Lab_File.pdf` },
    { label: "Architecture and requirements", href: `${REPO}/blob/main/docs/exp04/exp-04.md` },
  ];
  return (
    <section id="team" className="scroll-mt-20 border-t border-border py-24 lg:py-32">
      <Container className="grid gap-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        <div>
          <SectionTitle title="Made at JSS University, Noida." body="Department of Computer Science and Engineering (AI/ML), Software Engineering Lab." />
          <ul className="mt-12 grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {TEAM.map((name, i) => (
              <Reveal key={name} delay={i * 0.07}>
                <li className="list-none text-2xl font-medium tracking-[-0.03em] sm:text-[1.8rem]">{name}</li>
              </Reveal>
            ))}
          </ul>
        </div>
        <Reveal delay={0.1} className="lg:pt-2">
          <h3 className="text-[13px] font-medium text-muted">Documentation</h3>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {links.map((l) => (
              <li key={l.label}>
                <a href={l.href} target="_blank" rel="noreferrer" className="group flex items-center justify-between py-4 text-[15px] transition-colors hover:text-brand-text">
                  {l.label}
                  <ArrowUpRight className="size-4 text-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-text" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}

function Closing() {
  return (
    <section className="pb-24 lg:pb-32">
      <Container>
        <Reveal className="relative isolate overflow-hidden rounded-xl border border-border bg-surface">
          <div className="absolute inset-0 -z-10 opacity-70 [mask-image:linear-gradient(to_right,transparent_30%,black_75%)]">
            <RouteField xStart={0.3} people={50} interactive={false} />
          </div>
          <div className="flex flex-col items-start gap-8 px-7 py-14 sm:px-12 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-[2rem]">Try it with the demo scenario.</h2>
              <p className="mt-2 text-[15px] text-muted">Pick any of the eight lab accounts on the sign-in page.</p>
            </div>
            <Button asChild size="lg" className="group h-11 px-5 text-[14px]">
              <Link to="/login">
                Sign in
                <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <Container className="flex flex-col gap-4 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-5" />
          <span>SafeRoute does not predict disasters. It plans the response once one is declared.</span>
        </div>
        <div className="flex gap-5">
          <Link to="/public" className="transition-colors hover:text-fg">Find my shelter</Link>
          <a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">GitHub</a>
        </div>
      </Container>
    </footer>
  );
}
