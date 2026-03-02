from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SavedProperty(Base):
    __tablename__ = "saved_properties"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nickname: Mapped[str | None] = mapped_column(String(100), nullable=True)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationships ──────────────────────────────────────────────────────────
    user: Mapped["User"] = relationship(back_populates="saved_properties")  # noqa: F821
    location: Mapped["Location"] = relationship(back_populates="saved_by_users")  # noqa: F821

    def __repr__(self) -> str:
        return f"<SavedProperty id={self.id} user_id={self.user_id} location_id={self.location_id}>"
