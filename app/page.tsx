"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import {
  Send,
  Square,
  Code2,
  Copy,
  Check,
  RotateCcw,
  Plus,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */
type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
}

interface Convo {
  id: string;
  title: string;
  ago: string;
}

const EXAMPLE_PROMPTS = [
  "Write a Python function using the Sieve of Eratosthenes",
  "Explain the difference between list and tuple with examples",
  "Implement binary search with thorough inline comments",
  "Create a decorator that measures function execution time",
];

/* ── Code block ─────────────────────────────────────────────────────────── */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="relative my-4 rounded-xl overflow-hidden"
      style={{
        border: "1px solid rgba(190, 210, 228, 0.08)",
        background: "#04070d",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{
          background: "rgba(8, 12, 18, 0.9)",
          borderBottom: "1px solid rgba(190, 210, 228, 0.06)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Traffic-light dots */}
          <div className="flex gap-1.5">
            {[0.18, 0.12, 0.07].map((o, i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: `rgba(140, 164, 184, ${o})` }}
              />
            ))}
          </div>
          <span
            className="text-[11px] tracking-widest"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--silver-1)",
              letterSpacing: "0.09em",
            }}
          >
            {lang || "plaintext"}
          </span>
        </div>

        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-[11px] transition-colors duration-200"
          style={{ color: copied ? "#70c8b8" : "var(--silver-1)" }}
        >
          {copied ? (
            <>
              <Check size={11} /> Copied
            </>
          ) : (
            <>
              <Copy size={11} /> Copy
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <pre
        className="overflow-x-auto p-5 text-[13px] leading-[1.75]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <code className={lang ? `language-${lang} hljs` : ""}>{code}</code>
      </pre>
    </div>
  );
}

/* ── Markdown renderer ──────────────────────────────────────────────────── */
function MsgMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code({ className, children, ...props }) {
          const lang = (className || "").replace("language-", "");
          const code = String(children).replace(/\n$/, "");
          const block = code.includes("\n") || Boolean(lang);

          if (block) return <CodeBlock code={code} lang={lang || undefined} />;

          return (
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.82em",
                padding: "2px 7px",
                borderRadius: "5px",
                background: "rgba(6, 10, 16, 0.8)",
                border: "1px solid rgba(190, 210, 228, 0.1)",
                color: "#90b8d4",
              }}
              {...props}
            >
              {children}
            </code>
          );
        },

        p: ({ children }) => (
          <p className="mb-3 last:mb-0" style={{ lineHeight: "1.8" }}>
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul
            className="mb-3 pl-5 space-y-1.5"
            style={{ listStyleType: "disc" }}
          >
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol
            className="mb-3 pl-5 space-y-1.5"
            style={{ listStyleType: "decimal" }}
          >
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li style={{ color: "var(--text-1)", lineHeight: "1.75" }}>
            {children}
          </li>
        ),
        h1: ({ children }) => (
          <h1
            className="text-xl font-semibold mt-5 mb-2"
            style={{
              color: "var(--silver-4)",
              fontFamily: "var(--font-serif)",
              letterSpacing: "0.01em",
            }}
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            className="text-base font-semibold mt-4 mb-2"
            style={{ color: "var(--silver-3)" }}
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            className="text-sm font-semibold mt-3 mb-1"
            style={{ color: "var(--silver-2)" }}
          >
            {children}
          </h3>
        ),
        blockquote: ({ children }) => (
          <blockquote
            style={{
              borderLeft: "2px solid rgba(140, 164, 184, 0.25)",
              paddingLeft: "16px",
              margin: "14px 0",
              color: "var(--text-2)",
              fontStyle: "italic",
            }}
          >
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table
              style={{
                width: "100%",
                fontSize: "13px",
                borderCollapse: "collapse",
                border: "1px solid rgba(190, 210, 228, 0.08)",
              }}
            >
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            style={{
              border: "1px solid rgba(190, 210, 228, 0.08)",
              padding: "8px 14px",
              background: "rgba(8, 12, 18, 0.7)",
              textAlign: "left",
              fontWeight: 500,
              color: "var(--silver-3)",
              fontSize: "12px",
              letterSpacing: "0.03em",
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            style={{
              border: "1px solid rgba(190, 210, 228, 0.06)",
              padding: "8px 14px",
              color: "var(--text-1)",
              fontSize: "13px",
            }}
          >
            {children}
          </td>
        ),
        hr: () => <hr className="hairline my-5" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Collapse sidebar on mobile */
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  /* Auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const reset = () => {
    stop();
    setMessages([]);
    setInput("");
    setError(null);
  };

  const send = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      const asstMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, asstMsg]);
      setInput("");
      setError(null);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            max_tokens: 512,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`API error ${res.status}`);
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const chunk = parsed.choices?.[0]?.delta?.content ?? "";
              if (chunk) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: updated[updated.length - 1].content + chunk,
                  };
                  return updated;
                });
              }
            } catch {
              /* skip malformed */
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== asstMsg.id));
      } finally {
        setStreaming(false);
      }
    },
    [input, messages, streaming],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const activeTitle =
    messages.find((m) => m.role === "user")?.content.slice(0, 42) ?? null;

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--base)" }}
    >
      {/* ════════════════════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════════════════════ */}
      <aside
        className="flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
        style={{
          width: sidebarOpen ? "260px" : "0px",
          background: "var(--panel)",
          borderRight: "1px solid var(--border-faint)",
        }}
      >
        {/* Inner container — fixed width so content doesn't squeeze */}
        <div className="flex flex-col h-full" style={{ width: "260px" }}>
          {/* Brand mark */}
          <div className="px-5 pt-6 pb-5">
            <div className="flex items-center gap-3 mb-6">
              {/* Icon mark */}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background:
                    "linear-gradient(145deg, #101820 0%, #182030 100%)",
                  border: "1px solid rgba(184, 204, 216, 0.18)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <Code2 size={15} style={{ color: "var(--silver-3)" }} />
              </div>

              {/* Logotype */}
              <span
                className="text-[17px] font-light tracking-[0.22em] uppercase metallic leading-none"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Forge
              </span>
            </div>

            {/* New conversation */}
            <button
              onClick={reset}
              className="silver-btn w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px]"
              style={{
                color: "var(--silver-3)",
                fontWeight: 400,
                letterSpacing: "0.01em",
              }}
            >
              <Plus size={14} strokeWidth={1.8} />
              New conversation
            </button>
          </div>

          <hr className="hairline mx-4" />

          {/* Conversation list */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
            {/* Active session */}
            {activeTitle && (
              <section>
                <p
                  className="text-[10px] uppercase px-2.5 mb-1.5"
                  style={{
                    color: "var(--text-4)",
                    letterSpacing: "0.14em",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Current
                </p>
                <div
                  className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                  style={{
                    background: "rgba(184, 204, 216, 0.06)",
                    border: "1px solid rgba(184, 204, 216, 0.1)",
                  }}
                >
                  <MessageSquare
                    size={12}
                    strokeWidth={1.6}
                    style={{
                      color: "var(--silver-2)",
                      marginTop: "2px",
                      flexShrink: 0,
                    }}
                  />
                  <div className="min-w-0">
                    <p
                      className="text-[12px] truncate leading-snug"
                      style={{ color: "var(--text-1)" }}
                    >
                      {activeTitle}
                      {activeTitle.length === 42 ? "…" : ""}
                    </p>
                    <p
                      className="text-[10px] mt-0.5"
                      style={{
                        color: "var(--text-3)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      Just now
                    </p>
                  </div>
                </div>
              </section>
            )}
          </nav>

          {/* Model pill */}
          <div
            className="px-4 py-4"
            style={{ borderTop: "1px solid var(--border-faint)" }}
          >
            <div
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
              style={{
                background: "rgba(6, 10, 16, 0.6)",
                border: "1px solid var(--border-faint)",
              }}
            >
              {/* Pulsing indicator */}
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  background: "var(--silver-2)",
                  boxShadow: "0 0 5px var(--silver-2)",
                }}
              />
              <span
                className="text-[10px] tracking-widest truncate"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--silver-1)",
                  letterSpacing: "0.08em",
                }}
              >
                code-1b-chat-v2
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════
          MAIN
      ════════════════════════════════════════════════════════ */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* ── Top bar ────────────────────────────────────────────── */}
        <header
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{
            borderBottom: "1px solid var(--border-faint)",
            background: "rgba(4, 6, 10, 0.85)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 rounded-lg transition-colors duration-150 hover:bg-white/[0.04]"
              style={{ color: "var(--text-3)" }}
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose size={16} strokeWidth={1.5} />
              ) : (
                <PanelLeft size={16} strokeWidth={1.5} />
              )}
            </button>

            {/* Brand (visible when sidebar is closed) */}
            {!sidebarOpen && (
              <div className="flex items-center gap-2">
                <Code2
                  size={15}
                  style={{ color: "var(--silver-2)" }}
                  strokeWidth={1.6}
                />
                <span
                  className="text-[15px] font-light tracking-[0.2em] uppercase metallic"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Forge
                </span>
              </div>
            )}
          </div>

          {/* New chat button (only when there are messages) */}
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors duration-150 hover:bg-white/[0.04]"
              style={{ color: "var(--text-2)" }}
            >
              <RotateCcw size={12} strokeWidth={1.6} />
              New chat
            </button>
          )}
        </header>

        {/* ── Messages ───────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[680px] mx-auto px-5 py-8 space-y-7">
            {/* ── Welcome screen ─────────────────────────────────── */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[calc(100vh-180px)] text-center">
                {/* Icon mark */}
                <div className="mb-8 fade-up">
                  <div
                    className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center mx-auto mb-6"
                    style={{
                      background:
                        "linear-gradient(145deg, #0d1520 0%, #162030 50%, #0d1520 100%)",
                      border: "1px solid rgba(184, 204, 216, 0.16)",
                      boxShadow:
                        "0 0 48px rgba(140, 164, 184, 0.05), inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                  >
                    <Code2
                      size={30}
                      style={{ color: "var(--silver-3)" }}
                      strokeWidth={1.4}
                    />
                  </div>

                  <h1
                    className="text-5xl font-light tracking-[0.28em] uppercase metallic mb-3 leading-none"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    Forge
                  </h1>

                  <p
                    className="text-[13px] tracking-widest"
                    style={{
                      color: "var(--text-3)",
                      letterSpacing: "0.06em",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    code intelligence · 1.13b
                  </p>
                </div>

                {/* Example prompts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-[540px] fade-up fade-up-delay-1">
                  {EXAMPLE_PROMPTS.map((p, i) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="prompt-card text-left px-4 py-4 rounded-xl"
                      style={{
                        background: "rgba(8, 12, 18, 0.7)",
                        border: "1px solid var(--border-subtle)",
                        animationDelay: `${i * 55}ms`,
                      }}
                    >
                      <p
                        className="text-[12.5px] leading-relaxed"
                        style={{ color: "var(--text-2)", lineHeight: "1.65" }}
                      >
                        {p}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Message list ───────────────────────────────────── */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-4 msg-enter ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                {/* Avatar */}
                <div
                  className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                  style={
                    msg.role === "user"
                      ? {
                          background:
                            "linear-gradient(145deg, #131e2c 0%, #1c2a3a 100%)",
                          border: "1px solid rgba(184, 204, 216, 0.2)",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                        }
                      : {
                          background: "rgba(8, 12, 18, 0.8)",
                          border: "1px solid var(--border-subtle)",
                        }
                  }
                >
                  {msg.role === "user" ? (
                    <span
                      style={{
                        fontSize: "9px",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 500,
                        color: "var(--silver-3)",
                        letterSpacing: "0.05em",
                      }}
                    >
                      U
                    </span>
                  ) : (
                    <Code2
                      size={12}
                      strokeWidth={1.5}
                      style={{ color: "var(--silver-2)" }}
                    />
                  )}
                </div>

                {/* Bubble / content */}
                <div className="max-w-[84%] text-[14px] min-w-0">
                  {msg.role === "user" ? (
                    <div
                      className="px-4 py-3 rounded-2xl rounded-tr-[6px]"
                      style={{
                        background: "rgba(14, 22, 34, 0.85)",
                        border: "1px solid rgba(184, 204, 216, 0.11)",
                        color: "var(--text-1)",
                        backdropFilter: "blur(8px)",
                        lineHeight: "1.75",
                      }}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <div style={{ color: "var(--text-1)", minHeight: "28px" }}>
                      {msg.content ? (
                        <MsgMarkdown content={msg.content} />
                      ) : (
                        /* Thinking indicator */
                        <div
                          className="flex items-center gap-2.5 py-2"
                          style={{ color: "var(--text-3)" }}
                        >
                          <div className="flex items-center gap-[5px]">
                            <span
                              className="dot-1 w-[5px] h-[5px] rounded-full"
                              style={{
                                background: "var(--silver-2)",
                                display: "inline-block",
                              }}
                            />
                            <span
                              className="dot-2 w-[5px] h-[5px] rounded-full"
                              style={{
                                background: "var(--silver-2)",
                                display: "inline-block",
                              }}
                            />
                            <span
                              className="dot-3 w-[5px] h-[5px] rounded-full"
                              style={{
                                background: "var(--silver-2)",
                                display: "inline-block",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "11px",
                              fontFamily: "var(--font-mono)",
                              color: "var(--text-3)",
                              letterSpacing: "0.08em",
                            }}
                          >
                            Processing…
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Error */}
            {error && (
              <div
                className="text-center text-[12px] py-2.5 px-5 rounded-xl mx-auto max-w-sm"
                style={{
                  color: "#e88a8a",
                  background: "rgba(232, 138, 138, 0.05)",
                  border: "1px solid rgba(232, 138, 138, 0.15)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        {/* ── Input footer ───────────────────────────────────────── */}
        <footer
          className="px-5 pb-5 pt-3 flex-shrink-0"
          style={{
            background: "rgba(4, 6, 10, 0.7)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="max-w-[680px] mx-auto">
            {/* Input wrapper */}
            <div
              className="input-wrap flex items-end gap-3 px-4 py-3.5 rounded-2xl"
              style={{
                background: "rgba(8, 12, 18, 0.92)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask anything about code…"
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none leading-relaxed min-h-[22px] max-h-44"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "14px",
                  color: "var(--text-1)",
                  caretColor: "var(--silver-3)",
                }}
              />

              {/* Send / Stop button */}
              <button
                onClick={streaming ? stop : () => send()}
                disabled={!streaming && !input.trim()}
                className={[
                  "flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200",
                  !streaming && input.trim() ? "send-active" : "",
                ].join(" ")}
                style={
                  streaming
                    ? {
                        background: "rgba(232, 138, 138, 0.1)",
                        border: "1px solid rgba(232, 138, 138, 0.28)",
                        color: "#e88a8a",
                      }
                    : !input.trim()
                      ? {
                          background: "rgba(8, 12, 18, 0.6)",
                          border: "1px solid var(--border-faint)",
                          color: "var(--text-4)",
                          cursor: "not-allowed",
                        }
                      : {}
                }
              >
                {streaming ? (
                  <Square size={13} strokeWidth={1.8} />
                ) : (
                  <Send
                    size={13}
                    strokeWidth={1.8}
                    style={{ color: "var(--silver-3)" }}
                  />
                )}
              </button>
            </div>

            {/* Footer note */}
            <p
              className="text-center text-[10px] mt-2.5"
              style={{
                color: "var(--text-4)",
                letterSpacing: "0.04em",
                fontFamily: "var(--font-mono)",
              }}
            >
              Shift ↵ for new line · Responses may contain errors
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
