from pydantic import BaseModel


class AISummaryRequest(BaseModel):
    lat: float
    lon: float
    address: str


class AISummaryOut(BaseModel):
    summary_text: str
    key_insights: list[str]
    recommendations: list[str]


class ChatMessageIn(BaseModel):
    role: str       # user / assistant
    content: str


class AIChatRequest(BaseModel):
    message: str
    lat: float
    lon: float
    address: str
    conversation_history: list[ChatMessageIn] = []


class AIChatOut(BaseModel):
    message: str
    agent: str
    sources: list[str] = []
