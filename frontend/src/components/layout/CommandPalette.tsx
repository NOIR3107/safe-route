/** ⌘K / Ctrl+K palette: jump to any screen this role can open, switch theme, sign out. */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CornerDownLeft, LogOut, Moon, Search, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

export interface PaletteLink {
  to: string;
  label: string;
  section: string;
  icon: LucideIcon;
}

interface Item {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  run: () => void;
}

export function CommandPalette({ open, onOpenChange, links }: { open: boolean; onOpenChange: (o: boolean) => void; links: PaletteLink[] }) {
  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const logout = useAuthStore((s) => s.logout);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...links.map((l) => ({ id: l.to, label: l.label, hint: l.section, icon: l.icon, run: () => navigate(l.to) })),
      { id: "theme", label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, hint: "Preference", icon: theme === "dark" ? Sun : Moon, run: () => setTheme(theme === "dark" ? "light" : "dark") },
      { id: "logout", label: "Sign out", hint: "Account", icon: LogOut, run: () => logout() },
    ];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(needle)) : all;
  }, [links, q, theme, navigate, setTheme, logout]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (i: Item | undefined) => {
    if (!i) return;
    onOpenChange(false);
    setQ("");
    i.run();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") setCursor((c) => Math.min(items.length - 1, c + 1));
    else if (e.key === "ArrowUp") setCursor((c) => Math.max(0, c - 1));
    else if (e.key === "Enter") choose(items[cursor]);
    else return;
    e.preventDefault();
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        setQ("");
        setCursor(0);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1000] bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[14vh] left-1/2 z-[1001] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-float focus:outline-none data-[state=open]:animate-[pop-in_180ms_var(--ease-out-quart)]"
        >
          <DialogPrimitive.Title className="sr-only">Jump to</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKey}
              placeholder="Jump to a screen or action…"
              aria-label="Search screens and actions"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={items[cursor] ? `palette-${items[cursor]!.id}` : undefined}
              className="h-13 w-full bg-transparent text-[15px] text-fg placeholder:text-muted focus:outline-none"
            />
          </div>
          <ul ref={listRef} id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
            {items.length === 0 ? <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{q}”.</li> : null}
            {items.map((i, idx) => (
              <li
                key={i.id}
                id={`palette-${i.id}`}
                role="option"
                aria-selected={idx === cursor}
                data-index={idx}
                onPointerMove={() => setCursor(idx)}
                onClick={() => choose(i)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-[14px]", idx === cursor ? "bg-surface-2 text-fg" : "text-fg/85")}
              >
                <i.icon className={cn("size-4 shrink-0", idx === cursor ? "text-brand-text" : "text-muted")} strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
                <span className="text-[12px] text-muted">{i.hint}</span>
                {idx === cursor ? <CornerDownLeft className="size-3.5 text-muted" aria-hidden /> : null}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11.5px] text-muted">
            <span><kbd className="font-mono">↑↓</kbd> move</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">esc</kbd> close</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
