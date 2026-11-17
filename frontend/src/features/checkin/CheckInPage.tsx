import { CheckCircle2, QrCode, ScanLine, Search, UserPlus, Users, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, PageHeader } from "@/components/common";
import { FacilityIcons, ShelterStatusBadge } from "@/components/status/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Skeleton } from "@/components/ui/primitives";
import { useCheckIn, useReunify, useRoster, useShelters, useWalkIn } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { SHELTER_STATUS } from "@/lib/semantic";
import { cn, fmtNum } from "@/lib/utils";
import type { CheckInResult } from "@/api/SafeRouteApi";

export function CheckInPage() {
  const { user } = useSession();
  const { data: shelters, isLoading } = useShelters();
  const [picked, setPicked] = useState<number | null>(null);
  const shelterId = user?.scope.shelter_id ?? picked ?? shelters?.[0]?.shelter_id ?? null;
  const shelter = shelters?.find((s) => s.shelter_id === shelterId) ?? null;

  return (
    <div>
      <PageHeader
        icon={ScanLine}
        title="Shelter Check-in"
        description={shelter ? `${shelter.name} · ${shelter.location}` : "Token / QR check-in, walk-ins and family reunification"}
        actions={
          !user?.scope.shelter_id && shelters ? (
            <Select aria-label="Shelter" value={shelterId ?? ""} onChange={(e) => setPicked(Number(e.target.value))} className="w-64">
              {shelters.map((s) => (
                <option key={s.shelter_id} value={s.shelter_id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : null
        }
      />
      <div className="grid gap-5 p-4 sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        {isLoading || !shelter ? (
          <Skeleton className="h-40 lg:col-span-2" />
        ) : (
          <Card className="p-5 sm:p-6 lg:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <p className="text-[12.5px] text-muted">Live occupancy</p>
                <p className="mt-1.5 flex items-baseline gap-2">
                  <span className="font-mono text-[2.6rem] leading-none font-medium tracking-[-0.04em] tabular-nums" data-testid="live-occupancy">{fmtNum(shelter.current_occupancy)}</span>
                  <span className="text-[15px] text-muted">of {fmtNum(shelter.capacity)} places</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ShelterStatusBadge status={shelter.display_status} />
                <FacilityIcons available={shelter.available_facilities} />
              </div>
            </div>
            <CapacityBar shelter={shelter} />
          </Card>
        )}
        {shelterId != null ? (
          <>
            <CheckInPanel shelterId={shelterId} />
            <ReunificationPanel />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** One bar for the whole shelter: who is here, who is coming, what is held back, what is free. */
function CapacityBar({ shelter }: { shelter: { capacity: number; current_occupancy: number; inbound: number; reserved: number; available: number; display_status: keyof typeof SHELTER_STATUS; ext: { walk_ins: number } } }) {
  const cap = Math.max(1, shelter.capacity);
  const parts = [
    { key: "present", label: "Present", value: shelter.current_occupancy, cls: SHELTER_BAR[SHELTER_STATUS[shelter.display_status].tone] ?? "bg-ok" },
    { key: "inbound", label: "On the way (planned)", value: shelter.inbound, cls: "bg-info/70" },
    { key: "reserve", label: `Walk-in reserve, ${fmtNum(shelter.ext.walk_ins)} used`, value: shelter.reserved, cls: "bg-fg/25" },
    { key: "free", label: "Free to plan", value: shelter.available, cls: "bg-transparent ring-1 ring-inset ring-border-strong" },
  ];
  return (
    <div className="mt-6">
      <div role="progressbar" aria-label="Occupancy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((shelter.current_occupancy / cap) * 100)} className="flex h-3 gap-[3px]">
        {parts.map((p) =>
          p.value > 0 ? <span key={p.key} className={cn("h-full rounded-[3px] transition-[flex-grow] duration-500", p.cls)} style={{ flexGrow: p.value, flexBasis: 0, minWidth: 4 }} /> : null,
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.key} className="flex items-start gap-2.5">
            <span aria-hidden className={cn("mt-1 size-2.5 shrink-0 rounded-[2px]", p.cls)} />
            <div>
              <dt className="text-[12px] text-muted">{p.label}</dt>
              <dd className="mt-0.5 font-mono text-[15px] font-medium tabular-nums">{fmtNum(p.value)}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

const SHELTER_BAR: Record<string, string> = { ok: "bg-ok", lime: "bg-lime", warn: "bg-warn", caution: "bg-caution", danger: "bg-danger", neutral: "bg-neutral", info: "bg-info", violet: "bg-violet" };

function CheckInPanel({ shelterId }: { shelterId: number }) {
  const { data: roster, error, refetch } = useRoster(shelterId);
  const checkIn = useCheckIn();
  const walkIn = useWalkIn();
  const [token, setToken] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [walkName, setWalkName] = useState("");
  const [walkPeople, setWalkPeople] = useState(2);
  const [qrFor, setQrFor] = useState<string | null>(null);

  const submit = (t: string) => {
    if (!t.trim()) return;
    checkIn.mutate(
      { shelterId, token: t },
      {
        onSuccess: (r) => {
          setResult(r);
          if (r.ok) setToken("");
        },
      },
    );
  };

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <QrCode className="size-4" aria-hidden /> Check in a household
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              submit(token);
            }}
          >
            <Label htmlFor="token" className="sr-only">
              Evacuee token
            </Label>
            <Input id="token" placeholder="Token from slip, e.g. SR-VEL-1234001" value={token} onChange={(e) => setToken(e.target.value)} className="font-mono" autoComplete="off" />
            <Button type="submit" disabled={checkIn.isPending || !token.trim()}>
              Check in
            </Button>
            <Button type="button" variant="secondary" onClick={() => setScanOpen(true)} aria-label="Scan QR code">
              <ScanLine />
            </Button>
          </form>
          {result ? (
            <div role="status" className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm", result.ok ? "border-ok/40 bg-ok/10" : "border-danger/40 bg-danger/10")}>
              {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
              <span>{result.message}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expected arrivals ({roster?.expected.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!roster ? (
            <Skeleton className="h-24" />
          ) : roster.expected.length === 0 ? (
            <EmptyState icon={Users} title="No planned arrivals pending" className="py-6" />
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {roster.expected.slice(0, 60).map((h) => (
                <li key={h.household_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {h.head_name} <span className="font-normal text-muted">+{h.size - 1}</span>
                    </p>
                    <p className="font-mono text-xs text-muted">{h.token}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone={h.status === "Picked Up" ? "warn" : "neutral"}>{h.status === "Picked Up" ? "En route" : "Awaiting pickup"}</Badge>
                    <Button variant="ghost" size="icon-sm" aria-label={`Show QR for ${h.head_name}`} onClick={() => setQrFor(h.token)}>
                      <QrCode />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => submit(h.token)} disabled={checkIn.isPending} data-testid="checkin-expected">
                      Check in
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <UserPlus className="size-4" aria-hidden /> Register walk-in (uses the 10% reserve)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              walkIn.mutate({ shelterId, name: walkName, people: walkPeople }, { onSuccess: (r) => { setResult(r); setWalkName(""); } });
            }}
          >
            <div className="min-w-40 flex-1 space-y-1">
              <Label htmlFor="walk-name">Head of household</Label>
              <Input id="walk-name" value={walkName} onChange={(e) => setWalkName(e.target.value)} placeholder="Name" />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor="walk-n">People</Label>
              <Input id="walk-n" type="number" min={1} max={20} value={walkPeople} onChange={(e) => setWalkPeople(Number(e.target.value))} />
            </div>
            <Button type="submit" variant="secondary" disabled={walkIn.isPending}>
              Register
            </Button>
          </form>
          {roster && roster.present.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted">Recently present</p>
              <ul className="mt-1 space-y-1 text-sm">
                {roster.present.slice(0, 6).map((h) => (
                  <li key={h.household_id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {h.head_name} <span className="text-muted">({h.size})</span>
                    </span>
                    <Badge tone={h.status === "Checked In" ? "ok" : "info"}>{h.walk_in ? "Walk-in" : h.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={qrFor != null} onOpenChange={(o) => !o && setQrFor(null)}>
        <DialogContent title="Evacuee slip QR" description="Printed on the evacuee slip; scan at the shelter gate.">
          {qrFor ? (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={qrFor} size={180} />
              </div>
              <p className="font-mono text-sm">{qrFor}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} onToken={(t) => { setScanOpen(false); setToken(t); submit(t); }} />
    </div>
  );
}

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

/** Camera QR scanning via the BarcodeDetector API where supported; otherwise explains the fallback. */
function ScanDialog({ open, onOpenChange, onToken }: { open: boolean; onOpenChange: (o: boolean) => void; onToken: (t: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });
  const [status, setStatus] = useState("Starting camera…");
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

  useEffect(() => {
    if (!open || !Ctor) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new Ctor({ formats: ["qr_code"] });
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (!videoRef.current) return;
        videoRef.current.srcObject = s;
        void videoRef.current.play();
        setStatus("Point the camera at the evacuee slip QR code");
        const loop = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) return onTokenRef.current(codes[0].rawValue);
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(() => void loop());
        };
        void loop();
      })
      .catch(() => setStatus("Camera unavailable – type the token instead."));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, Ctor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Scan evacuee QR" description={Ctor ? status : "This browser has no QR scanner (BarcodeDetector). Type the token printed under the QR code instead."}>
        {Ctor ? <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black" muted playsInline /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ReunificationPanel() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching, error } = useReunify(debounced);
  return (
    <Card className="self-start">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <Search className="size-4" aria-hidden /> Family reunification
          </CardTitle>
          <p className="text-xs text-muted">Search any person by name, household ID or phone, across all shelters.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="reunify" className="sr-only">
          Search name, household or phone
        </Label>
        <Input id="reunify" placeholder="e.g. Lakshmi, HH-VEL-0001, 98400…" value={q} onChange={(e) => setQ(e.target.value)} />
        {error ? <ErrorState error={error} /> : null}
        {debounced.trim().length < 2 ? (
          <p className="text-sm text-muted">Type at least 2 characters.</p>
        ) : isFetching && !data ? (
          <Skeleton className="h-24" />
        ) : data && data.length === 0 ? (
          <EmptyState title="No one found" className="py-6">Check spelling or try the phone number.</EmptyState>
        ) : (
          <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto" aria-live="polite">
            {(data ?? []).map((h, i) => (
              <li key={`${h.household_id}-${i}`} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{h.member}</p>
                  <Badge tone={h.status === "Checked In" || h.status === "Arrived" ? "ok" : h.status === "Picked Up" ? "warn" : "neutral"}>{h.status}</Badge>
                </div>
                <p className="text-xs text-muted">
                  {h.household_id} · head {h.head_name} · from {h.zone_name}
                </p>
                <p className="text-xs">
                  {h.shelter_name ? (
                    <>
                      At <span className="font-medium">{h.shelter_name}</span>
                    </>
                  ) : h.planned_shelter_name ? (
                    <>
                      Heading to <span className="font-medium">{h.planned_shelter_name}</span>
                    </>
                  ) : (
                    <span className="text-danger-fg">No shelter assigned yet</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
