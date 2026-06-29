"""Massive flat files service tests with mocked S3."""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from services.massive_flatfiles_service import (
    MassiveFlatfilesError,
    check_connection,
    flatfiles_configured,
    list_objects,
)


@pytest.mark.asyncio
async def test_flatfiles_unconfigured(monkeypatch):
    monkeypatch.delenv("MASSIVE_S3_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("MASSIVE_S3_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.setattr("services.massive_flatfiles_service.MASSIVE_S3_ACCESS_KEY_ID", "")
    monkeypatch.setattr("services.massive_flatfiles_service.MASSIVE_S3_SECRET_ACCESS_KEY", "")
    assert flatfiles_configured() is False
    status = await check_connection()
    assert status["status"] == "unconfigured"


@pytest.mark.asyncio
async def test_list_objects_returns_keys(monkeypatch):
    monkeypatch.setenv("MASSIVE_S3_ACCESS_KEY_ID", "test-key")
    monkeypatch.setenv("MASSIVE_S3_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setattr("services.massive_flatfiles_service.MASSIVE_S3_ACCESS_KEY_ID", "test-key")
    monkeypatch.setattr("services.massive_flatfiles_service.MASSIVE_S3_SECRET_ACCESS_KEY", "test-secret")

    mock_client = MagicMock()
    mock_client.list_objects_v2.return_value = {
        "Contents": [
            {
                "Key": "us_stocks_sip/day_aggs_v1/2024/01/2024-01-02.csv.gz",
                "Size": 12345,
                "LastModified": datetime(2024, 1, 3, tzinfo=timezone.utc),
            }
        ]
    }

    with patch("services.massive_flatfiles_service._get_s3_client", return_value=mock_client):
        objects = await list_objects(prefix="us_stocks_sip/day_aggs_v1", max_keys=5)

    assert len(objects) == 1
    assert objects[0]["key"].endswith(".csv.gz")
    mock_client.list_objects_v2.assert_called_once()


@pytest.mark.asyncio
async def test_list_objects_raises_when_unconfigured(monkeypatch):
    monkeypatch.setattr("services.massive_flatfiles_service.MASSIVE_S3_ACCESS_KEY_ID", "")
    monkeypatch.setattr("services.massive_flatfiles_service.MASSIVE_S3_SECRET_ACCESS_KEY", "")
    with pytest.raises(MassiveFlatfilesError):
        await list_objects()
