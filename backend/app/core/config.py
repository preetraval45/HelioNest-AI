from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    APP_NAME: str = "HelioNest-AI"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # API
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://helionest:helionest@localhost:5432/helionest_dev"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # AI
    ANTHROPIC_API_KEY: str = ""

    # External APIs
    GEOCODIO_API_KEY: str = ""
    NREL_API_KEY: str = ""
    MAPBOX_TOKEN: str = ""
    OPENAQ_API_KEY: str = ""

    # Security
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ALGORITHM: str = "HS256"

    # Rate limiting
    RATE_LIMIT_AI_CHAT: str = "20/minute"
    RATE_LIMIT_GEOCODE: str = "60/minute"
    RATE_LIMIT_DEFAULT: str = "100/minute"

    # Cache TTLs (seconds)
    CACHE_TTL_GEOCODE: int = 60 * 60 * 24 * 7       # 7 days
    CACHE_TTL_SOLAR_DAILY: int = 60 * 60 * 24        # 1 day
    CACHE_TTL_SOLAR_SEASONAL: int = 60 * 60 * 24 * 90  # 90 days
    CACHE_TTL_WEATHER_CURRENT: int = 60 * 30         # 30 minutes
    CACHE_TTL_WEATHER_FORECAST: int = 60 * 60        # 1 hour
    CACHE_TTL_WEATHER_MONTHLY: int = 60 * 60 * 24 * 7  # 7 days
    CACHE_TTL_AI_SUMMARY: int = 60 * 60 * 6          # 6 hours


settings = Settings()
