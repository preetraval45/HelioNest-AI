export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  agent?: string; // which specialist agent responded
}

export interface AgentResponse {
  message: string;
  agent: string;
  sources?: string[];
}

export interface AISummary {
  summary_text: string;
  key_insights: string[];
  recommendations: string[];
}
