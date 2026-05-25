import { NextRequest } from "next/server";

const HF_SPACE_URL =
  process.env.HF_SPACE_URL ||
  "https://rovdetection-code-1b-chat-space.hf.space";
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";

const RATE_LIMIT = 50;
const WINDOW_SEC = 3600;

// ── Rate limit ────────────────────────────────────────────────────────
async function checkRate(
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  if (!UPSTASH_URL) return { allowed: true, remaining: 50 };
  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", `rl:${ip}`],
        ["EXPIRE", `rl:${ip}`, WINDOW_SEC],
      ]),
    });
    const data = await res.json();
    const count = data?.[0]?.result ?? 1;
    return {
      allowed: count <= RATE_LIMIT,
      remaining: Math.max(0, RATE_LIMIT - count),
    };
  } catch {
    return { allowed: true, remaining: 50 };
  }
}

// ── Insert prompt with a pre-generated id (no SELECT needed) ─────────
async function insertLog(id: string, ip: string, prompt: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/query_logs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id,
        ip,
        prompt,
        response: "",
        tokens_used: 0,
        latency_ms: 0,
      }),
    });
    console.log("[insertLog] status:", res.status);
  } catch (e) {
    console.error("[insertLog] failed:", e);
  }
}

// ── Patch response + latency after stream ends ────────────────────────
async function updateLog(id: string, response: string, latency_ms: number) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !id) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/query_logs?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ response: response.slice(0, 300), latency_ms }),
    });
    console.log("[updateLog] status:", res.status);
  } catch (e) {
    console.error("[updateLog] failed:", e);
  }
}

// ── Main handler ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const start = Date.now();

  const { allowed, remaining } = await checkRate(ip);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: `Rate limit: max ${RATE_LIMIT} requests/hour.` }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await req.json();
  const prompt = body.messages?.at(-1)?.content?.slice(0, 500) || "";

  // Generate UUID here — avoids needing SELECT permission on Supabase
  const logId = crypto.randomUUID();
  await insertLog(logId, ip, prompt);

  let upstream: Response;
  try {
    upstream = await fetch(`${HF_SPACE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, stream: true }),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Could not reach inference API" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let collected = "";

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let sseComplete = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              sseComplete = true;
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              collected += parsed.choices?.[0]?.delta?.content ?? "";
            } catch {
              /* skip */
            }
          }

          controller.enqueue(encoder.encode(chunk));

          // Break on [DONE] — HF Space never closes TCP so we must do this
          if (sseComplete) break;
        }
      } finally {
        controller.close();
        await updateLog(logId, collected, Date.now() - start);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-RateLimit-Remaining": String(remaining),
    },
  });
}
