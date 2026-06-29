"""Tests for CORS origin configuration."""
import importlib

import pytest

import cors_config


def test_development_defaults_without_allowed_origins(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "development")

    origins = cors_config.get_allowed_origins()

    assert "*" not in origins
    assert "http://localhost:8000" in origins
    assert "http://127.0.0.1:8000" in origins


def test_explicit_allowed_origins_merge_dev_defaults_in_development(monkeypatch):
    monkeypatch.setenv(
        "ALLOWED_ORIGINS",
        "https://sovereign-alpha.vercel.app,https://app.example.com",
    )
    monkeypatch.setenv("ENVIRONMENT", "development")

    origins = cors_config.get_allowed_origins()

    assert "https://sovereign-alpha.vercel.app" in origins
    assert "https://app.example.com" in origins
    assert "http://localhost:3000" in origins


def test_wildcard_origin_is_rejected(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    monkeypatch.setenv("ENVIRONMENT", "development")

    with pytest.raises(ValueError, match="cannot contain"):
        cors_config.get_allowed_origins()


def test_production_requires_explicit_origins(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")

    with pytest.raises(ValueError, match="ALLOWED_ORIGINS must be set"):
        cors_config.get_allowed_origins()


def test_production_accepts_explicit_origins(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://sovereign-alpha.vercel.app")
    monkeypatch.setenv("ENVIRONMENT", "production")

    origins = cors_config.get_allowed_origins()

    assert origins == ["https://sovereign-alpha.vercel.app"]
    assert "*" not in origins


def test_main_module_never_registers_wildcard_cors(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:8000")
    monkeypatch.setenv("ENVIRONMENT", "development")

    import main

    importlib.reload(main)

    cors_middleware = next(
        m for m in main.app.user_middleware if m.cls.__name__ == "CORSMiddleware"
    )
    allowed = cors_middleware.kwargs["allow_origins"]
    assert "http://localhost:8000" in allowed
    assert "http://localhost:3000" in allowed
    assert "*" not in allowed
