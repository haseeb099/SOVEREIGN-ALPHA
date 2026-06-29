"""
Massive.com flat files (S3-compatible) client.

REST market quotes use POLYGON_API_KEY via polygon_service.
Bulk historical CSV/GZIP datasets use MASSIVE_S3_* credentials here.
"""
from __future__ import annotations

import asyncio
import gzip
import io
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

MASSIVE_S3_ACCESS_KEY_ID = os.environ.get("MASSIVE_S3_ACCESS_KEY_ID", "")
MASSIVE_S3_SECRET_ACCESS_KEY = os.environ.get("MASSIVE_S3_SECRET_ACCESS_KEY", "")
MASSIVE_S3_ENDPOINT = os.environ.get("MASSIVE_S3_ENDPOINT", "https://files.massive.com").rstrip("/")
MASSIVE_S3_BUCKET = os.environ.get("MASSIVE_S3_BUCKET", "flatfiles")

# Common prefixes — availability depends on your Massive plan tier.
KNOWN_PREFIXES = {
    "stocks_minute_aggs": "us_stocks_sip/minute_aggs_v1",
    "stocks_day_aggs": "us_stocks_sip/day_aggs_v1",
    "stocks_trades": "us_stocks_sip/trades_v1",
}


class MassiveFlatfilesError(Exception):
    """Base Massive flat files client error."""


def flatfiles_configured() -> bool:
    return bool(MASSIVE_S3_ACCESS_KEY_ID and MASSIVE_S3_SECRET_ACCESS_KEY)


def _get_s3_client():
    if not flatfiles_configured():
        raise MassiveFlatfilesError("MASSIVE_S3_ACCESS_KEY_ID / MASSIVE_S3_SECRET_ACCESS_KEY not configured")
    try:
        import boto3
        from botocore.config import Config
    except ImportError as exc:
        raise MassiveFlatfilesError("boto3 not installed") from exc

    return boto3.client(
        "s3",
        endpoint_url=MASSIVE_S3_ENDPOINT,
        aws_access_key_id=MASSIVE_S3_ACCESS_KEY_ID,
        aws_secret_access_key=MASSIVE_S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
    )


def _list_objects_sync(prefix: str, max_keys: int) -> list[dict[str, Any]]:
    client = _get_s3_client()
    response = client.list_objects_v2(
        Bucket=MASSIVE_S3_BUCKET,
        Prefix=prefix,
        MaxKeys=max_keys,
    )
    return [
        {
            "key": obj["Key"],
            "size": obj["Size"],
            "last_modified": obj["LastModified"].isoformat(),
        }
        for obj in response.get("Contents") or []
    ]


def _head_bucket_sync() -> dict[str, Any]:
    client = _get_s3_client()
    client.head_bucket(Bucket=MASSIVE_S3_BUCKET)
    response = client.list_objects_v2(Bucket=MASSIVE_S3_BUCKET, MaxKeys=5)
    sample_keys = [obj["Key"] for obj in response.get("Contents") or []]
    return {"bucket": MASSIVE_S3_BUCKET, "endpoint": MASSIVE_S3_ENDPOINT, "sample_keys": sample_keys}


def _read_object_head_sync(key: str, max_bytes: int = 8192) -> dict[str, Any]:
    client = _get_s3_client()
    response = client.get_object(Bucket=MASSIVE_S3_BUCKET, Key=key)
    body = response["Body"].read(max_bytes)
    content_type = response.get("ContentType", "application/octet-stream")

    preview = ""
    if key.endswith(".gz"):
        try:
            with gzip.GzipFile(fileobj=io.BytesIO(body)) as gz:
                preview = gz.read(512).decode("utf-8", errors="replace")
        except Exception:
            preview = "(gzip preview unavailable)"
    else:
        preview = body[:512].decode("utf-8", errors="replace")

    return {
        "key": key,
        "content_type": content_type,
        "preview": preview,
        "truncated": True,
    }


async def list_objects(prefix: str = "", max_keys: int = 20) -> list[dict[str, Any]]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _list_objects_sync, prefix, max_keys)


async def check_connection() -> dict[str, Any]:
    if not flatfiles_configured():
        return {"status": "unconfigured", "detail": "MASSIVE_S3 credentials not set"}
    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, _head_bucket_sync)
        return {"status": "ok", **info}
    except Exception as exc:
        logger.warning("Massive flat files connection check failed: %s", exc)
        return {"status": "error", "detail": str(exc)}


async def peek_object(key: str, max_bytes: int = 8192) -> dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _read_object_head_sync, key, max_bytes)
