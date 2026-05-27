<div align="center">

<br/>

```
 ██████╗ ██████╗ ██████╗ ███████╗    ██╗██████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝    ██║██╔══██╗
██║     ██║   ██║██║  ██║█████╗      ██║██████╔╝
██║     ██║   ██║██║  ██║██╔══╝      ██║██╔══██╗
╚██████╗╚██████╔╝██████╔╝███████╗    ██║██████╔╝
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝    ╚═╝╚═════╝
```

# code-1b-chat-v2

**A 1.13B parameter language model trained from scratch for Python code generation.**  
From pretraining to production — fully deployed with a live streaming API and chat UI.

<br/>

[![Live Demo](https://img.shields.io/badge/Live%20Demo-code--chat--ui.vercel.app-black?style=for-the-badge&logo=vercel)](https://code-chat-ui.vercel.app)
[![HF Model](https://img.shields.io/badge/HuggingFace-code--1b--chat--v2-orange?style=for-the-badge&logo=huggingface)](https://huggingface.co/rovdetection/code-1b-chat-v2)
[![HF Space](https://img.shields.io/badge/HF%20Space-Inference%20API-blue?style=for-the-badge&logo=huggingface)](https://rovdetection-code-1b-chat-space.hf.space)
[![License](https://img.shields.io/badge/License-Apache%202.0-silver?style=for-the-badge)](LICENSE)

<br/>

![Chat UI Screenshot](https://placehold.co/900x480/0a0a0a/a0a0a0?text=Code+Assistant+UI&font=monospace)

</div>

<br/>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Model Details](#model-details)
  - [Pretraining](#pretraining--code-1b-pretrain-v3)
  - [Fine-Tuning](#fine-tuning--code-1b-chat-v2)
  - [GGUF Export](#gguf-export--quantization)
- [Production Stack](#production-stack)
  - [Inference API](#inference-api--hf-spaces)
  - [Rate Limiting](#rate-limiting--upstash-redis)
  - [Query Logging](#query-logging--supabase)
  - [Keep-Alive Cron](#keep-alive-cron--cloudflare-worker)
- [Chat UI](#chat-ui--nextjs)
- [Repository Structure](#repository-structure)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Deployment Guide](#deployment-guide)
- [Cost Breakdown](#cost-breakdown)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## Overview

`code-1b-chat-v2` is a complete end-to-end machine learning project demonstrating the full lifecycle of building and deploying a custom language model:

1. **Pretrain** a 1.13B parameter GPT-2-style transformer on a Python code corpus
2. **Fine-tune** it for instruction following using supervised fine-tuning (SFT) with the Alpaca prompt format
3. **Quantize** to GGUF Q4_K_M for CPU-efficient inference (2.26 GB → 0.70 GB)
4. **Deploy** as an OpenAI-compatible REST API on Hugging Face Spaces
5. **Wrap** with a production layer: per-IP rate limiting, query logging, and a keep-alive cron
6. **Serve** through a polished streaming chat interface built with Next.js

Everything runs on **free tiers**. Zero cloud spend.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                            │
│              https://code-chat-ui.vercel.app                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │  POST /api/chat (SSE)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Vercel — Next.js API Route                         │
│              app/api/chat/route.ts                              │
│                                                                 │
│  1. Rate limit check ──────────────► Upstash Redis              │
│     INCR rl:{ip} / EXPIRE 3600s         (50 req/hr/IP)         │
│                                                                 │
│  2. INSERT prompt ─────────────────► Supabase                   │
│     crypto.randomUUID() as row ID       query_logs table        │
│                                                                 │
│  3. Proxy + stream ────────────────► HF Space                   │
│     stream: true, break on [DONE]       /v1/chat/completions    │
│                                                                 │
│  4. PATCH response ────────────────► Supabase                   │
│     in stream finally block             update same row         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│         Hugging Face Space — FastAPI + llama-cpp-python         │
│         rovdetection-code-1b-chat-space.hf.space                │
│                                                                 │
│  llama.cpp (Q4_K_M GGUF) ─── 2 vCPU, f16_kv, n_threads=2      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│         Cloudflare Worker — Keep-alive Cron                     │
│         */5 * * * * → GET /health on HF Space                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Model Details

### Pretraining — `code-1b-pretrain-v3`

| Metric | Value |
|--------|-------|
| Architecture | Decoder-only Transformer (GPT-2 style) |
| Parameters | 1.13 billion |
| Layers | 24 |
| Hidden size | 2,048 |
| Attention heads | 16 |
| Context length | 1,024 tokens |
| Vocabulary | 50,257 (GPT-2 tokenizer) |
| Training steps | 30,000 |
| Final perplexity | **3.65** |
| Hardware | Kaggle T4 GPU (free tier) |
| Objective | Causal language modelling |

The model was trained from scratch on a Python-heavy code corpus. The base tokenizer is the standard GPT-2 BPE tokenizer with no modifications.

**HF Hub:** [`rovdetection/code-1b-pretrain-v3`](https://huggingface.co/rovdetection/code-1b-pretrain-v3)

---

### Fine-Tuning — `code-1b-chat-v2`

The pretrained model was instruction-tuned for 1,000 steps on curated Python coding Q&A pairs using the **Alpaca prompt format**.

| Metric | Value |
|--------|-------|
| Base model | code-1b-pretrain-v3 |
| Training steps | 1,000 |
| Step 500 eval loss | 1.0258 |
| Step 1000 eval loss | **0.9919** (best) |
| Prompt format | Alpaca (Instruction / Response) |
| Hardware | Kaggle T4 GPU (free tier) |
| Best checkpoint | Step 1000 (loaded via `load_best_model_at_end=True`) |

**Prompt format used at inference:**

```
Below is an instruction that describes a coding task.
Write a response that appropriately completes the request.

### Instruction:
{user_prompt}

### Response:
```

**Stop tokens:** `["### Instruction:", "### Input:", "### Response:", "\n\n\n"]`

**HF Hub:** [`rovdetection/code-1b-chat-v2`](https://huggingface.co/rovdetection/code-1b-chat-v2)

---

### GGUF Export & Quantization

The `SafeTensors` model was converted to GGUF and quantized to **Q4_K_M** on Kaggle using `llama.cpp`.

| Format | Size | Ratio |
|--------|------|-------|
| SafeTensors F16 | 2.26 GB | baseline |
| **GGUF Q4_K_M** | **0.70 GB** | **3.2× smaller** |

Q4_K_M uses 4-bit mixed quantization — near-lossless quality at a fraction of the memory footprint, ideal for CPU inference.

**HF Hub (GGUF):** [`rovdetection/code-1b-chat-v2-gguf`](https://huggingface.co/rovdetection/code-1b-chat-v2-gguf)

---

## Production Stack

### Inference API — HF Spaces

The GGUF model is served via **FastAPI + llama-cpp-python** in a Docker container on Hugging Face Spaces (free CPU tier).

**Performance settings (`app.py`):**

```python
N_THREADS       = 2      # matches 2 vCPUs — more = context-switch overhead
N_THREADS_BATCH = 2      # separate pool for prompt ingestion
N_CTX           = 512    # context window
N_BATCH         = 256    # tokens per batch
f16_kv          = True   # KV cache in FP16 — saves RAM, faster attention
use_mmap        = True   # memory-map weights for fast startup
DEFAULT_TEMP    = 0.3    # less random → more reliable code
REPEAT_PENALTY  = 1.15   # prevents repetition loops
```

The model is warmed up on startup with a tiny inference so the first real user request doesn't hit a cold start.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Model status, config, loaded state |
| `GET` | `/v1/models` | OpenAI-compatible model list |
| `POST` | `/v1/chat/completions` | Chat — streaming (`stream: true`) and non-streaming |

**Streaming example:**

```python
import requests

resp = requests.post(
    "https://rovdetection-code-1b-chat-space.hf.space/v1/chat/completions",
    json={
        "model": "code-1b-chat-v2",
        "messages": [{"role": "user", "content": "Write a Python fibonacci function."}],
        "max_tokens": 256,
        "temperature": 0.3,
        "stream": True,
    },
    stream=True,
)
for line in resp.iter_lines():
    if line.startswith(b"data: ") and line != b"data: [DONE]":
        import json
        chunk = json.loads(line[6:])
        print(chunk["choices"][0]["delta"].get("content", ""), end="", flush=True)
```

---

### Rate Limiting — Upstash Redis

Every request through the Next.js API route is rate-limited per IP using a **sliding window** in Upstash Redis.

```
Limit:  50 requests per IP per hour
Window: 3,600 seconds (rolling)
Cost:   Free — 10,000 commands/day
```

Two Redis commands are pipelined per request:

```redis
INCR  rl:{client_ip}
EXPIRE rl:{client_ip}  3600
```

If count exceeds 50, the API returns `429 Too Many Requests` immediately without forwarding to the model.

---

### Query Logging — Supabase

Every chat request is logged to a PostgreSQL table using the **Supabase REST API**.

**Schema:**

```sql
create table query_logs (
  id          uuid        default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  ip          text,
  prompt      text,
  response    text,
  tokens_used integer,
  latency_ms  integer
);

alter table query_logs enable row level security;
create policy "allow insert" on query_logs for insert with check (true);
create policy "allow update" on query_logs for update using (true);
grant insert, update on query_logs to anon;
```

**Insert-then-update pattern:**

The UUID is generated server-side (`crypto.randomUUID()`) to avoid needing `SELECT` permission.

1. **Before streaming:** `INSERT` with prompt + UUID
2. **After streaming ends** (or at the 240s deadline): `PATCH` the same row with response + latency

A 240-second deadline (`Promise.race` with `reader.read()`) guarantees the `PATCH` fires before Vercel's 300-second function kill, even if the model hasn't finished generating.

---

### Keep-Alive Cron — Cloudflare Worker

HF Spaces on the free tier sleep after inactivity. A Cloudflare Worker pings `/health` every 5 minutes.

**`wrangler.toml`:**
```toml
name = "code-chat-proxy"
main = "worker.js"
compatibility_date = "2024-11-01"

[triggers]
crons = ["*/5 * * * *"]
```

**Scheduled handler (`worker.js`):**
```javascript
async scheduled(_event, env, _ctx) {
  await fetch("https://rovdetection-code-1b-chat-space.hf.space/health");
}
```

---

## Chat UI — Next.js

The public interface is a **Next.js 14 (App Router)** application deployed on Vercel.

**Design:** Premium silver-black dark theme. Inspired by modern AI chat interfaces — AI messages flow naturally without bubbles, user messages are right-aligned pills.

**Features:**

- ⚡ **Real-time streaming** — tokens appear as the model generates via SSE
- 🎨 **Syntax highlighting** — `highlight.js` via `rehype-highlight` (GitHub Dark palette)
- 📝 **Full Markdown** — GFM tables, lists, blockquotes via `react-markdown` + `remark-gfm`
- 📋 **One-click copy** on every code block
- ⏹ **Stop generation** — AbortController cancels the in-flight stream
- 🔄 **New chat** — clears history instantly
- 💡 **Example prompt cards** — four starter prompts for new users
- 📱 **Responsive** — works on mobile and desktop

**Frontend stack:**

| Package | Purpose |
|---------|---------|
| `next@14` | Framework (App Router) |
| `react@18` | UI |
| `tailwindcss@3` | Styling |
| `react-markdown` | Markdown rendering |
| `remark-gfm` | GitHub-flavoured Markdown |
| `rehype-highlight` | Syntax highlighting |
| `highlight.js` | Highlight engine |
| `lucide-react` | Icons |
| `@vercel/functions` | `waitUntil` for background tasks |

---

## Repository Structure

```
code-chat-ui/                    ← Next.js frontend (this repo)
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts         ← API route: rate limit + proxy + log
│   ├── globals.css              ← Tailwind base + syntax theme + tokens
│   ├── layout.tsx               ← Root layout (DM Sans + JetBrains Mono)
│   └── page.tsx                 ← Chat UI (streaming, markdown, code blocks)
├── code-chat-proxy/             ← Cloudflare Worker
│   ├── worker.js                ← Keep-alive cron + rate limit proxy
│   └── wrangler.toml            ← CF Worker config with cron trigger
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json

HF Space (separate repo):        ← Inference API
├── app.py                       ← FastAPI + llama-cpp-python server
├── requirements.txt
└── Dockerfile
```

---

## Local Development

**Prerequisites:** Node.js 20+, npm

```bash
# 1. Clone the repo
git clone https://github.com/bharat-vicky/code-chat-ui.git
cd code-chat-ui

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.local.example .env.local
# Fill in the values (see Environment Variables below)

# 4. Start dev server
npm run dev
# → http://localhost:3000
```

**To run the inference API locally** (requires Python 3.10+):

```bash
# Install Python dependencies
pip install -r requirements.txt

# Set HF token (needed to download model)
export HF_TOKEN=your_token_here

# Start the API server
python app.py
# → http://localhost:7860

# Then in .env.local set:
# HF_SPACE_URL=http://localhost:7860
```

---

## Environment Variables

### Next.js (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `HF_SPACE_URL` | ✅ | Base URL of the HF Space inference API |
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis auth token |
| `SUPABASE_URL` | ✅ | Supabase project URL (no trailing slash) |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |

> ⚠️ None of these have the `NEXT_PUBLIC_` prefix — they are **server-side only** and never exposed to the browser.

**`.env.local.example`:**
```dotenv
HF_SPACE_URL=https://rovdetection-code-1b-chat-space.hf.space
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```

### Cloudflare Worker (Wrangler secrets)

```bash
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
```

### HF Space (Space secrets)

```
HF_TOKEN       → your Hugging Face write token
N_CTX          → 512 (default)
N_THREADS      → 2 (default — match vCPU count)
DEFAULT_TEMP   → 0.3 (default)
```

---

## API Reference

### `POST /v1/chat/completions`

OpenAI-compatible chat completion endpoint.

**Request:**
```json
{
  "model": "code-1b-chat-v2",
  "messages": [
    { "role": "system", "content": "Optional system prompt" },
    { "role": "user",   "content": "Write a Python quicksort function." }
  ],
  "max_tokens": 512,
  "temperature": 0.3,
  "top_p": 0.95,
  "repeat_penalty": 1.15,
  "stream": true,
  "stop": ["### Instruction:"]
}
```

**Non-streaming response:**
```json
{
  "id": "chatcmpl-1748123456",
  "object": "chat.completion",
  "created": 1748123456,
  "model": "code-1b-chat-v2",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "def quicksort(arr):..." },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 87,
    "total_tokens": 129
  }
}
```

**Streaming response (SSE):**
```
data: {"choices":[{"delta":{"content":"def"},"finish_reason":null}]}
data: {"choices":[{"delta":{"content":" quicksort"},"finish_reason":null}]}
...
data: [DONE]
```

**Rate limit response (429):**
```json
{ "error": "Rate limit: max 50 requests/hour." }
```

### `GET /health`

```json
{
  "status": "ok",
  "model": "code-1b-chat-v2",
  "model_loaded": true,
  "config": {
    "n_ctx": 512,
    "n_threads": 2,
    "f16_kv": true,
    "default_temp": 0.3,
    "repeat_penalty": 1.15
  }
}
```

---

## Deployment Guide

### 1. HF Space (Inference API)

```bash
# Create a new Space at huggingface.co/new-space
# SDK: Docker | Hardware: CPU Basic (free)

# Push the Space files
git clone https://huggingface.co/spaces/rovdetection/code-1b-chat-space
cp app.py requirements.txt Dockerfile ./code-1b-chat-space/
cd code-1b-chat-space && git add . && git commit -m "deploy" && git push
```

### 2. Upstash Redis

1. Sign up at [upstash.com](https://upstash.com) → Create Database
2. Select region closest to your HF Space
3. Copy **REST URL** and **REST Token**

### 3. Supabase

1. Sign up at [supabase.com](https://supabase.com) → New Project
2. Run the schema SQL in the SQL Editor (see [Query Logging](#query-logging--supabase))
3. Copy **Project URL** and **Anon Key** from Settings → API

### 4. Vercel (Chat UI)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Add environment variables in Vercel dashboard
# Settings → Environment Variables → add all 5 vars from table above
```

### 5. Cloudflare Worker (Keep-alive)

```bash
cd code-chat-proxy

# Add secrets
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY

# Deploy
wrangler deploy
```

---

## Cost Breakdown

| Service | Purpose | Free Tier | Monthly Cost |
|---------|---------|-----------|--------------|
| Kaggle | Model training | 30 GPU hrs/week | **$0** |
| Hugging Face Hub | Model storage | Unlimited public | **$0** |
| HF Spaces (CPU) | Inference API | 2 vCPUs, 16GB RAM | **$0** |
| Vercel | Chat UI + API route | 100GB bandwidth/mo | **$0** |
| Upstash Redis | Rate limiting | 10,000 cmds/day | **$0** |
| Supabase | Query logging | 500MB database | **$0** |
| Cloudflare Workers | Keep-alive cron | 100k requests/day | **$0** |
| **Total** | | | **$0.00/month** |

---

## Known Limitations

- **Inference speed** — The HF Space free CPU tier (2 vCPUs) generates at ~1–3 tokens/second. A typical response takes 1–5 minutes. For faster inference, consider upgrading to HF Spaces GPU ($9/month) or using the Kaggle T4 GPU trick with a Cloudflare Tunnel.

- **Model quality** — At 1.13B parameters, the model is significantly smaller than state-of-the-art code models (CodeLlama 7B+, DeepSeek-Coder 6.7B+). It handles simple Python tasks well but may struggle with complex algorithms, multi-file reasoning, or non-Python languages.

- **Context window** — Limited to 512 tokens by default (configurable via `N_CTX`). Long conversations are truncated.

- **Single user optimized** — The HF Space free tier handles one request at a time. Concurrent users will queue. The Cloudflare Worker rate limiter protects against abuse but doesn't solve throughput.

- **Session persistence** — No conversation history is saved. Each "New chat" is a fresh context.

- **Response logging** — On very slow responses (>240s), the logged response may be partial. The prompt is always fully logged.

---

## Roadmap

- [ ] Migrate inference to Kaggle T4 GPU via Cloudflare Tunnel (~30–50× speedup)
- [ ] Explore HF Spaces ZeroGPU (shared A10G, free)
- [ ] Add conversation history persistence (Supabase or localStorage)
- [ ] Build admin dashboard for query_logs analytics (Supabase + Metabase)
- [ ] Train on larger dataset for better code quality
- [ ] Add support for multi-turn context in the prompt builder
- [ ] Implement streaming token count in the UI
- [ ] Add model comparison mode (side-by-side generations)

---

## License

This project is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built from scratch by **Hridayanand Gupta**

*Pretrained → Fine-tuned → Quantized → Deployed → $0/month*

</div>
