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
const STREAM_DEADLINE = 240_000; // break at 240s, log before Vercel's 300s kill

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

// ── Supabase fetch with 5s timeout ────────────────────────────────────
async function supabaseFetch(
  path: string,
  method: string,
  body: object,
  extra?: HeadersInit,
) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      method,
      signal: abort.signal,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
        ...(extra ?? {}),
      },
      body: JSON.stringify(body),
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function insertLog(id: string, ip: string, prompt: string) {
  try {
    const res = await supabaseFetch("/query_logs", "POST", {
      id,
      ip,
      prompt,
      response: "",
      tokens_used: 0,
      latency_ms: 0,
    });
    console.log("[insertLog] status:", res?.status);
  } catch (e) {
    console.error("[insertLog]", e);
  }
}

async function updateLog(id: string, response: string, latency_ms: number) {
  if (!id) return;
  try {
    const res = await supabaseFetch(`/query_logs?id=eq.${id}`, "PATCH", {
      response: response.slice(0, 300),
      latency_ms,
    });
    console.log("[updateLog] status:", res?.status);
    if (res && !res.ok) console.error("[updateLog] body:", await res.text());
  } catch (e) {
    console.error("[updateLog]", e);
  }
}

// ── Read next chunk with a hard deadline ─────────────────────────────
function timedRead(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadlineMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const ms = deadlineMs - Date.now();
  if (ms <= 0) return Promise.resolve({ done: true, value: undefined });
  return Promise.race([
    reader.read(),
    new Promise<{ done: true; value: undefined }>((r) =>
      setTimeout(() => r({ done: true, value: undefined }), ms),
    ),
  ]);
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

  // Insert prompt immediately — confirmed working (201)
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
    return new Response(await upstream.text(), { status: upstream.status });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let collected = "";

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const deadline = Date.now() + STREAM_DEADLINE;
      let sseComplete = false;

      try {
        while (true) {
          const { done, value } = await timedRead(reader, deadline);
          if (done) break; // [DONE] received, TCP closed, or 240s deadline hit

          const chunk = decoder.decode(value, { stream: true });

          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") {
              sseComplete = true;
              continue;
            }
            try {
              const parsed = JSON.parse(raw);
              collected += parsed.choices?.[0]?.delta?.content ?? "";
            } catch {
              /* skip */
            }
          }

          controller.enqueue(encoder.encode(chunk));
          if (sseComplete) break;
        }
      } finally {
        controller.close();
        // Always runs — either [DONE], TCP close, or 240s deadline
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
