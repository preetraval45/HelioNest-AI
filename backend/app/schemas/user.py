from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SavedPropertyRequest(BaseModel):
    location_id: int
    nickname: str | None = None


class SavedPropertyOut(BaseModel):
    id: int
    location_id: int
    nickname: str | None
    saved_at: datetime

    model_config = {"from_attributes": True}
