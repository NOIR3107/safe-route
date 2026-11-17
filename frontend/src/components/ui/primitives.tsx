/** Small shadcn-style primitives: Card, Badge, Input, Label, Textarea, Select, Skeleton, Table, Progress, Kbd. */
import type { HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TdHTMLAttributes, TextareaHTMLAttributes, ThHTMLAttributes } from "react";
import { TONE_CLASSES, type Tone } from "@/lib/semantic";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-none", className)} {...p} />;
}
export function CardHeader({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-3 px-4 pt-3.5 pb-2", className)} {...p} />;
}
export function CardTitle({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  // Titles are plain text: the per-card icons callers pass in are hidden so headings read as one quiet system.
  return <h2 className={cn("flex items-center gap-1.5 text-[13px] font-semibold text-fg [&>svg]:hidden", className)} {...p} />;
}
export function CardDescription({ className, ...p }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-muted", className)} {...p} />;
}
export function CardContent({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...p} />;
}

export function Badge({ tone = "neutral", className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[11.5px] font-medium leading-[18px] whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
        TONE_CLASSES[tone],
        className,
      )}
      {...p}
    />
  );
}

const field =
  "flex w-full rounded-md border border-border bg-surface px-3 text-sm text-fg shadow-[inset_0_1px_0_rgb(0_0_0/0.02)] transition-[border-color,box-shadow] duration-150 placeholder:text-muted/70 hover:border-fg/20 focus-visible:border-fg/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-fg/10 disabled:opacity-50";

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-9 py-1", className)} {...p} />;
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-20 py-2", className)} {...p} />;
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, "h-9 py-1 pr-8 appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat", className)} style={{ backgroundImage: CHEVRON }} {...p}>
      {children}
    </select>
  );
}
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export function Label({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-muted", className)} {...p} />;
}

export function Skeleton({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-surface-2", className)} {...p} />;
}

export function Table({ className, ...p }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...p} />
    </div>
  );
}
export function THead({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-surface-2/50 [&_tr]:border-b [&_tr]:border-border", className)} {...p} />;
}
export function TBody({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />;
}
export function TR({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border/70 transition-colors duration-100", className)} {...p} />;
}
export function TH({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("h-9 px-3 text-left align-middle text-xs font-medium text-muted whitespace-nowrap", className)} {...p} />;
}
export function TD({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle", className)} {...p} />;
}

export function Progress({ value, tone = "info", className, label }: { value: number; tone?: Tone; className?: string; label: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  const bar: Record<Tone, string> = {
    ok: "bg-ok",
    lime: "bg-lime",
    warn: "bg-warn",
    caution: "bg-caution",
    danger: "bg-danger",
    info: "bg-info",
    neutral: "bg-neutral",
    violet: "bg-violet",
  };
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className={cn("h-1.5 w-full overflow-hidden rounded-[2px] bg-surface-2", className)}>
      <div className={cn("h-full rounded-[2px] transition-[width] duration-500 ease-out", bar[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Kbd({ className, ...p }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cn("rounded-sm border border-b-2 border-border bg-surface-2 px-1.5 py-px font-mono text-[11px] text-muted", className)} {...p} />;
}
