from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PropertyAnalysis(Base):
    __tablename__ = "property_analyses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Facade orientation scores (0-100, higher = more heat gain)
    heat_score_north: Mapped[float | None] = mapped_column(Float, nullable=True)
    heat_score_south: Mapped[float | None] = mapped_column(Float, nullable=True)
    heat_score_east: Mapped[float | None] = mapped_column(Float, nullable=True)
    heat_score_west: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Overall scores (0-100)
    solar_potential_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    outdoor_comfort_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    annual_heat_risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Risk labels: low / moderate / high / very_high / extreme
    annual_heat_risk_level: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Worst car parking hour (0-23) for peak summer month
    worst_car_heat_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    worst_car_interior_temp_c: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── Relationships ──────────────────────────────────────────────────────────
    location: Mapped["Location"] = relationship(back_populates="property_analyses")  # noqa: F821

    def __repr__(self) -> str:
        return f"<PropertyAnalysis id={self.id} location_id={self.location_id}>"
