"""CORS origin configuration — never use wildcard in production."""
import os

DEFAULT_DEV_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
    "http://localhost:5173",
]


def get_allowed_origins() -> list[str]:
    """
    Resolve allowed CORS origins from environment.

    - ALLOWED_ORIGINS: comma-separated list of full origins (scheme + host + port)
    - ENVIRONMENT: development uses local defaults when ALLOWED_ORIGINS is unset
    - Production never allows \"*\" and requires explicit ALLOWED_ORIGINS
    """
    environment = os.environ.get("ENVIRONMENT", "development").strip().lower()
    raw = os.environ.get("ALLOWED_ORIGINS", "").strip()

    if raw:
        origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    elif environment in {"development", "dev", "local", "test"}:
        origins = DEFAULT_DEV_ORIGINS.copy()
    else:
        raise ValueError(
            "ALLOWED_ORIGINS must be set in production "
            "(comma-separated frontend URLs, no wildcard)"
        )

    if "*" in origins:
        raise ValueError("ALLOWED_ORIGINS cannot contain '*'")

    if environment in {"production", "prod"} and not origins:
        raise ValueError("ALLOWED_ORIGINS must list at least one origin in production")

    return origins
