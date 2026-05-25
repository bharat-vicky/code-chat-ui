"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Send, Square, Code2, Copy, Check, RotateCcw } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
type Role = "user" | "assistant";
interface Message {
  id:      string;
  role:    Role;
  content: string;
}

// ── Code block component with copy button ─────────────────────────────
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-[#30363d]">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#161b22] border-b border-[#30363d]">
        <span className="text-xs text-[#8b949e] font-mono">{lang || "code"}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          {copied
            ? <><Check size={12} className="text-green-400" /> Copied</>
            : <><Copy size={12} /> Copy</>
          }
        </button>
      </div>
      <pre className="overflow-x-auto p-4 bg-[#0d1117] text-sm leading-relaxed">
        <code className={lang ? `language-${lang} hljs` : ""}>{code}</code>
      </pre>
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────
function MsgMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code({ className, children, ...props }) {
          const lang  = (className || "").replace("language-", "");
          const code  = String(children).replace(/\n$/, "");
          const block = code.includes("\n") || lang;

          if (block) return <CodeBlock code={code} lang={lang || undefined} />;
          return (
            <code
              className="px-1.5 py-0.5 rounded bg-[#161b22] text-[#a5d6ff] text-sm font-mono border border-[#30363d]"
              {...props}
            >
              {children}
            </code>
          );
        },
        p:          ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
        ul:         ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
        ol:         ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
        li:         ({ children }) => <li className="text-[#e6edf3]">{children}</li>,
        h1:         ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
        h2:         ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>,
        h3:         ({ children }) => <h3 className="text-base font-semibold mt-3 mb-1">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-[#388bfd] pl-4 my-3 text-[#8b949e] italic">
            {children}
          </blockquote>
        ),
        table:      ({ children }) => (
          <div className="overflow-x-auto my-3">
            <table className="w-full text-sm border-collapse border border-[#30363d]">{children}</table>
          </div>
        ),
        th:         ({ children }) => <th className="border border-[#30363d] px-3 py-2 bg-[#161b22] text-left font-semibold">{children}</th>,
        td:         ({ children }) => <td className="border border-[#30363d] px-3 py-2">{children}</td>,
        hr:         () => <hr className="my-4 border-[#30363d]" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
const EXAMPLE_PROMPTS = [
  "Write a Python function to find all prime numbers up to n using the Sieve of Eratosthenes",
  "Explain the difference between a list and a tuple in Python",
  "Write a binary search implementation in Python with comments",
  "How do I use a decorator to measure function execution time?",
];

export default function ChatPage() {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new content
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

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content };
    const asstMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };

    setMessages(prev => [...prev, userMsg, asstMsg]);
    setInput("");
    setError(null);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current  = controller;

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role, content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: history, max_tokens: 512, temperature: 0.7 }),
        signal:  controller.signal,
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

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
            const parsed  = JSON.parse(data);
            const chunk   = parsed.choices?.[0]?.delta?.content ?? "";
            if (chunk) {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + chunk,
                };
                return updated;
              });
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setMessages(prev => prev.filter(m => m.id !== asstMsg.id));
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#21262d] bg-[#161b22]">
        <div className="flex items-center gap-2">
          <Code2 size={20} className="text-[#388bfd]" />
          <span className="font-semibold text-sm">Code Assistant</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-[#1f2d3d] text-[#58a6ff] border border-[#1f6feb] ml-1">
            code-1b-chat-v2
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors px-2 py-1 rounded hover:bg-[#21262d]"
          >
            <RotateCcw size={13} /> New chat
          </button>
        )}
      </header>

      {/* ── Messages ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Welcome state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 pb-20">
            <div>
              <div className="w-14 h-14 rounded-xl bg-[#1f2d3d] border border-[#1f6feb] flex items-center justify-center mx-auto mb-3">
                <Code2 size={28} className="text-[#388bfd]" />
              </div>
              <h1 className="text-xl font-semibold mb-1">Code Assistant</h1>
              <p className="text-sm text-[#8b949e]">
                Powered by a 1.13B model trained on Python code
              </p>
            </div>

            {/* Example prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-left text-xs p-3 rounded-lg border border-[#30363d] bg-[#161b22] hover:border-[#388bfd] hover:bg-[#1f2d3d] transition-all text-[#8b949e] hover:text-[#e6edf3] leading-relaxed"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>

            {/* Avatar */}
            <div className={`
              w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5
              ${msg.role === "user"
                ? "bg-[#388bfd] text-white"
                : "bg-[#21262d] text-[#8b949e] border border-[#30363d]"}
            `}>
              {msg.role === "user" ? "U" : "AI"}
            </div>

            {/* Bubble */}
            <div className={`
              max-w-[85%] rounded-xl px-4 py-3 text-sm
              ${msg.role === "user"
                ? "bg-[#1f2d3d] border border-[#1f6feb] text-[#e6edf3] rounded-tr-sm"
                : "bg-[#161b22] border border-[#21262d] text-[#e6edf3] rounded-tl-sm"}
            `}>
              {msg.role === "assistant" ? (
                msg.content
                  ? <MsgMarkdown content={msg.content} />
                  : <span className="text-[#8b949e] flex items-center gap-1.5">
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-[#388bfd] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1 h-1 rounded-full bg-[#388bfd] animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1 h-1 rounded-full bg-[#388bfd] animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                      Thinking
                    </span>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Error */}
        {error && (
          <div className="mx-auto max-w-sm text-center text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* ── Input ───────────────────────────────────────────────────── */}
      <footer className="px-4 pb-4 pt-2 border-t border-[#21262d] bg-[#0d1117]">
        <div className="flex items-end gap-2 bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3 focus-within:border-[#388bfd] transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a coding question… (Shift+Enter for new line)"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-[#e6edf3] placeholder-[#484f58] min-h-[24px] max-h-48 leading-relaxed"
          />
          <button
            onClick={streaming ? stop : () => send()}
            disabled={!streaming && !input.trim()}
            className={`
              flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all
              ${streaming
                ? "bg-red-600 hover:bg-red-500 text-white"
                : input.trim()
                  ? "bg-[#388bfd] hover:bg-[#58a6ff] text-white"
                  : "bg-[#21262d] text-[#484f58] cursor-not-allowed"}
            `}
          >
            {streaming ? <Square size={14} /> : <Send size={14} />}
          </button>
        </div>
        <p className="text-center text-xs text-[#484f58] mt-2">
          Responses may be inaccurate. Verify code before use.
        </p>
      </footer>

    </div>
  );
}
