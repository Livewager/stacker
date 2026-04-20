import { NextResponse } from "next/server";

export const runtime = "nodejs";

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Best-effort in-memory rate limit (per container instance).
// Not a substitute for a real rate limiter, but deters casual flooding.
const hits = new Map<string, { n: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function rateLimit(ip: string) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    hits.set(ip, { n: 1, windowStart: now });
    return true;
  }
  if (rec.n >= MAX_PER_WINDOW) return false;
  rec.n += 1;
  return true;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (!rateLimit(ip)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.trim() : "";
  if (!EMAIL_RX.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const payload = {
    email,
    source: "dunk-waitlist",
    ip,
    userAgent: req.headers.get("user-agent") || "",
    ts: new Date().toISOString(),
  };

  // Optional webhook: set DUNK_WAITLIST_WEBHOOK in Vercel env to pipe signups to
  // Slack, Discord, Zapier, n8n, etc. Failing webhook does not fail the request.
  const webhook = process.env.DUNK_WAITLIST_WEBHOOK;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New /dunk waitlist: ${email}`,
          ...payload,
        }),
      });
    } catch {
      // Swallow webhook errors — user signup still counts as success.
    }
  }

  // Structured log for aggregation (Vercel, Datadog, etc.)
  console.log("[dunk.waitlist]", JSON.stringify(payload));

  return NextResponse.json({ ok: true });
}
