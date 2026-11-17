import { cn } from "@/lib/utils";

/**
 * SafeRoute mark: a person, the route out, and the arrow of an exit sign, in exit-sign green.
 * Same drawing as public/favicon.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-7 shrink-0", className)}>
      <rect width="64" height="64" rx="12" fill="var(--color-brand)" />
      <path d="M18 46h10l8-14 10 0" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
      <path d="M38 24l8 8-8 8" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
      <circle cx="22" cy="20" r="5" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className, sub }: { className?: string; sub?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-none">
        <p className="text-[15px] font-semibold tracking-[-0.01em]">SafeRoute</p>
        {sub ? <p className="mt-1 text-[11px] text-muted">{sub}</p> : null}
      </div>
    </div>
  );
}
