from fastapi import APIRouter

from app.api.v1.endpoints import address, ai_chat, auth, health, impact, moon, neighbors, snapshot, solar, weather

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(address.router, prefix="/address", tags=["address"])
api_router.include_router(solar.router, prefix="/solar", tags=["solar"])
api_router.include_router(weather.router, prefix="/weather", tags=["weather"])
api_router.include_router(moon.router, prefix="/moon", tags=["moon"])
api_router.include_router(impact.router, prefix="/impact", tags=["impact"])
api_router.include_router(ai_chat.router, prefix="/ai", tags=["ai"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(neighbors.router, tags=["neighbors"])
api_router.include_router(snapshot.router, prefix="/property", tags=["property"])
