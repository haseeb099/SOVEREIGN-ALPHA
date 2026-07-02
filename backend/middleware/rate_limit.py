"""Rate limiting via slowapi."""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address


def _storage_uri() -> str:
    explicit = os.environ.get("RATE_LIMIT_STORAGE")
    if explicit:
        return explicit
    if os.environ.get("SKIP_DB_INIT", "").lower() in ("1", "true", "yes"):
        return "memory://"
    return os.environ.get("REDIS_URL", "memory://")


limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[os.environ.get("RATE_LIMIT_DEFAULT", "120/minute")],
    storage_uri=_storage_uri(),
)
