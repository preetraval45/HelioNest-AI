"""Integration tests for health and core API endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self):
        response = client.get("/api/v1/health")
        assert response.status_code == 200

    def test_health_returns_ok_status(self):
        response = client.get("/api/v1/health")
        data = response.json()
        assert data["status"] == "ok"

    def test_health_has_version(self):
        response = client.get("/api/v1/health")
        data = response.json()
        assert "version" in data
        assert isinstance(data["version"], str)

    def test_health_has_environment(self):
        response = client.get("/api/v1/health")
        data = response.json()
        assert "environment" in data

    def test_404_returns_json(self):
        response = client.get("/api/v1/nonexistent-route-xyz")
        assert response.status_code == 404
        data = response.json()
        assert "error" in data

    def test_validation_error_returns_422(self):
        # POST to geocode with missing required field
        response = client.post("/api/v1/address/geocode", json={})
        assert response.status_code == 422
