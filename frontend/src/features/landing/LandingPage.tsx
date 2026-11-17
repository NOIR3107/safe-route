/**
 * Public landing page: presents SafeRoute as the JSS University Software Engineering Lab project.
 * Visuals are real screenshots of this app (scripts/landing-shots.mjs), one per theme.
 * Figures are the seeded demo scenario (backend/app/seed), not invented numbers.
 */
import { ArrowRight, ArrowUpRight, Moon, Sun } from "lucide-react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { DICTIONARIES } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";

const REPO = "https://github.com/Tanishq7690/se-project-";
const EASE = [0.16, 1, 0.3, 1] as const;

const SCENARIO = [
  { value: "8", label: "affected zones" },
  { value: "1,537", label: "households" },
  { value: "7", label: "shelters" },
  { value: "40", label: "road corridors" },
  { value: "58", label: "vehicles" },
];

const LOOP = [
  { verb: "Ingest", body: "Road status, shelter occupancy and team positions arrive from the live feed and are stored in PostgreSQL." },
  { verb: "Plan", body: "A min-cost-flow solver gives each household a shelter, a road and a vehicle within hard capacity limits." },
  { verb: "Approve", body: "A coordinator reads why each assignment was made, then approves the version or overrides it." },
  { verb: "Re-plan", body: "When a road floods or a shelter fills, only the affected groups move, and the change is shown as a diff." },
];

const ROLE_GROUPS = [
  {
    group: "Command",
    roles: [
      { name: "Coordinator", line: "Generates, approves and overrides plans. Runs drills." },
      { name: "Incident Commander", line: "Approves plans and reads the audit log." },
      { name: "Admin", line: "Full access, including user and audit records." },
    ],
  },
  {
    group: "Field",
    roles: [
      { name: "Shelter Manager", line: "Checks people in at one shelter and reunites families." },
      { name: "Transport Coordinator", line: "Keeps vehicle and road status current." },
      { name: "Field Team", line: "Works pickups from a phone, and keeps working offline." },
    ],
  },
  {
    group: "Support and public",
    roles: [
      { name: "Relief Staff and NGO Volunteers", line: "Read the plan, shelters and dashboard without changing them." },
      { name: "Evacuees", line: "Find their shelter in English, Hindi or Tamil. No sign-in." },
    ],
  },
];

const TEAM = ["Bhoomika", "Akshita Upadhyay", "Neel Tripathi", "Tanishq Saxena"];

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-bg text-fg">
      <Nav />
      <main>
        <Hero />
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

/* ------------------------------------------------------------------ building blocks */

function Reveal({ children, delay = 0, className, ...rest }: { children: ReactNode; delay?: number } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** A real screenshot of the app, swapped with the page theme. */
function Shot({ name, alt, width, height, className, priority }: { name: string; alt: string; width: number; height: number; className?: string; priority?: boolean }) {
  const common = { width, height, alt, decoding: "async" as const, loading: priority ? ("eager" as const) : ("lazy" as const), className: "block h-auto w-full" };
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-surface shadow-float", className)}>
      <img src={`/landing/${name}-dark.jpg`} {...common} className={cn(common.className, "hidden dark:block")} />
      <img src={`/landing/${name}-light.jpg`} {...common} alt="" aria-hidden className={cn(common.className, "dark:hidden")} />
    </div>
  );
}

function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-5 sm:px-8", className)}>{children}</div>;
}

function SectionTitle({ title, body, className }: { title: string; body?: string; className?: string }) {
  return (
    <Reveal className={cn("max-w-2xl", className)}>
      <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-4xl">{title}</h2>
      {body ? <p className="mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-muted">{body}</p> : null}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ sections */

function Nav() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const links = [
    ["How it works", "#loop"],
    ["Explainability", "#explain"],
    ["Roles", "#roles"],
    ["Engineering", "#engineering"],
    ["Team", "#team"],
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-md">
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
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const rise = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease: EASE } });
  return (
    <section className="relative">
      <Container className="grid items-center gap-12 pt-14 pb-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:pt-20 lg:pb-28">
        <div className="max-w-xl">
          <motion.p {...rise(0)} className="text-[13.5px] text-muted">
            A Software Engineering Lab project, JSS University Noida
          </motion.p>
          <motion.h1 {...rise(0.06)} className="mt-5 text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-5xl lg:text-[3.6rem]">
            Evacuation plans that explain every decision.
          </motion.h1>
          <motion.p {...rise(0.12)} className="mt-6 max-w-[44ch] text-[16.5px] leading-relaxed text-muted">
            SafeRoute gives every household a shelter, road and vehicle, re-plans when roads flood, and leaves the final call to people.
          </motion.p>
          <motion.div {...rise(0.18)} className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="group h-11 px-5 text-[14px]">
              <Link to="/login">
                Sign in
                <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-11 px-5 text-[14px]">
              <Link to="/public">Find my shelter</Link>
            </Button>
          </motion.div>
        </div>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 28, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.15, ease: EASE }}
          className="lg:-mr-[max(0px,calc((100vw-1240px)/2+2rem))]"
        >
          <Shot name="dashboard" alt="SafeRoute command dashboard: map of the Adyar flood zones with shelters, routes and the people still at risk" width={2880} height={1800} priority />
        </motion.div>
      </Container>
    </section>
  );
}

function Scenario() {
  return (
    <section aria-labelledby="scenario-title" className="border-y border-border bg-surface/60">
      <Container className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)] lg:items-center">
        <Reveal>
          <h2 id="scenario-title" className="text-[15px] font-medium">Demo scenario</h2>
          <p className="mt-1 text-[13.5px] text-muted">Adyar River flood, Greater Chennai</p>
        </Reveal>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-5">
          {SCENARIO.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.05}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-mono text-[1.9rem] leading-none font-medium tracking-[-0.03em] tabular-nums">{s.value}</dd>
              <dd className="mt-2 text-[13px] text-muted">{s.label}</dd>
            </Reveal>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function Loop() {
  const reduce = useReducedMotion();
  return (
    <section id="loop" className="scroll-mt-20 py-24 lg:py-32">
      <Container>
        <SectionTitle
          title="One loop, running for the whole incident."
          body="Field reports change the picture every few minutes. SafeRoute keeps the plan in step and asks a person before anything moves."
        />
        <div className="relative mt-16">
          <motion.span
            aria-hidden
            className="absolute top-[7px] left-0 hidden h-px w-full origin-left bg-border-strong md:block"
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 1.2, ease: EASE }}
          />
          <ol className="grid gap-10 md:grid-cols-4 md:gap-8">
            {LOOP.map((step, i) => (
              <Reveal key={step.verb} delay={0.15 + i * 0.12} className="relative">
                <li className="list-none">
                  <span aria-hidden className={cn("relative block size-[15px] rounded-full border-2 bg-bg", i === 2 ? "border-brand" : "border-border-strong")} />
                  <h3 className="mt-6 text-lg font-semibold tracking-[-0.02em]">{step.verb}</h3>
                  <p className="mt-2 max-w-[34ch] text-[14.5px] leading-relaxed text-muted">{step.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
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
      <Container className="grid items-center gap-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Reveal className="order-2 lg:order-1">
          <Shot name="explain" alt="Explanation drawer for one assignment, showing the cost breakdown and the alternatives the planner considered" width={2880} height={1800} />
        </Reveal>
        <div className="order-1 lg:order-2">
          <SectionTitle title="Every assignment comes with its reasons." body="Open any household to see the cost breakdown, the shelters the planner rejected, and the rule that ruled each one out." />
          <dl className="mt-10 space-y-7">
            {points.map((p, i) => (
              <Reveal key={p.title} delay={0.08 * i} className="border-l-2 border-border pl-5 transition-colors hover:border-brand">
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
  return (
    <section id="roles" className="scroll-mt-20 bg-surface/60 py-24 lg:py-32">
      <Container className="grid gap-14 lg:grid-cols-[minmax(0,8fr)_minmax(0,3fr)] lg:items-center">
        <div>
          <SectionTitle title="Eight roles. Each sees only its own job." body="Access is enforced by the API, not just hidden in the interface, and every change is attributed to a person." />
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-3">
            {ROLE_GROUPS.map((g, gi) => (
              <Reveal key={g.group} delay={gi * 0.08}>
                <h3 className="border-b border-border pb-3 text-[13px] font-medium text-muted">{g.group}</h3>
                <ul className="mt-5 space-y-5">
                  {g.roles.map((r) => (
                    <li key={r.name}>
                      <p className="text-[15px] font-medium tracking-[-0.01em]">{r.name}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-muted">{r.line}</p>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal delay={0.1} className="mx-auto w-full max-w-[300px]">
          <Shot name="field" alt="Field team view on a phone, listing pickups with a button to mark everyone picked up" width={780} height={1688} className="rounded-[22px] border-border-strong" />
        </Reveal>
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
  const ta = DICTIONARIES.ta.title;
  const hi = DICTIONARIES.hi.title;
  return (
    <section id="engineering" className="scroll-mt-20 py-24 lg:py-32">
      <Container>
        <SectionTitle title="Built like it has to work on the day." body="The parts that matter in a real incident are the ones tested hardest." />
        <div className="mt-14 grid gap-4 lg:grid-cols-6">
          <Reveal className="flex flex-col rounded-lg border border-border bg-surface p-6 lg:col-span-4 lg:p-8">
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
          </Reveal>
          <Reveal delay={0.08} className="flex flex-col justify-between rounded-lg bg-brand p-6 text-brand-fg lg:col-span-2 lg:p-8">
            <p className="font-mono text-[4.2rem] leading-none font-medium tracking-[-0.05em]">333</p>
            <p className="mt-10 text-[15px] leading-relaxed font-medium">
              backend tests run on every push, against a real PostgreSQL. CI fails below 80% coverage.
            </p>
          </Reveal>
          <Reveal className="overflow-hidden rounded-lg border border-border bg-surface lg:col-span-3">
            <div className="p-6 lg:p-8">
              <h3 className="text-lg font-semibold tracking-[-0.02em]">Drills never touch live data</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">A drill copies the live database and runs there. Inject a flood, speed up time, replay, reset.</p>
            </div>
            <div className="pl-6 lg:pl-8">
              <Shot name="drill" alt="Simulation and drill screen with the event injector and timeline" width={2880} height={1800} className="rounded-r-none rounded-b-none border-r-0 border-b-0 shadow-none" />
            </div>
          </Reveal>
          <Reveal delay={0.08} className="flex flex-col rounded-lg border border-border bg-surface p-6 lg:col-span-3 lg:p-8">
            <h3 className="text-lg font-semibold tracking-[-0.02em]">Live, then offline</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
              Every write is pushed to open screens over a WebSocket. Field teams queue their updates when the network drops and sync when it returns.
            </p>
            <div className="mt-auto pt-10">
              <p className="text-[13px] text-muted">The evacuee page, in the three languages of the scenario:</p>
              <ul className="mt-4 space-y-2.5 text-[1.15rem] leading-snug font-medium tracking-[-0.01em]">
                <li>{DICTIONARIES.en.title}</li>
                <li lang="hi">{hi}</li>
                <li lang="ta">{ta}</li>
              </ul>
            </div>
          </Reveal>
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
              <Reveal key={name} delay={i * 0.06}>
                <li className="list-none text-2xl font-medium tracking-[-0.03em] sm:text-[1.75rem]">{name}</li>
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
        <Reveal className="flex flex-col items-start justify-between gap-8 rounded-xl border border-border bg-surface px-7 py-10 sm:px-10 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Try it with the demo scenario.</h2>
            <p className="mt-2 text-[15px] text-muted">Pick any of the eight lab accounts on the sign-in page.</p>
          </div>
          <Button asChild size="lg" className="group h-11 px-5 text-[14px]">
            <Link to="/login">
              Sign in
              <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Button>
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
