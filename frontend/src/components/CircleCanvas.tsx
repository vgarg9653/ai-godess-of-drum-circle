/**
 * The play surface: the whole room, drawn as a circle of lights.
 *
 * A canvas rather than DOM nodes because at sixty participants, each pulsing on
 * its own onset with a ripple behind it, React would be reconciling a hundred
 * elements several times a second while the audio engine is trying to keep
 * time. Nothing here re-renders React; the loop reads live state from refs.
 *
 * Interaction is deliberately tiny. Touch the outer ring, touch the middle, or
 * sweep. That is the entire instrument, and it is the same on every instrument,
 * so a player who swaps mid-session already knows how to play the new one.
 */

import { useEffect, useRef } from "react";
import {
  FAMILY_COLOR,
  getInstrument,
  gridSteps,
  iconPath,
  type Participant,
  type Phrase,
  type Stroke,
  type TransportState,
} from "@godc/shared";
import { usePlayheadStore } from "@/state/playheadStore";

/** Travel in px past which a press counts as a sweep rather than a touch. */
const SWEEP_PX = 30;
/** A press held longer than this is not a sweep, however far it wandered. */
const SWEEP_MS = 700;
/** Inside this fraction of the ring radius counts as the centre zone. */
const CENTER_ZONE = 0.45;

interface Node {
  participant: Participant;
  x: number;
  y: number;
  radius: number;
  color: string;
  isYou: boolean;
}

/** Where a given step sits on the ring. Shared by the playhead and the cues. */
function pointAt(
  step: number,
  steps: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (step / steps) * Math.PI * 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

interface Ripple {
  x: number;
  y: number;
  born: number;
  life: number;
  color: string;
  sweep: boolean;
}

export interface CircleCanvasProps {
  participants: Participant[];
  phrases: Record<string, Phrase>;
  youId: string | null;
  transport: TransportState;
  /** Dimmed once the room settles, so the screens stop competing with the room. */
  trance: boolean;
  /**
   * Whether this player's take is still open or has locked into a loop.
   *
   * Shown as the ring around their own light: broken while they are laying
   * down, closed once the groove is going. It is the quietest way to answer
   * "has it started?" without putting words on the play surface.
   */
  loopState: "cued" | "open" | "locked";
  /**
   * This person's cued hits, while they are learning a song part.
   *
   * Drawn as pips on the ring the playhead sweeps, so the player watches their
   * next hit approach and sees it flash as it arrives. That is the entire
   * vocabulary: *now*. No indication of whether the last one was early, late or
   * missed — the brief forbids it, and a room of people does not need marking.
   *
   * Released cues are simply not drawn. They fade out of existence rather than
   * being ticked off.
   */
  cues: Array<{ step: number; released: boolean }>;
  onStroke: (stroke: Stroke) => void;
  onInspect: (participant: Participant, x: number, y: number) => void;
}

export function CircleCanvas(props: CircleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Latest props for the animation loop, which must not close over stale values.
  const propsRef = useRef(props);
  propsRef.current = props;

  const nodesRef = useRef<Node[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const pulseSeenRef = useRef<Record<string, number>>({});
  const pressRef = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const iconCache = new Map<string, Path2D>();

    const glyph = (instrumentId: string): Path2D => {
      let path = iconCache.get(instrumentId);
      if (!path) {
        path = new Path2D(iconPath(instrumentId));
        iconCache.set(instrumentId, path);
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
      layout();
    }

    /**
     * Place everyone.
     *
     * One ring up to thirty. Beyond that a single ring puts people so close
     * their lights merge, so it splits into concentric rings — which also
     * reads, accurately, as a bigger crowd.
     */
    function layout() {
      const { participants, youId } = propsRef.current;
      const n = participants.length;
      if (n === 0) {
        nodesRef.current = [];
        return;
      }
      const cx = width / 2;
      const cy = height * 0.44;
      const outer = Math.min(width * 0.42, height * 0.32);
      const nodes: Node[] = [];

      const rings = n <= 30 ? 1 : n <= 56 ? 2 : 3;
      const perRing = Math.ceil(n / rings);
      const baseSize = n <= 12 ? 13 : n <= 30 ? 9 : 6.5;

      participants.forEach((participant, i) => {
        const ring = Math.floor(i / perRing);
        const indexInRing = i % perRing;
        const countInRing = Math.min(perRing, n - ring * perRing);
        const radius = outer * (1 - ring * 0.26);
        // Start at 12 o'clock so the first person sits at the top of the screen.
        const angle = -Math.PI / 2 + (indexInRing * 2 * Math.PI) / countInRing;
        const instrument = participant.instrumentId
          ? getInstrument(participant.instrumentId)
          : undefined;
        const isYou = participant.id === youId;
        nodes.push({
          participant,
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle),
          radius: isYou ? baseSize * 1.55 : baseSize,
          color: instrument ? FAMILY_COLOR[instrument.family] : "#6b6072",
          isYou,
        });
      });
      nodesRef.current = nodes;
    }

    /** Spawn ripples for onsets the engine reported since the last frame. */
    function harvestPulses(now: number) {
      const pulses = usePlayheadStore.getState().pulses;
      const seen = pulseSeenRef.current;
      for (const [id, count] of Object.entries(pulses)) {
        if (seen[id] === count) continue;
        seen[id] = count;
        const key = id === "local" ? propsRef.current.youId : id;
        const node = nodesRef.current.find((n) => n.participant.id === key);
        if (!node) continue;
        ripplesRef.current.push({
          x: node.x,
          y: node.y,
          born: now,
          life: 1400,
          color: node.color,
          sweep: false,
        });
      }
      if (ripplesRef.current.length > 48) {
        ripplesRef.current.splice(0, ripplesRef.current.length - 48);
      }
    }

    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      const { transport, trance, participants } = propsRef.current;
      if (nodesRef.current.length !== participants.length) layout();
      harvestPulses(now);

      ctx!.clearRect(0, 0, width, height);
      const dim = trance ? 0.4 : 1;
      const cx = width / 2;
      const cy = height * 0.44;
      const outer = Math.min(width * 0.42, height * 0.32);

      const step = usePlayheadStore.getState().step;
      const steps = gridSteps(transport.cycleBeats);

      // --- the ring the circle sits on ---
      ctx!.save();
      ctx!.globalAlpha = 0.16 * dim;
      ctx!.strokeStyle = "#f6ecd9";
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.restore();

      // --- the pulse, sweeping the ring ---
      const angle = -Math.PI / 2 + (step / steps) * Math.PI * 2;
      ctx!.save();
      ctx!.globalAlpha = 0.9 * dim;
      ctx!.fillStyle = "#ffc95c";
      ctx!.shadowColor = "#ffc95c";
      ctx!.shadowBlur = 12;
      ctx!.beginPath();
      ctx!.arc(cx + outer * Math.cos(angle), cy + outer * Math.sin(angle), 4.5, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();

      // --- cued hits, on the ring the playhead is sweeping ---
      for (const cue of propsRef.current.cues) {
        if (cue.released) continue;
        const p = pointAt(cue.step, steps, cx, cy, outer);
        const now = cue.step === step;
        ctx!.save();
        ctx!.globalAlpha = (now ? 1 : 0.5) * dim;
        ctx!.fillStyle = now ? "#f6ecd9" : "#ffc95c";
        if (now) {
          ctx!.shadowColor = "#ffc95c";
          ctx!.shadowBlur = 18;
        }
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, now ? 9 : 4.5, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      // --- ripples, oldest first so new ones sit on top ---
      const alive: Ripple[] = [];
      for (const ripple of ripplesRef.current) {
        const age = (now - ripple.born) / ripple.life;
        if (age >= 1) continue;
        alive.push(ripple);
        const eased = 1 - Math.pow(1 - age, 2);
        ctx!.save();
        ctx!.globalAlpha = (1 - age) * 0.55 * dim;
        ctx!.strokeStyle = ripple.color;
        ctx!.lineWidth = ripple.sweep ? 2.4 : 1.6;
        ctx!.beginPath();
        ctx!.arc(ripple.x, ripple.y, 8 + eased * (ripple.sweep ? 90 : 52), 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.restore();
      }
      ripplesRef.current = alive;

      // --- participants ---
      for (const node of nodesRef.current) {
        const instrument = node.participant.instrumentId
          ? getInstrument(node.participant.instrumentId)
          : undefined;

        ctx!.save();
        ctx!.globalAlpha = dim;
        // A soft bloom behind each light, so the circle glows rather than dots.
        const gradient = ctx!.createRadialGradient(
          node.x, node.y, 0, node.x, node.y, node.radius * 2.6,
        );
        gradient.addColorStop(0, `${node.color}cc`);
        gradient.addColorStop(0.5, `${node.color}44`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = gradient;
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, node.radius * 2.6, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = node.color;
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx!.fill();

        // Only draw emblems when they would actually be legible.
        if (instrument && node.radius >= 9) {
          const scale = (node.radius * 1.5) / 48;
          ctx!.save();
          ctx!.translate(node.x - node.radius * 0.75, node.y - node.radius * 0.75);
          ctx!.scale(scale, scale);
          ctx!.strokeStyle = "#140c26";
          ctx!.lineWidth = 3.6;
          ctx!.lineCap = "round";
          ctx!.lineJoin = "round";
          ctx!.stroke(glyph(instrument.id));
          ctx!.restore();
        }

        if (node.isYou) {
          const open = propsRef.current.loopState === "open";
          ctx!.strokeStyle = "#f6ecd9";
          ctx!.globalAlpha = (open ? 0.5 : 0.9) * dim;
          ctx!.lineWidth = open ? 1.4 : 2;
          // Broken ring: still being laid down. Closed ring: going round.
          ctx!.setLineDash(open ? [4, 5] : []);
          ctx!.beginPath();
          ctx!.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.setLineDash([]);
        }
        ctx!.restore();
      }

      // --- names, only while the room is small enough to read them ---
      if (nodesRef.current.length <= 12 && !trance) {
        ctx!.save();
        ctx!.globalAlpha = 0.6 * dim;
        ctx!.fillStyle = "#f6ecd9";
        ctx!.font = "11px 'Space Grotesk', sans-serif";
        ctx!.textAlign = "center";
        for (const node of nodesRef.current) {
          ctx!.fillText(
            node.isYou ? "You" : node.participant.name,
            node.x,
            node.y + node.radius + 16,
          );
        }
        ctx!.restore();
      }
    }

    /* ---------------- input ---------------- */

    function localPoint(e: PointerEvent): { x: number; y: number } {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onPointerDown(e: PointerEvent) {
      const p = localPoint(e);
      pressRef.current = { ...p, t: performance.now() };
    }

    function onPointerUp(e: PointerEvent) {
      const origin = pressRef.current;
      pressRef.current = null;
      if (!origin) return;
      const p = localPoint(e);
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      const held = performance.now() - origin.t;

      // Touching someone else's light asks who they are, rather than playing.
      const hit = nodesRef.current.find(
        (n) => !n.isYou && Math.hypot(origin.x - n.x, origin.y - n.y) < Math.max(20, n.radius * 2.2),
      );
      if (hit && Math.hypot(dx, dy) < SWEEP_PX) {
        propsRef.current.onInspect(hit.participant, hit.x, hit.y - 14);
        return;
      }

      const cx = width / 2;
      const cy = height * 0.44;
      const outer = Math.min(width * 0.42, height * 0.32);

      let stroke: Stroke;
      if (Math.hypot(dx, dy) > SWEEP_PX && held < SWEEP_MS) {
        stroke = "sweep";
      } else {
        stroke = Math.hypot(origin.x - cx, origin.y - cy) < outer * CENTER_ZONE
          ? "center"
          : "outer";
      }

      // Ripple from your own light immediately, so the screen answers the
      // finger even though the sound waits for the next time round the loop.
      const you = nodesRef.current.find((n) => n.isYou);
      if (you) {
        ripplesRef.current.push({
          x: you.x, y: you.y, born: performance.now(),
          life: stroke === "sweep" ? 2000 : 1400,
          color: you.color, sweep: stroke === "sweep",
        });
      }
      propsRef.current.onStroke(stroke);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", () => (pressRef.current = null));
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: "none" }}
      aria-label="The circle. Touch the outer ring or the centre to play, sweep for a roll."
    />
  );
}
