"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trackEvent } from "@/components/PostHogProvider";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  agentUsed?: string;
}

interface AIChatProps {
  propertyData?: Record<string, unknown>;
  suggestedQuestions?: string[];
  className?: string;
}

const WELCOME: ChatMessage = {
  id: 0,
  role: "assistant",
  content:
    "Hi! I'm HelioNest AI, powered by Claude. Ask me anything about **solar conditions**, **weather patterns**, **property heat impact**, or **climate risk** for any U.S. address.\n\nTry one of the suggested questions below, or type your own.",
};

const AGENT_LABELS: Record<string, string> = {
  solar: "☀️ Solar Agent",
  weather: "🌤️ Weather Agent",
  impact: "🏠 Impact Agent",
  prediction: "🔮 Prediction Agent",
  general: "🤖 General AI",
};

export function AIChat({ propertyData = {}, suggestedQuestions = [], className = "" }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: Date.now(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    trackEvent("ai_question_asked", { question_length: trimmed.length });
    setInput("");
    setLoading(true);
    setStreamingText("");

    const history = messages
      .filter((m) => m.id !== 0)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          property_data: propertyData,
          conversation_history: history,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("API error");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let agentUsed = "general";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.chunk) {
              accumulated += payload.chunk;
              setStreamingText(accumulated);
            }
            if (payload.done) {
              agentUsed = payload.agent_used ?? "general";
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: accumulated || "No response.", agentUsed },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "Sorry, I couldn't connect to the AI service. Make sure `ANTHROPIC_API_KEY` is configured.",
        },
      ]);
    } finally {
      setLoading(false);
      setStreamingText("");
      inputRef.current?.focus();
    }
  }, [loading, messages, propertyData]);

  const defaultSuggestions = suggestedQuestions.length > 0 ? suggestedQuestions : [
    "What's the best month for solar panels here?",
    "How hot can a parked car get in summer?",
    "What are the climate risks for this property?",
    "When is outdoor comfort best throughout the year?",
  ];

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Messages */}
      <div
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4 min-h-0"
      >
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-th-moon/10 border border-th-moon/20 flex items-center justify-center text-sm shrink-0 mt-1">
                🤖
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "bg-th-solar text-white rounded-tr-sm"
                : "bg-th-bg-card border border-th-border text-th-text rounded-tl-sm"
            }`}>
              {m.role === "assistant" ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                    strong: ({ children }) => <strong className="font-semibold text-th-solar">{children}</strong>,
                    code: ({ children }) => (
                      <code className="px-1 py-0.5 rounded bg-th-bg-2 text-th-solar text-xs font-mono">{children}</code>
                    ),
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              ) : (
                m.content
              )}
              {m.agentUsed && m.agentUsed !== "general" && (
                <div className="mt-2 pt-2 border-t border-th-border">
                  <span className="text-xs text-th-muted">{AGENT_LABELS[m.agentUsed] ?? m.agentUsed}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming in-progress bubble */}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-th-moon/10 border border-th-moon/20 flex items-center justify-center text-sm shrink-0 mt-1">
              🤖
            </div>
            <div className="max-w-[85%] bg-th-bg-card border border-th-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-th-text">
              {streamingText ? (
                <span>{streamingText}<span aria-hidden="true" className="inline-block w-0.5 h-4 bg-th-solar ml-0.5 animate-pulse align-middle" /></span>
              ) : (
                <output aria-label="HelioNest AI is thinking" className="flex gap-1.5 items-center h-5">
                  <span aria-hidden="true" className="w-2 h-2 rounded-full bg-th-muted animate-bounce [animation-delay:0ms]" />
                  <span aria-hidden="true" className="w-2 h-2 rounded-full bg-th-muted animate-bounce [animation-delay:150ms]" />
                  <span aria-hidden="true" className="w-2 h-2 rounded-full bg-th-muted animate-bounce [animation-delay:300ms]" />
                </output>
              )}
            </div>
          </div>
        )}

        {/* Suggestion chips — shown only at start */}
        {messages.length === 1 && !loading && (
          <div className="flex flex-wrap gap-2 mt-2">
            {defaultSuggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendMessage(q)}
                className="px-3 py-1.5 rounded-xl text-xs text-th-text-2 bg-th-bg-2 border border-th-border hover:border-th-moon/40 hover:text-th-moon transition-all text-left"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-2 pt-3 border-t border-th-border shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage(input);
            }
          }}
          placeholder="Ask about solar, weather, heat impact, or climate risk..."
          aria-label="Ask HelioNest AI a question"
          disabled={loading}
          className="input-field flex-1 rounded-xl px-4 py-3 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70"
        />
        <button
          type="button"
          onClick={() => void sendMessage(input)}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          className="btn-solar px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-500"
        >
          Send
        </button>
      </div>
    </div>
  );
}
