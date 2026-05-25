import { NextRequest } from "next/server";

// Set in Vercel dashboard: Settings → Environment Variables
const HF_SPACE_URL =
  process.env.HF_SPACE_URL ||
  "https://rovdetection-code-1b-chat-space.hf.space";

export async function POST(req: NextRequest) {
  const body = await req.json();

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
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status });
  }

  // Stream SSE directly back to browser
  return new Response(upstream.body, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
