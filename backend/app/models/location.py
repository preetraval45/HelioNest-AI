from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    formatted_address: Mapped[str] = mapped_column(String(500), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    lon: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(50), nullable=False)
    zip: Mapped[str] = mapped_column(String(20), nullable=False)
    # PostGIS geography point — enables spatial queries (distance, bbox, etc.)
    geom: Mapped[object] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationships ──────────────────────────────────────────────────────────
    property_analyses: Mapped[list["PropertyAnalysis"]] = relationship(  # noqa: F821
        back_populates="location", cascade="all, delete-orphan"
    )
    weather_snapshots: Mapped[list["WeatherSnapshot"]] = relationship(  # noqa: F821
        back_populates="location", cascade="all, delete-orphan"
    )
    solar_snapshots: Mapped[list["SolarSnapshot"]] = relationship(  # noqa: F821
        back_populates="location", cascade="all, delete-orphan"
    )
    saved_by_users: Mapped[list["SavedProperty"]] = relationship(  # noqa: F821
        back_populates="location", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Location id={self.id} address={self.formatted_address!r}>"
