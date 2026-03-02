from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WeatherSnapshot(Base):
    __tablename__ = "weather_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Current conditions
    temp_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    feels_like_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    precipitation_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    uv_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    conditions: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Derived comfort
    heat_index_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_chill_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    comfort_score: Mapped[float | None] = mapped_column(Float, nullable=True)   # 0-100
    comfort_level: Mapped[str | None] = mapped_column(String(20), nullable=True)  # great/good/moderate/uncomfortable/dangerous

    # ── Relationships ──────────────────────────────────────────────────────────
    location: Mapped["Location"] = relationship(back_populates="weather_snapshots")  # noqa: F821

    def __repr__(self) -> str:
        return f"<WeatherSnapshot id={self.id} location_id={self.location_id} fetched_at={self.fetched_at}>"
