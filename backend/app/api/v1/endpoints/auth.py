"""Authentication endpoints: register, login, me, saved properties."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.models.saved_property import SavedProperty
from app.models.user import User
from app.schemas.user import (
    SavedPropertyOut,
    SavedPropertyRequest,
    TokenOut,
    UserLoginRequest,
    UserOut,
    UserRegisterRequest,
)

router = APIRouter()
bearer = HTTPBearer()


# ── Dependency: current user ─────────────────────────────────────────────────

async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    subject = decode_access_token(creds.credentials)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == int(subject)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


# ── Register ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenOut(access_token=create_access_token(user.id))


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenOut)
async def login(body: UserLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    return TokenOut(access_token=create_access_token(user.id))


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── Saved properties ──────────────────────────────────────────────────────────

@router.get("/me/saved-properties", response_model=list[SavedPropertyOut])
async def list_saved(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SavedProperty)
        .where(SavedProperty.user_id == current_user.id)
        .order_by(SavedProperty.saved_at.desc())
    )
    return result.scalars().all()


@router.post("/me/saved-properties", response_model=SavedPropertyOut, status_code=status.HTTP_201_CREATED)
async def save_property(
    body: SavedPropertyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sp = SavedProperty(
        user_id=current_user.id,
        location_id=body.location_id,
        nickname=body.nickname,
    )
    db.add(sp)
    await db.commit()
    await db.refresh(sp)
    return sp


@router.delete("/me/saved-properties/{saved_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved(
    saved_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SavedProperty).where(
            SavedProperty.id == saved_id, SavedProperty.user_id == current_user.id
        )
    )
    sp = result.scalar_one_or_none()
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved property not found")
    await db.delete(sp)
    await db.commit()
