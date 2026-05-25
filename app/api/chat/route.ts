import { NextRequest } from "next/server";

const HF_SPACE_URL  = process.env.HF_SPACE_URL  || "https://rovdetection-code-1b-chat-space.hf.space";
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL   || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const SUPABASE_URL  = process.env.SUPABASE_URL  || "";
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY || "";

const RATE_LIMIT  = 50;   // requests per IP per hour
const WINDOW_SEC  = 3600;

// ── Rate limit via Upstash ────────────────────────────────────────────
async function checkRate(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!UPSTASH_URL) return { allowed: true, remaining: 50 };
  try {
    const res  = await fetch(`${UPSTASH_URL}/pipeline`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body:    JSON.stringify([["INCR", `rl:${ip}`], ["EXPIRE", `rl:${ip}`, WINDOW_SEC]]),
    });
    const data  = await res.json();
    const count = data?.[0]?.result ?? 1;
    return { allowed: count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - count) };
  } catch {
    return { allowed: true, remaining: 50 };
  }
}

// ── Log to Supabase (fire-and-forget) ────────────────────────────────
function logQuery(row: {
  ip: string; prompt: string; response: string; tokens_used: number; latency_ms: number;
}) {
  if (!SUPABASE_URL) return;
  fetch(`${SUPABASE_URL}/rest/v1/query_logs`, {
    method:  "POST",
    headers: {
      apikey:         SUPABASE_KEY,
      Authorization:  `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "return=minimal",
    },
    body: JSON.stringify(row),
  }).catch(() => {});
}

// ── Main handler ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip    = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const start = Date.now();

  // Rate limit check
  const { allowed, remaining } = await checkRate(ip);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: `Rate limit: max ${RATE_LIMIT} requests/hour.` }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.json();
  const prompt = body.messages?.at(-1)?.content?.slice(0, 500) || "";

  let upstream: Response;
  try {
    upstream = await fetch(`${HF_SPACE_URL}/v1/chat/completions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...body, stream: true }),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Could not reach inference API" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status });
  }

  // Collect response for logging while streaming to browser
  let collected = "";
  const encoder  = new TextEncoder();
  const decoder  = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Collect assistant text for logging
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              collected += parsed.choices?.[0]?.delta?.content ?? "";
            } catch { /* skip */ }
          }

          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        controller.close();

        // Log after stream ends
        logQuery({
          ip,
          prompt,
          response:    collected.slice(0, 300),
          tokens_used: 0,          // not available in streaming mode
          latency_ms:  Date.now() - start,
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":          "text/event-stream",
      "Cache-Control":         "no-cache",
      "Connection":            "keep-alive",
      "X-Accel-Buffering":     "no",
      "X-RateLimit-Remaining": String(remaining),
    },
  });
}
