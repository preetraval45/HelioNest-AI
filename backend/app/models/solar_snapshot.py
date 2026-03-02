from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SolarSnapshot(Base):
    __tablename__ = "solar_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Sun event times (stored as time-of-day)
    sunrise: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    solar_noon: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sunset: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    day_length_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Peak sun position
    max_elevation_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    solar_noon_azimuth_deg: Mapped[float | None] = mapped_column(Float, nullable=True)

    # NREL irradiance data
    daily_irradiance_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)
    peak_sun_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationships ──────────────────────────────────────────────────────────
    location: Mapped["Location"] = relationship(back_populates="solar_snapshots")  # noqa: F821

    def __repr__(self) -> str:
        return f"<SolarSnapshot id={self.id} location_id={self.location_id} date={self.snapshot_date}>"
