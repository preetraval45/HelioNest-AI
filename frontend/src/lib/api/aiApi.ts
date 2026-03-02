import { apiClient } from "@/lib/apiClient";
import type { AISummary, AgentResponse, ChatMessage } from "@/types/ai";

export async function getPropertySummary(lat: number, lon: number, address: string): Promise<AISummary> {
  const { data } = await apiClient.post<AISummary>("/api/v1/ai/summary", { lat, lon, address });
  return data;
}

export async function sendChatMessage(
  message: string,
  lat: number,
  lon: number,
  address: string,
  history: ChatMessage[]
): Promise<AgentResponse> {
  const { data } = await apiClient.post<AgentResponse>("/api/v1/ai/chat", {
    message,
    lat,
    lon,
    address,
    conversation_history: history,
  });
  return data;
}
