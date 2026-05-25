import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";

const HF_SPACE_URL =
  process.env.HF_SPACE_URL ||
  "https://rovdetection-code-1b-chat-space.hf.space";
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";

const RATE_LIMIT = 50;
const WINDOW_SEC = 3600;

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

async function logQuery(row: {
  ip: string;
  prompt: string;
  response: string;
  tokens_used: number;
  latency_ms: number;
}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("[logQuery] Supabase env vars missing, skipping log");
    return;
  }
  // 8-second timeout so it never hangs
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/query_logs`, {
      method: "POST",
      signal: abort.signal,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    console.log("[logQuery] Supabase response status:", res.status);
  } catch (e) {
    console.error("[logQuery] failed:", e);
  } finally {
    clearTimeout(timer);
  }
}

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

  // logData is mutated inside the stream, then logged after via waitUntil
  const logData = { ip, prompt, response: "", tokens_used: 0, latency_ms: 0 };

  // streamDone resolves when the stream finishes — waitUntil waits for it
  let streamResolve!: () => void;
  const streamDone = new Promise<void>((r) => {
    streamResolve = r;
  });

  waitUntil(streamDone.then(() => logQuery(logData)));

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              logData.response += parsed.choices?.[0]?.delta?.content ?? "";
            } catch {
              /* skip */
            }
          }

          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        logData.response = logData.response.slice(0, 300);
        logData.latency_ms = Date.now() - start;
        controller.close();
        streamResolve(); // triggers waitUntil → logQuery
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
