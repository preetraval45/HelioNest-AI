"use client";

import { useState, useRef, useEffect } from "react";
import { Navbar } from "@/components/Navbar";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const WELCOME: Message = {
  id: 0,
  role: "assistant",
  content:
    "Hi! I'm HelioNest AI, powered by Claude. I can answer questions about solar conditions, weather patterns, property heat impact, and climate data for any U.S. address. Try asking me something like:\n\n• \"What's the best time of year to use solar panels in Phoenix, AZ?\"\n• \"How hot does a car get in Charlotte, NC in July?\"\n• \"Which direction should windows face in Seattle for maximum winter sun?\"",
  timestamp: new Date(),
};

const SUGGESTIONS = [
  "Best month for solar panels in Miami, FL?",
  "Car heat risk in Las Vegas in August?",
  "Compare climate: Chicago vs Houston",
  "UV risk score for Denver in summer?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(text?: string) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Placeholder response — real AI endpoint wired in Task 2.4 orchestrator
    await new Promise((r) => setTimeout(r, 1200));
    const assistantMsg: Message = {
      id: Date.now() + 1,
      role: "assistant",
      content:
        "The AI chat endpoint will be connected via the multi-agent orchestrator (Task 2.4). For now, try analyzing a specific address from the home page to get full climate insights.",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-th-bg">
      <Navbar />

      {/* Background glow orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-24 left-1/4 w-72 h-72 rounded-full bg-th-moon/5 blur-3xl" />
        <div className="absolute bottom-24 right-1/4 w-60 h-60 rounded-full bg-th-solar/5 blur-3xl" />
      </div>

      {/* Chat layout */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-6 relative z-10">
        {/* Chat header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-th-moon/10 border border-th-moon/20 flex items-center justify-center text-xl shrink-0">
            🤖
          </div>
          <div>
            <h1 className="font-bold text-th-text">AI Climate Assistant</h1>
            <p className="text-xs text-th-muted">Powered by Claude · Ask anything about property climate</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-th-weather/10 border border-th-weather/20">
            <span className="w-1.5 h-1.5 rounded-full bg-th-weather animate-pulse" />
            <span className="text-xs text-th-weather font-medium">Online</span>
          </div>
        </div>

        {/* Suggestion chips — only shown when just the welcome message exists */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSend(s)}
                className="px-3 py-1.5 rounded-xl text-xs text-th-text-2 bg-th-bg-2 border border-th-border hover:border-th-moon/40 hover:text-th-moon transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pb-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {m.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-th-moon/10 border border-th-moon/20 flex items-center justify-center text-sm shrink-0 mt-1">
                  🤖
                </div>
              )}
              <div
                className={`max-w-lg rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-th-solar text-white rounded-tr-sm"
                    : "bg-th-bg-card border border-th-border text-th-text rounded-tl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-th-moon/10 border border-th-moon/20 flex items-center justify-center text-sm shrink-0 mt-1">
                🤖
              </div>
              <div className="bg-th-bg-card border border-th-border rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1.5 items-center h-5">
                  <span className="w-2 h-2 rounded-full bg-th-muted animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-th-muted animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-th-muted animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="flex gap-2 pt-4 border-t border-th-border">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask about solar, weather, or climate at any U.S. address..."
            disabled={loading}
            className="input-field flex-1 rounded-xl px-4 py-3 text-sm disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            className="btn-solar px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
