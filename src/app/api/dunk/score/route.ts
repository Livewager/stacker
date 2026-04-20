import { NextResponse } from "next/server";
import { MAX_POUR_SCORE, ROUND_MS, verifyRound } from "../_hmac";

export const runtime = "nodejs";

// In-memory rate limit: one result per (ip, roundId) per container.
// Best-effort only — real solution is KV or a durable store.
const seen = new Map<string, number>();
const WINDOW_MS = 5 * 60 * 1000;

const cleanup = () => {
  const now = Date.now();
  for (const [k, ts] of seen) {
    if (now - ts > WINDOW_MS) seen.delete(k);
  }
};

const HANDLE_RX = /^[a-zA-Z0-9_]{1,20}$/;

type Body = {
  game?: unknown;
  handle?: unknown;
  flag?: unknown;
  score?: unknown;
  roundId?: unknown;
  signature?: unknown;
  expiresAt?: unknown;
  perfectMs?: unknown;
  // Optional anti-cheat signature summary (from client collector)
  tremor?: unknown;
  repeatRatio?: unknown;
  samples?: unknown;
};

export async function POST(req: Request) {
  cleanup();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const game = typeof body.game === "string" ? body.game : "";
  if (game !== "pour") {
    return NextResponse.json({ ok: false, error: "unsupported_game" }, { status: 400 });
  }

  const handle = typeof body.handle === "string" ? body.handle : "";
  if (!HANDLE_RX.test(handle)) {
    return NextResponse.json({ ok: false, error: "invalid_handle" }, { status: 400 });
  }

  const score = typeof body.score === "number" ? body.score : -1;
  if (!Number.isFinite(score) || score < 0 || score > MAX_POUR_SCORE) {
    return NextResponse.json({ ok: false, error: "score_out_of_range" }, { status: 400 });
  }

  const roundId = typeof body.roundId === "number" ? body.roundId : -1;
  const expiresAt = typeof body.expiresAt === "number" ? body.expiresAt : -1;
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!verifyRound(roundId, expiresAt, signature)) {
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  // Time window: allow submission up to 30s after the round ends
  const now = Date.now();
  if (now > expiresAt + 30_000) {
    return NextResponse.json({ ok: false, error: "expired" }, { status: 410 });
  }
  if (Math.floor(now / ROUND_MS) < roundId - 1) {
    return NextResponse.json({ ok: false, error: "future_round" }, { status: 400 });
  }

  const key = `${ip}:${roundId}`;
  if (seen.has(key)) {
    return NextResponse.json({ ok: false, error: "duplicate" }, { status: 409 });
  }
  seen.set(key, now);

  // Lightweight plausibility checks using anti-cheat summary
  const tremor = typeof body.tremor === "number" ? body.tremor : NaN;
  const repeatRatio = typeof body.repeatRatio === "number" ? body.repeatRatio : NaN;
  const samples = typeof body.samples === "number" ? body.samples : 0;
  const suspicious: string[] = [];
  if (samples > 0 && samples < 50) suspicious.push("too_few_samples");
  if (Number.isFinite(tremor) && tremor < 0.003 && score > 3000) suspicious.push("too_smooth_high_score");
  if (Number.isFinite(repeatRatio) && repeatRatio > 0.5 && score > 3000) suspicious.push("too_repetitive_high_score");

  const payload = {
    game,
    handle,
    flag: typeof body.flag === "string" ? body.flag : "🏁",
    score: Math.floor(score),
    perfectMs: typeof body.perfectMs === "number" ? body.perfectMs : 0,
    roundId,
    ip,
    userAgent: req.headers.get("user-agent") || "",
    suspicious,
    ts: new Date(now).toISOString(),
  };
  // Structured log — ready for aggregation in Vercel / Datadog
  console.log("[dunk.score]", JSON.stringify(payload));

  return NextResponse.json({ ok: true, accepted: true, suspicious });
}
