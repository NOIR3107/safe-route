/** Motion building blocks for the landing page. All of them collapse to static under reduced motion. */
import { animate, motion, useInView, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

import { EASE } from "./ease";

export function Reveal({ children, delay = 0, y = 22, className, ...rest }: { children: ReactNode; delay?: number; y?: number } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Headline that rises in word by word, each word masked by its own line box. */
export function WordReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-top">
          <motion.span
            className="inline-block"
            initial={reduce ? false : { y: "105%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, delay: delay + i * 0.06, ease: EASE }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Counts up to `value` the first time it scrolls into view. Keeps the final text for screen readers. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
  useEffect(() => {
    if (!inView || reduce || !ref.current) return;
    const el = ref.current;
    const controls = animate(0, value, { duration: 1.4, ease: EASE, onUpdate: (v) => (el.textContent = fmt(v)) });
    return () => controls.stop();
  }, [inView, reduce, value]);
  return (
    <span ref={ref} className={className}>
      {fmt(value)}
    </span>
  );
}

/** Card whose border and surface light up under the pointer (CSS variables, no re-render). */
export function Spotlight({ children, className, delay, ...rest }: { children: ReactNode; delay?: number } & HTMLMotionProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };
  return (
    <Reveal
      ref={ref}
      delay={delay}
      onPointerMove={onMove}
      className={cn(
        "group/spot relative isolate overflow-hidden rounded-lg border border-border bg-surface",
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100",
        "before:bg-[radial-gradient(420px_circle_at_var(--sx,50%)_var(--sy,50%),color-mix(in_oklab,var(--color-brand)_10%,transparent),transparent_70%)]",
        className,
      )}
      {...rest}
    >
      {children}
    </Reveal>
  );
}

/** A real screenshot of the app, swapped with the page theme. */
export function Shot({ name, alt, width, height, className, priority }: { name: string; alt: string; width: number; height: number; className?: string; priority?: boolean }) {
  const common = { width, height, decoding: "async" as const, loading: priority ? ("eager" as const) : ("lazy" as const) };
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-surface shadow-float", className)}>
      <img src={`/landing/${name}-dark.jpg`} alt={alt} {...common} className="hidden h-auto w-full dark:block" />
      <img src={`/landing/${name}-light.jpg`} alt="" aria-hidden {...common} className="block h-auto w-full dark:hidden" />
    </div>
  );
}
