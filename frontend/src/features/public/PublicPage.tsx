import { Baby, Backpack, Clock, ExternalLink, HeartPulse, Home, Languages, LifeBuoy, LogIn, MapPin, Moon, PawPrint, Phone, Pill, Route as RouteIcon, Search, Sun, Users, Accessibility, Glasses } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { PublicLookupResult } from "@/api/extensions";
import { ErrorState } from "@/components/common";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Skeleton } from "@/components/ui/primitives";
import { usePublicLookup } from "@/hooks/queries";
import { DICTIONARIES, FACILITY_NAMES, LANGUAGE_NAMES, type Dict } from "@/i18n/dictionaries";
import { FACILITY_ICON, ROUTE_STATUS } from "@/lib/semantic";
import { useUiStore, type Lang } from "@/stores/ui";

const GlobeView = lazy(() => import("@/components/map/OpsGlobe").then((m) => ({ default: m.GlobeView })));

export function PublicPage() {
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const t = DICTIONARIES[lang];
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const { data, isFetching, error } = usePublicLookup(query);

  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "en";
    };
  }, [lang]);

  return (
    <div className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-2.5 px-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="SafeRoute home">
            <LogoMark />
            <span className="font-semibold tracking-[-0.02em]">SafeRoute</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Languages className="size-4 text-muted" aria-hidden />
            <div role="radiogroup" aria-label={t.language} className="flex rounded-md border border-border bg-bg p-0.5">
              {(Object.keys(LANGUAGE_NAMES) as Lang[]).map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={lang === l}
                  lang={l}
                  onClick={() => setLang(l)}
                  className={`cursor-pointer rounded-[4px] px-2.5 py-1 text-sm transition-colors ${lang === l ? "bg-surface-2 font-medium text-fg ring-1 ring-border" : "text-muted hover:text-fg"}`}
                >
                  {LANGUAGE_NAMES[l]}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-12 pb-16 sm:pt-16" lang={lang}>
        <div className="animate-rise">
          <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.035em] text-balance sm:text-[2.5rem]">{t.title}</h1>
          <p className="mt-3 max-w-[56ch] text-[15.5px] leading-relaxed text-muted">{t.subtitle}</p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setQuery(input.trim());
          }}
          role="search"
        >
          <label htmlFor="lookup" className="sr-only">
            {t.placeholder}
          </label>
          <Input id="lookup" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.placeholder} className="h-13 rounded-lg px-4 text-[16px] shadow-panel" inputMode="text" autoComplete="off" />
          <Button type="submit" size="lg" className="h-13 rounded-lg px-5 text-[15px]" disabled={!input.trim()}>
            <Search /> {t.search}
          </Button>
        </form>
        <p className="-mt-3.5 px-1 text-[12.5px] text-muted">{t.tryDemo}</p>

        <div className="flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3.5 text-[14px] leading-relaxed text-warn-fg" role="note">
          <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t.safety}
        </div>

        <section aria-live="polite">
          {isFetching ? (
            <Skeleton className="h-64" />
          ) : error ? (
            <ErrorState error={error} />
          ) : query && data && data.length === 0 ? (
            <Card className="p-5 text-center text-muted">{t.noResults}</Card>
          ) : (
            <div className="space-y-4">
              {(data ?? []).map((r, i) => (
                <ResultCard key={i} r={r} t={t} lang={lang} />
              ))}
            </div>
          )}
        </section>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Phone className="size-4" aria-hidden /> {t.helplines}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ["112", t.helpEmergency],
              ["1070", t.helpState],
              ["1913", t.helpCity],
            ].map(([n, label]) => (
              <li key={n}>
                <a href={`tel:${n}`} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-bg/50 px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-2">
                  <span className="text-sm">{label}</span>
                  <span className="font-mono text-xl font-medium tracking-[-0.02em]">{n}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <p className="text-center text-xs text-muted">
          <Link to="/login" className="inline-flex items-center gap-1 hover:text-fg">
            <LogIn className="size-3.5" aria-hidden /> {t.staffLogin}
          </Link>
        </p>
      </main>
    </div>
  );
}

function ResultCard({ r, t, lang }: { r: PublicLookupResult; t: Dict; lang: Lang }) {
  const statusText = r.assignment_status === "Completed" ? t.arrived : r.assignment_status === "In Progress" ? t.enRoute : r.assignment_status === "Scheduled" ? t.scheduled : null;
  const bring: { icon: typeof Pill; text: string }[] = [
    { icon: Backpack, text: t.documents },
    { icon: Pill, text: t.medicines },
    { icon: Home, text: t.water },
    { icon: Phone, text: t.phone },
    { icon: Users, text: t.clothes },
  ];
  if (r.household_id == null || r.needs.children) bring.push({ icon: Baby, text: t.children });
  if (r.household_id == null || r.needs.elderly) bring.push({ icon: Glasses, text: t.elderly });
  if (r.needs.accessibility) bring.push({ icon: Accessibility, text: t.mobility });
  if (r.needs.medical) bring.push({ icon: HeartPulse, text: t.medical });
  if (r.household_id == null || r.needs.pets) bring.push({ icon: PawPrint, text: t.pets });

  return (
    <Card className="animate-rise overflow-hidden shadow-float" data-testid="public-result">
      <div className="p-5">
        <p className="text-[13px] font-medium text-muted">
          {r.household_id ? t.yourShelter : t.areaShelter} · {r.zone_name} ({r.zone_code})
        </p>
        {r.shelter ? (
          <>
            <h2 className="mt-1.5 text-[1.5rem] leading-tight font-semibold tracking-[-0.025em]">{r.shelter.name}</h2>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-4" aria-hidden /> {t.location}: {r.shelter.location} ·{" "}
              <a className="inline-flex items-center gap-1 underline decoration-fg/30 underline-offset-4 transition-colors hover:decoration-fg" href={`https://www.openstreetmap.org/?mlat=${r.shelter.latitude}&mlon=${r.shelter.longitude}#map=16/${r.shelter.latitude}/${r.shelter.longitude}`} target="_blank" rel="noreferrer">
                {t.openMap} <ExternalLink className="size-3" aria-hidden />
              </a>
            </p>
            {r.household_id ? (
              <p className="mt-2 text-sm">
                {t.household}: <span className="font-medium">{r.head_name}</span> · {r.people} {t.people}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {statusText ? <Badge tone={r.assignment_status === "Completed" ? "ok" : r.assignment_status === "In Progress" ? "warn" : "info"}>{t.status}: {statusText}</Badge> : null}
              {r.route ? (
                <Badge tone={ROUTE_STATUS[r.route.status].tone}>
                  <RouteIcon /> {t.travelTime}: {r.route.travel_time} {t.minutes}
                </Badge>
              ) : null}
              {r.eta_minutes != null && r.assignment_status === "Scheduled" ? (
                <Badge tone="info">
                  <Clock /> {t.pickupIn} {r.eta_minutes} {t.minutes}
                </Badge>
              ) : null}
            </div>
            <div className="mt-3">
              <p className="text-xs font-medium text-muted">{t.facilities}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {r.shelter.facilities.map((f) => {
                  const Icon = FACILITY_ICON[f];
                  return (
                    <li key={f}>
                      <Badge tone="neutral">
                        <Icon /> {FACILITY_NAMES[lang][f]}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm">{t.notAssigned}</p>
        )}
      </div>
      {r.route && r.shelter ? (
        <div className="h-56 border-y border-border">
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            <GlobeView
              variant="embedded"
              data={{
                routes: [
                  {
                    route_id: 0,
                    source: r.zone_name,
                    destination: r.shelter?.name ?? "",
                    distance_km: 1,
                    travel_time: r.route.travel_time,
                    risk_level: "Low",
                    status: r.route.status,
                    ext: { route_id: 0, zone_id: 0, shelter_id: 0, path: r.route.path, via: [], geometry_source: "osrm" },
                  },
                ],
              }}
              highlightRouteIds={[0]}
              focus={{ kind: "route", id: 0 }}
              className="relative h-full w-full"
            />
          </Suspense>
        </div>
      ) : null}
      <div className="p-5">
        <h3 className="font-semibold">{t.whatToBring}</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {bring.map((b) => (
            <li key={b.text} className="flex items-start gap-2 text-sm">
              <b.icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              {b.text}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
