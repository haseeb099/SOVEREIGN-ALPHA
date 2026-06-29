"""Rate limiting via slowapi."""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[os.environ.get("RATE_LIMIT_DEFAULT", "120/minute")],
    storage_uri=os.environ.get("REDIS_URL", "memory://"),
)
