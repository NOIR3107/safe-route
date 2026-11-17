/**
 * Animated background: an evacuation network drawn on a canvas. People (dots) flow from zones
 * (squares) to shelters (rings). Every few seconds one road floods, turns red, and the people on it
 * re-route to another shelter: the re-planning idea of SafeRoute, shown rather than told.
 *
 * Rendering runs outside React (one requestAnimationFrame loop, refs only). It pauses when off-screen
 * or the tab is hidden, and draws one still frame under prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Pt = { x: number; y: number };
interface Road {
  from: number;
  to: number;
  pts: Pt[];
  flooded: number; // 0..1, eased in and out
  floodTarget: 0 | 1;
  glow: number; // pointer proximity, 0..1
}
interface Person {
  road: number;
  t: number;
  speed: number;
  fade: number;
}

const SAMPLES = 60;

// Deterministic so the composition is the same on every visit.
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function bezier(a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

function readColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return { brand: v("--color-brand"), danger: v("--color-danger"), line: v("--color-border-strong"), muted: v("--color-muted"), bg: v("--color-bg") };
}

export function RouteField({ className, xStart = 0.38, people = 80, interactive = true }: { className?: string; xStart?: number; people?: number; interactive?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let colors = readColors();
    let w = 0;
    let h = 0;
    let zones: Pt[] = [];
    let shelters: Pt[] = [];
    let roads: Road[] = [];
    let crowd: Person[] = [];
    const pulse: number[] = [];
    const pointer = { x: -9999, y: -9999 };
    let raf = 0;
    let running = false;
    let visible = true;
    let last = performance.now();
    let nextFlood = 2500;

    function build() {
      const r = rng(7);
      const left = w * xStart;
      const nz = 6;
      const ns = 5;
      zones = Array.from({ length: nz }, (_, i) => ({ x: left + w * (0.04 + r() * 0.16), y: h * (0.12 + (i / (nz - 1)) * 0.76) + (r() - 0.5) * h * 0.06 }));
      shelters = Array.from({ length: ns }, (_, i) => ({ x: w * (0.8 + r() * 0.14), y: h * (0.14 + (i / (ns - 1)) * 0.72) + (r() - 0.5) * h * 0.05 }));
      pulse.length = ns;
      pulse.fill(0);
      roads = [];
      zones.forEach((z, zi) => {
        const near = shelters.map((s, si) => ({ si, d: Math.abs(s.y - z.y) + r() * h * 0.2 })).sort((a, b) => a.d - b.d).slice(0, 3);
        for (const { si } of near) {
          const s = shelters[si]!;
          const dx = s.x - z.x;
          const c1 = { x: z.x + dx * (0.3 + r() * 0.15), y: z.y + (r() - 0.5) * h * 0.18 };
          const c2 = { x: z.x + dx * (0.62 + r() * 0.15), y: s.y + (r() - 0.5) * h * 0.18 };
          const pts = Array.from({ length: SAMPLES + 1 }, (_, k) => bezier(z, c1, c2, s, k / SAMPLES));
          roads.push({ from: zi, to: si, pts, flooded: 0, floodTarget: 0, glow: 0 });
        }
      });
      crowd = Array.from({ length: people }, () => ({ road: Math.floor(r() * roads.length), t: r(), speed: 0.05 + r() * 0.06, fade: 1 }));
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (!running) draw(0);
    }

    function at(road: Road, t: number): Pt {
      const f = Math.min(SAMPLES - 1e-6, Math.max(0, t * SAMPLES));
      const i = Math.floor(f);
      const a = road.pts[i]!;
      const b = road.pts[i + 1]!;
      const k = f - i;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }

    function reroute(p: Person) {
      const from = roads[p.road]!.from;
      const options = roads.map((r, i) => ({ r, i })).filter(({ r }) => r.from === from && r.floodTarget === 0);
      const pick = options[Math.floor(Math.random() * options.length)];
      if (pick) p.road = pick.i;
      p.t = 0;
      p.fade = 0;
    }

    function step(dt: number) {
      nextFlood -= dt * 1000;
      if (nextFlood <= 0) {
        roads.forEach((r) => (r.floodTarget = 0));
        const victim = roads[Math.floor(Math.random() * roads.length)]!;
        victim.floodTarget = 1;
        nextFlood = 5200;
      }
      for (const r of roads) {
        r.flooded += (r.floodTarget - r.flooded) * Math.min(1, dt * 3);
        let near = 0;
        if (interactive && pointer.x > -999) {
          for (let k = 0; k <= SAMPLES; k += 4) {
            const p = r.pts[k]!;
            const d = Math.hypot(p.x - pointer.x, p.y - pointer.y);
            if (d < 80) near = Math.max(near, 1 - d / 80);
          }
        }
        r.glow += (near - r.glow) * Math.min(1, dt * 8);
      }
      for (const p of crowd) {
        const road = roads[p.road]!;
        p.fade = Math.min(1, p.fade + dt * 1.5);
        if (road.floodTarget === 1 && p.t < 0.85) {
          reroute(p);
          continue;
        }
        p.t += p.speed * dt;
        if (p.t >= 1) {
          pulse[road.to] = 1;
          reroute(p);
        }
      }
      for (let i = 0; i < pulse.length; i++) pulse[i] = Math.max(0, pulse[i]! - dt * 1.4);
    }

    function draw(dt: number) {
      if (dt > 0) step(Math.min(dt, 0.05));
      ctx!.clearRect(0, 0, w, h);
      ctx!.lineCap = "round";
      for (const r of roads) {
        ctx!.beginPath();
        r.pts.forEach((p, i) => (i ? ctx!.lineTo(p.x, p.y) : ctx!.moveTo(p.x, p.y)));
        if (r.flooded > 0.05) {
          ctx!.setLineDash([5, 6]);
          ctx!.strokeStyle = colors.danger;
          ctx!.globalAlpha = 0.25 + r.flooded * 0.55;
          ctx!.lineWidth = 1.6;
        } else {
          ctx!.setLineDash([]);
          ctx!.strokeStyle = r.glow > 0.02 ? colors.brand : colors.line;
          ctx!.globalAlpha = 0.32 + r.glow * 0.38;
          ctx!.lineWidth = 1 + r.glow * 0.6;
        }
        ctx!.stroke();
      }
      ctx!.setLineDash([]);
      for (const p of crowd) {
        const road = roads[p.road]!;
        const a = at(road, p.t);
        const b = at(road, Math.max(0, p.t - 0.028));
        ctx!.globalAlpha = 0.75 * p.fade * (1 - road.flooded * 0.8);
        ctx!.strokeStyle = colors.brand;
        ctx!.lineWidth = 1.75;
        ctx!.beginPath();
        ctx!.moveTo(b.x, b.y);
        ctx!.lineTo(a.x, a.y);
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;
      for (const z of zones) {
        ctx!.fillStyle = colors.muted;
        ctx!.globalAlpha = 0.7;
        ctx!.fillRect(z.x - 3.5, z.y - 3.5, 7, 7);
      }
      shelters.forEach((s, i) => {
        const pl = pulse[i]!;
        ctx!.globalAlpha = 1;
        ctx!.fillStyle = colors.bg;
        ctx!.strokeStyle = colors.brand;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, 7, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.stroke();
        if (pl > 0) {
          ctx!.globalAlpha = pl * 0.6;
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, 7 + (1 - pl) * 14, 0, Math.PI * 2);
          ctx!.stroke();
        }
      });
      ctx!.globalAlpha = 1;
    }

    function loop(now: number) {
      const dt = (now - last) / 1000;
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (reduce || running || !visible || document.hidden) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    const mo = new MutationObserver(() => {
      colors = readColors();
      if (!running) draw(0);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const onLeave = () => {
      pointer.x = pointer.y = -9999;
    };
    if (interactive) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    resize();
    start();
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [xStart, people, interactive]);

  return <canvas ref={canvasRef} aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} />;
}
