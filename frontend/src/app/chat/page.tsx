"use client";

import { Navbar } from "@/components/Navbar";
import { AIChat } from "@/components/AIChat";

export default function ChatPage() {
  return (
    <div className="min-h-screen flex flex-col bg-th-bg">
      <Navbar />

      {/* Background glow orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-24 left-1/4 w-72 h-72 rounded-full bg-th-moon/5 blur-3xl" />
        <div className="absolute bottom-24 right-1/4 w-60 h-60 rounded-full bg-th-solar/5 blur-3xl" />
      </div>

      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-6 relative z-10 min-h-0">
        {/* Chat header */}
        <div className="flex items-center gap-3 mb-5 shrink-0">
          <div className="w-11 h-11 rounded-xl bg-th-moon/10 border border-th-moon/20 flex items-center justify-center text-xl shrink-0">
            🤖
          </div>
          <div>
            <h1 className="font-bold text-th-text">AI Climate Assistant</h1>
            <p className="text-xs text-th-muted">Powered by Claude · Multi-agent · Streaming</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-th-weather/10 border border-th-weather/20">
            <span className="w-1.5 h-1.5 rounded-full bg-th-weather animate-pulse" />
            <span className="text-xs text-th-weather font-medium">Online</span>
          </div>
        </div>

        <AIChat className="flex-1 min-h-0" />
      </div>
    </div>
  );
}
