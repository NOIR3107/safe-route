import { Baby, Backpack, Clock, ExternalLink, HeartPulse, Home, Languages, LifeBuoy, LogIn, MapPin, Moon, PawPrint, Phone, Pill, Route as RouteIcon, Search, ShieldAlert, Sun, Users, Accessibility, Glasses } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { PublicLookupResult } from "@/api/extensions";
import { ErrorState } from "@/components/common";
import { OpsMap } from "@/components/map/OpsMap";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Skeleton } from "@/components/ui/primitives";
import { usePublicLookup } from "@/hooks/queries";
import { DICTIONARIES, FACILITY_NAMES, LANGUAGE_NAMES, type Dict } from "@/i18n/dictionaries";
import { FACILITY_ICON, ROUTE_STATUS } from "@/lib/semantic";
import { useUiStore, type Lang } from "@/stores/ui";

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
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <ShieldAlert className="size-4" aria-hidden />
          </div>
          <p className="font-semibold">SafeRoute</p>
          <div className="ml-auto flex items-center gap-1">
            <Languages className="size-4 text-muted" aria-hidden />
            <div role="radiogroup" aria-label={t.language} className="flex rounded-lg border border-border bg-surface-2 p-0.5">
              {(Object.keys(LANGUAGE_NAMES) as Lang[]).map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={lang === l}
                  lang={l}
                  onClick={() => setLang(l)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-sm ${lang === l ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg"}`}
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

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6" lang={lang}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-muted">{t.subtitle}</p>
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
          <Input id="lookup" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.placeholder} className="h-11 text-base" inputMode="text" autoComplete="off" />
          <Button type="submit" size="lg" disabled={!input.trim()}>
            <Search /> {t.search}
          </Button>
        </form>
        <p className="-mt-3 text-xs text-muted">{t.tryDemo}</p>

        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn-fg" role="note">
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

        <Card className="p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Phone className="size-4" aria-hidden /> {t.helplines}
          </h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {[
              ["112", t.helpEmergency],
              ["1070", t.helpState],
              ["1913", t.helpCity],
            ].map(([n, label]) => (
              <li key={n}>
                <a href={`tel:${n}`} className="flex items-center justify-between rounded-lg border border-border bg-surface-2/60 px-3 py-2 hover:bg-surface-2">
                  <span className="text-sm">{label}</span>
                  <span className="font-mono text-lg font-semibold">{n}</span>
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
    <Card className="overflow-hidden" data-testid="public-result">
      <div className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          {r.household_id ? t.yourShelter : t.areaShelter} · {r.zone_name} ({r.zone_code})
        </p>
        {r.shelter ? (
          <>
            <h2 className="mt-1 text-xl font-semibold">{r.shelter.name}</h2>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-4" aria-hidden /> {t.location}: {r.shelter.location} ·{" "}
              <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`https://www.openstreetmap.org/?mlat=${r.shelter.latitude}&mlon=${r.shelter.longitude}#map=16/${r.shelter.latitude}/${r.shelter.longitude}`} target="_blank" rel="noreferrer">
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
          <OpsMap
            routes={[{ route_id: 0, source: "", destination: "", distance_km: 1, travel_time: r.route.travel_time, risk_level: "Low", status: r.route.status, ext: { route_id: 0, zone_id: 0, shelter_id: 0, path: r.route.path, via: [] } }]}
            highlightRouteIds={[0]}
            focus={r.route.path}
            showLegend={false}
            className="relative h-full w-full"
          />
        </div>
      ) : null}
      <div className="p-5">
        <h3 className="font-semibold">{t.whatToBring}</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {bring.map((b) => (
            <li key={b.text} className="flex items-start gap-2 text-sm">
              <b.icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              {b.text}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
