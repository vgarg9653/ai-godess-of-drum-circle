/**
 * Render the night as a square image and hand it to the viewer.
 *
 * The closing screen offers to "keep tonight's mandala", so it has to actually
 * produce something. This draws the room as concentric rings — one per family,
 * each mark a moment that family sounded — with everyone's names around the
 * outside and the date beneath.
 *
 * Deliberately the same shape as the on-screen weave: aggregated by family, no
 * per-person figures, nothing to compare.
 */

import {
  FAMILY_COLOR,
  FAMILY_LABEL,
  getInstrument,
  type Family,
  type SessionSummary,
} from "@godc/shared";

const SIZE = 1080;
const FAMILY_ORDER: Family[] = ["rhythm", "bass", "bed", "top"];

function roundedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "center",
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

export function renderMandala(summary: SessionSummary, dateLabel: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const cx = SIZE / 2;
  const cy = SIZE / 2 - 20;

  const ground = ctx.createRadialGradient(cx, SIZE * 0.06, 0, cx, cy, SIZE * 0.9);
  ground.addColorStop(0, "#1b1132");
  ground.addColorStop(0.58, "#0d0917");
  ground.addColorStop(1, "#060410");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const weave = summary.room.weave ?? {};
  const peak = Math.max(1, ...FAMILY_ORDER.flatMap((f) => weave[f] ?? [0]));

  // One ring per family, innermost first, each mark a step that family sounded.
  FAMILY_ORDER.forEach((family, ringIndex) => {
    const cells = weave[family] ?? [];
    if (cells.length === 0) return;
    const radius = 150 + ringIndex * 62;
    const color = FAMILY_COLOR[family];

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    cells.forEach((value, step) => {
      if (!value) return;
      const angle = -Math.PI / 2 + (step / cells.length) * Math.PI * 2;
      const strength = value / peak;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.6 * strength;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16 * strength;
      ctx.beginPath();
      ctx.arc(
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle),
        4 + 9 * strength,
        0, Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    });
  });

  // The still centre.
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#f6ecd9";
  ctx.setLineDash([3, 10]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  roundedText(ctx, "GODDESS OF", cx, cy - 14, "500 22px 'Space Grotesk', sans-serif", "#ffc95c");
  roundedText(ctx, "DRUM CIRCLE", cx, cy + 22, "500 22px 'Space Grotesk', sans-serif", "#ffc95c");

  // Names round the outside, following the circle.
  const roster = summary.room.roster ?? [];
  const nameRadius = 150 + FAMILY_ORDER.length * 62 + 34;
  roster.forEach((person, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(1, roster.length)) * Math.PI * 2;
    const instrument = person.instrumentId ? getInstrument(person.instrumentId) : null;
    const color = instrument ? FAMILY_COLOR[instrument.family] : "#6b6072";
    ctx.save();
    ctx.translate(cx + nameRadius * Math.cos(angle), cy + nameRadius * Math.sin(angle));
    // Keep names upright on the lower half rather than upside down.
    const flip = angle > 0 && angle < Math.PI;
    ctx.rotate(angle + Math.PI / 2 + (flip ? Math.PI : 0));
    roundedText(ctx, person.name, 0, 0, "600 24px 'Space Grotesk', sans-serif", color);
    roundedText(
      ctx, instrument?.name ?? "", 0, 24,
      "400 17px 'Space Grotesk', sans-serif", "rgba(246,236,217,0.5)",
    );
    ctx.restore();
  });

  const footer = SIZE - 54;
  roundedText(
    ctx, dateLabel, cx, footer - 30,
    "400 24px 'Space Grotesk', sans-serif", "rgba(246,236,217,0.75)",
  );
  const mins = Math.max(1, Math.round(summary.durationMs / 60000));
  const cycles = summary.room.cyclesCompleted;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const people = roster.length === 1 ? "1 person" : `${roster.length} people`;
  roundedText(
    ctx,
    `${people} · ${plural(mins, "minute")} · ${plural(cycles, "cycle")}`,
    cx, footer,
    "400 20px 'Space Grotesk', sans-serif", "rgba(246,236,217,0.45)",
  );

  // Legend, so the rings mean something to someone who was not there.
  FAMILY_ORDER.forEach((family, i) => {
    const x = 60;
    const y = 70 + i * 34;
    ctx.fillStyle = FAMILY_COLOR[family];
    ctx.beginPath();
    ctx.arc(x, y - 5, 7, 0, Math.PI * 2);
    ctx.fill();
    roundedText(
      ctx, FAMILY_LABEL[family], x + 18, y,
      "400 19px 'Space Grotesk', sans-serif", "rgba(246,236,217,0.6)", "left",
    );
  });

  return canvas;
}

/**
 * Save it.
 *
 * Resolves to false when the browser refuses the download — some in-app
 * browsers block programmatic saves — so the caller can say something honest
 * rather than claiming success.
 */
export async function keepMandala(
  summary: SessionSummary,
  dateLabel: string,
): Promise<boolean> {
  try {
    const canvas = renderMandala(summary, dateLabel);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return false;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drum-circle-${summary.roomCode}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
