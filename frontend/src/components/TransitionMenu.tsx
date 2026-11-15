import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/overlay";
import type { StatusStyle } from "@/lib/semantic";

/**
 * Offers only the legal next states of a state machine. Disruptive transitions (that remove routes or
 * capacity and therefore trigger re-planning) require confirmation and a reason for the audit log.
 */
export function TransitionMenu<S extends string>({
  label,
  options,
  styles,
  disruptive,
  onTransition,
  busy,
  entityName,
}: {
  label: string;
  options: S[];
  styles: Record<S, StatusStyle>;
  disruptive: readonly S[];
  onTransition: (to: S, reason?: string) => void;
  busy?: boolean;
  entityName: string;
}) {
  const [pending, setPending] = useState<S | null>(null);
  if (options.length === 0) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy} aria-label={`${label} for ${entityName}`}>
            {label} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Move to…</DropdownMenuLabel>
          {options.map((o) => {
            const s = styles[o];
            return (
              <DropdownMenuItem key={o} onSelect={() => (disruptive.includes(o) ? setPending(o) : onTransition(o))}>
                <s.icon aria-hidden /> {s.label}
                {disruptive.includes(o) ? <span className="ml-auto text-xs text-muted">re-plans</span> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={pending != null}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Mark ${entityName} as ${pending ? styles[pending].label.toLowerCase() : ""}?`}
        description="This removes capacity or a road from the plan. Affected assignments will be re-planned immediately and a new plan version will be proposed."
        confirmLabel={`Confirm ${pending ? styles[pending].label.toLowerCase() : ""}`}
        requireReason
        busy={busy}
        onConfirm={(reason) => {
          if (pending) onTransition(pending, reason);
          setPending(null);
        }}
      />
    </>
  );
}
