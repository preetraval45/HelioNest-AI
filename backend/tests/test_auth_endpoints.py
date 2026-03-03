"""Integration tests for auth endpoints (Task 2.7)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

_MOCK_USER = MagicMock()
_MOCK_USER.id = 1
_MOCK_USER.email = "test@example.com"
_MOCK_USER.is_active = True
_MOCK_USER.hashed_password = "$2b$12$fakehash"
_MOCK_USER.created_at.isoformat.return_value = "2025-01-01T00:00:00"


class TestAuthRegister:
    def test_register_missing_fields_422(self):
        res = client.post("/api/v1/auth/register", json={})
        assert res.status_code == 422

    def test_register_short_password_422(self):
        res = client.post(
            "/api/v1/auth/register",
            json={"email": "a@b.com", "password": "short"},
        )
        assert res.status_code == 422

    def test_register_invalid_email_422(self):
        res = client.post(
            "/api/v1/auth/register",
            json={"email": "not-an-email", "password": "validpassword"},
        )
        assert res.status_code == 422


class TestAuthLogin:
    def test_login_missing_fields_422(self):
        res = client.post("/api/v1/auth/login", json={})
        assert res.status_code == 422

    def test_login_invalid_email_422(self):
        res = client.post(
            "/api/v1/auth/login",
            json={"email": "bad", "password": "anything"},
        )
        assert res.status_code == 422


class TestAuthMe:
    def test_me_no_token_403(self):
        res = client.get("/api/v1/auth/me")
        assert res.status_code == 403

    def test_me_invalid_token_401(self):
        res = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert res.status_code == 401
