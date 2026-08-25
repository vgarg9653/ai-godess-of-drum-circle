/**
 * The play surface: you in the middle, the room around you.
 *
 * The earlier version drew everybody as equals on one ring, which was honest
 * about the music and useless as an instruction. The thing a player most needs
 * to see is *their own next move*, so that is now the biggest object on screen
 * and everything else orbits it.
 *
 * While a song part is being taught this doubles as the instruction, borrowed
 * straight from Simon Says: a shape lights up, you tap it. Simon Says never
 * tells you that you were bad — it only ever shows you *when* — which is
 * exactly the feedback this app is allowed to give.
 *
 * A canvas rather than DOM, because at sixty participants each pulsing on their
 * own onset React would be reconciling a hundred elements several times a second
 * while the engine tries to keep time.
 */

import { useEffect, useRef } from "react";
import {
  FAMILY_COLOR,
  getInstrument,
  gridSteps,
  iconPath,
  type Participant,
  type Stroke,
  type TransportState,
} from "@godc/shared";
import type { Cue } from "@/engine/cues";
import { usePlayheadStore } from "@/state/playheadStore";

/** Travel in px past which a press counts as a sweep rather than a tap. */
const SWEEP_PX = 30;
const SWEEP_MS = 700;
/** How far ahead, in grid steps, the closing ring starts to show. */
const LEAD_STEPS = 8;

interface Orbiter {
  participant: Participant;
  x: number;
  y: number;
  radius: number;
  color: string;
}

interface Ripple {
  x: number;
  y: number;
  born: number;
  life: number;
  color: string;
  sweep: boolean;
}

export interface PlaySurfaceProps {
  participants: Participant[];
  youId: string | null;
  transport: TransportState;
  trance: boolean;
  loopState: "cued" | "open" | "locked";
  cues: Cue[];
  /** Fractional position through the cycle, 0..1. Read every frame. */
  cyclePosition: () => number;
  onStroke: (stroke: Stroke) => void;
  /** Which stroke a tap should make, given where it landed. */
  strokeFor: (inCentre: boolean) => Stroke;
  onInspect: (participant: Participant, x: number, y: number) => void;
}

export function PlaySurface(props: PlaySurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const orbitersRef = useRef<Orbiter[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const pulseSeenRef = useRef<Record<string, number>>({});
  const pressRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const flashRef = useRef(0);
  const lastPosRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const glyphs = new Map<string, Path2D>();

    const glyph = (id: string): Path2D => {
      let path = glyphs.get(id);
      if (!path) {
        path = new Path2D(iconPath(id));
        glyphs.set(id, path);
      }
      return path;
    };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Your disc: the instruction, and the main thing to hit. */
    const centre = () => ({
      cx: width / 2,
      cy: height * 0.46,
      r: Math.max(52, Math.min(width, height) * 0.17),
    });

    /**
     * Everyone else, drifting.
     *
     * Slow independent wobble per person so the room feels alive rather than
     * diagrammed. Nothing here is information — it is company.
     */
    function layoutOrbiters(now: number) {
      const { participants, youId } = propsRef.current;
      const { cx, cy, r } = centre();
      const others = participants.filter((p) => p.id !== youId);
      const orbit = Math.min(width * 0.40, height * 0.34) + r * 0.15;

      orbitersRef.current = others.map((participant, i) => {
        const instrument = participant.instrumentId
          ? getInstrument(participant.instrumentId)
          : undefined;
        const base = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, others.length);
        // Two slow sines at different rates: never repeats visibly.
        const drift = Math.sin(now / 4200 + i * 1.7) * 0.055;
        const bob = Math.cos(now / 5600 + i * 2.3) * 10;
        const angle = base + drift;
        const size = others.length <= 12 ? 15 : others.length <= 30 ? 11 : 8;
        return {
          participant,
          x: cx + (orbit + bob) * Math.cos(angle),
          y: cy + (orbit + bob) * Math.sin(angle),
          radius: size,
          color: instrument ? FAMILY_COLOR[instrument.family] : "#6b6072",
        };
      });
    }

    function harvestPulses(now: number) {
      const pulses = usePlayheadStore.getState().pulses;
      const seen = pulseSeenRef.current;
      for (const [id, count] of Object.entries(pulses)) {
        if (seen[id] === count) continue;
        const first = seen[id] === undefined;
        seen[id] = count;
        if (first) continue;

        if (id === "local") {
          flashRef.current = now;
          continue;
        }
        const node = orbitersRef.current.find((o) => o.participant.id === id);
        if (!node) continue;
        ripplesRef.current.push({
          x: node.x, y: node.y, born: now, life: 1300, color: node.color, sweep: false,
        });
      }
      if (ripplesRef.current.length > 40) {
        ripplesRef.current.splice(0, ripplesRef.current.length - 40);
      }
    }

    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      const {
        participants, youId, transport, trance, loopState, cues, cyclePosition,
      } = propsRef.current;

      layoutOrbiters(now);
      harvestPulses(now);

      ctx!.clearRect(0, 0, width, height);
      const dim = trance ? 0.45 : 1;
      const { cx, cy, r } = centre();

      const me = participants.find((p) => p.id === youId);
      const myInstrument = me?.instrumentId ? getInstrument(me.instrumentId) : undefined;
      const myColor = myInstrument ? FAMILY_COLOR[myInstrument.family] : "#ffc95c";

      /* ---- others, and their ripples ---- */
      const alive: Ripple[] = [];
      for (const ripple of ripplesRef.current) {
        const age = (now - ripple.born) / ripple.life;
        if (age >= 1) continue;
        alive.push(ripple);
        ctx!.save();
        ctx!.globalAlpha = (1 - age) * 0.4 * dim;
        ctx!.strokeStyle = ripple.color;
        ctx!.lineWidth = 1.4;
        ctx!.beginPath();
        ctx!.arc(ripple.x, ripple.y, 6 + (1 - Math.pow(1 - age, 2)) * 34, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.restore();
      }
      ripplesRef.current = alive;

      for (const node of orbitersRef.current) {
        ctx!.save();
        ctx!.globalAlpha = 0.75 * dim;
        const glow = ctx!.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 2.4);
        glow.addColorStop(0, `${node.color}bb`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = glow;
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, node.radius * 2.4, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = node.color;
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      /* ---- the closing ring: your next move, arriving ---- */
      const steps = gridSteps(transport.cycleBeats);
      const pos = cyclePosition();
      const nowStep = pos * steps;
      const active = loopState === "cued" ? cues.find((c) => !c.released) : undefined;

      if (active) {
        let ahead = active.step - nowStep;
        if (ahead < 0) ahead += steps;
        // Crossed it since the last frame? That is the moment to light up.
        const crossed =
          lastPosRef.current > 0.75 && pos < 0.25
            ? active.step < nowStep || active.step > lastPosRef.current * steps
            : active.step > lastPosRef.current * steps && active.step <= nowStep;
        if (crossed) flashRef.current = now;

        const t = Math.max(0, Math.min(1, 1 - ahead / LEAD_STEPS));
        ctx!.save();
        ctx!.globalAlpha = Math.pow(t, 2) * 0.9 * dim;
        ctx!.strokeStyle = "#ffc95c";
        ctx!.lineWidth = 2 + t * 2;
        ctx!.beginPath();
        ctx!.arc(cx, cy, r * (1.95 - 0.9 * t), 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.restore();
      }
      lastPosRef.current = pos;

      /* ---- you ---- */
      const sinceFlash = now - flashRef.current;
      const flash = Math.max(0, 1 - sinceFlash / 260);
      const scale = 1 + flash * 0.12;
      const cueing = loopState === "cued" && active !== undefined;

      ctx!.save();
      ctx!.globalAlpha = dim;
      const bloom = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5 * scale);
      bloom.addColorStop(0, `${myColor}${cueing ? "66" : "44"}`);
      bloom.addColorStop(1, "rgba(0,0,0,0)");
      ctx!.fillStyle = bloom;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r * 2.5 * scale, 0, Math.PI * 2);
      ctx!.fill();

      // The disc. Brightens hard on the beat you are meant to hit.
      ctx!.fillStyle = myColor;
      ctx!.globalAlpha = (0.22 + flash * 0.7) * dim;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.globalAlpha = (cueing ? 0.95 : 0.7) * dim;
      ctx!.strokeStyle = myColor;
      ctx!.lineWidth = 2 + flash * 3;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx!.stroke();

      if (myInstrument) {
        const size = r * 1.15 * scale;
        ctx!.save();
        ctx!.translate(cx - size / 2, cy - size / 2);
        ctx!.scale(size / 48, size / 48);
        ctx!.strokeStyle = flash > 0.4 ? "#0d0917" : "#f6ecd9";
        ctx!.globalAlpha = dim;
        ctx!.lineWidth = 3;
        ctx!.lineCap = "round";
        ctx!.lineJoin = "round";
        ctx!.stroke(glyph(myInstrument.id));
        ctx!.restore();
      }
      ctx!.restore();
    }

    /* ---------------- input ---------------- */

    function point(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onDown(e: PointerEvent) {
      pressRef.current = { ...point(e), t: performance.now() };
    }

    function onUp(e: PointerEvent) {
      const origin = pressRef.current;
      pressRef.current = null;
      if (!origin) return;
      const p = point(e);
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      const held = performance.now() - origin.t;

      // Touching somebody else asks who they are rather than playing.
      const hit = orbitersRef.current.find(
        (o) => Math.hypot(origin.x - o.x, origin.y - o.y) < Math.max(22, o.radius * 2.4),
      );
      if (hit && Math.hypot(dx, dy) < SWEEP_PX) {
        propsRef.current.onInspect(hit.participant, hit.x, hit.y - 14);
        return;
      }

      const { cx, cy, r } = centre();
      const inCentre = Math.hypot(origin.x - cx, origin.y - cy) <= r * 1.25;
      const stroke =
        Math.hypot(dx, dy) > SWEEP_PX && held < SWEEP_MS
          ? ("sweep" as Stroke)
          : propsRef.current.strokeFor(inCentre);

      flashRef.current = performance.now();
      propsRef.current.onStroke(stroke);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", () => (pressRef.current = null));
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: "none" }}
      aria-label="Tap the circle in the middle to play."
    />
  );
}
