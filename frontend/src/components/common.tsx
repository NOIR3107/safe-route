import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/api/SafeRouteApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Label, Skeleton, Textarea } from "@/components/ui/primitives";
import { cn, errorMessage } from "@/lib/utils";

export interface HeaderStat {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Colours the value: only for figures that carry a status (e.g. people still at risk). */
  tone?: "danger" | "warn" | "ok";
}

/**
 * Page title row with optional key figures underneath. `icon` is still accepted so callers don't
 * change, but it isn't drawn: the sidebar already shows it next to the same name.
 */
export function PageHeader({ title, description, actions, stats }: { title: string; description?: ReactNode; actions?: ReactNode; icon?: LucideIcon; stats?: HeaderStat[] }) {
  const toneClass = { danger: "text-danger-fg", warn: "text-warn-fg", ok: "text-ok-fg" } as const;
  return (
    <div className="border-b border-border px-4 pt-7 pb-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-[1.65rem] leading-tight font-semibold tracking-[-0.03em]">{title}</h1>
          {description ? <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {stats && stats.length > 0 ? (
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-0">
          {stats.map((st, i) => (
            <div key={st.label} className={cn("min-w-0 sm:pr-8", i > 0 && "sm:border-l sm:border-border sm:pl-8")}>
              <dt className="text-[12px] text-muted">{st.label}</dt>
              <dd className={cn("mt-1 font-mono text-[1.35rem] leading-none font-medium tracking-[-0.03em] tabular-nums", st.tone && toneClass[st.tone])}>{st.value}</dd>
              {st.sub ? <dd className="mt-1.5 text-[12px] text-muted max-sm:hidden">{st.sub}</dd> : null}
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action, className }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <Icon className="mb-1 size-6 text-muted/70" strokeWidth={1.5} aria-hidden />
      <p className="font-medium">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.status === 0;
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <EmptyState
      icon={AlertTriangle}
      title={offline ? "Cannot reach the server" : forbidden ? "Not available for your role" : "This could not be loaded"}
      action={onRetry && !forbidden ? <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : undefined}
    >
      {errorMessage(error)}
    </EmptyState>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Confirmation dialog for irreversible / disruptive actions. Optionally requires a reason. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "danger",
  requireReason,
  reasonLabel = "Reason (logged to the audit trail)",
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "default";
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");
  const invalid = requireReason && reason.trim().length < 10;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason("");
        onOpenChange(o);
      }}
    >
      <DialogContent title={title} description={description}>
        {requireReason ? (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason">{reasonLabel}</Label>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="At least 10 characters" autoFocus />
            {reason.length > 0 && invalid ? <p className="text-xs text-danger-fg">Please give a reason of at least 10 characters.</p> : null}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "default"} disabled={invalid || busy} onClick={() => onConfirm(reason.trim())}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl leading-none font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </div>
  );
}
