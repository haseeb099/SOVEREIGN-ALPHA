"""Shared pytest fixtures for Sovereign-Alpha backend tests."""
import json
import os
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

# Set test env before app imports
os.environ.setdefault("CEREBRAS_API_KEY", "mock_key_for_unit_tests")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("NEWS_API_KEY", "")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000")

from main import app  # noqa: E402


MARKET_SCHEMA_KEYS = {
    "asset_key",
    "full_name",
    "asset_class",
    "icon",
    "price",
    "change_pct",
    "is_positive",
    "volatility_30d",
    "source",
    "fetched_at",
}

ANALYZE_SCHEMA_KEYS = {
    "ticker",
    "timestamp",
    "asset_price",
    "asset_change_pct",
    "volatility_30d",
    "scenario",
    "pipeline_elapsed_seconds",
    "memo",
    "thesis_points",
    "agent_logs",
    "raw_agents",
}

MEMO_SCHEMA_KEYS = {
    "bull_verdict",
    "bear_verdict",
    "summary",
    "price_target",
    "confidence_band",
    "rating",
    "confidence_score",
    "audit_warnings",
}


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def sample_market_data():
    return {
        "asset_key": "TSLA",
        "full_name": "Tesla Motors Inc.",
        "asset_class": "Equity / Auto-Tech",
        "icon": "electric_car",
        "price": 185.20,
        "change_pct": 2.4,
        "is_positive": True,
        "volatility_30d": 38.4,
        "source": "yfinance",
        "fetched_at": 1710000000.0,
    }


@pytest.fixture
def sample_scenario():
    return {
        "margins": 18.5,
        "rates": 4.5,
        "regulatory": "Low",
        "sentiment": "Neutral",
    }


def _agent_json_for_prompt(system_prompt: str) -> dict:
    """Return deterministic mock JSON per agent system prompt."""
    if "Fundamental Analysis Agent" in system_prompt:
        return {
            "agent": "FUNDAMENTAL",
            "score": 7.2,
            "margin_assessment": "Margins stable",
            "log_message": "Fundamental analysis complete",
        }
    if "Macro Intelligence Agent" in system_prompt:
        return {
            "agent": "MACRO",
            "macro_score": 6.5,
            "geopolitical_risk": "Medium",
            "log_message": "Macro analysis complete",
        }
    if "Bull Case Agent" in system_prompt:
        return {
            "agent": "BULL",
            "verdict": "Strong growth catalysts support upside.",
            "price_target": 240.0,
            "confidence_band": [210, 270],
            "log_message": "Bull case built",
        }
    if "Red Team Adversarial Agent" in system_prompt:
        return {
            "agent": "RED_TEAM",
            "verdict": "Margin compression and competition remain risks.",
            "bear_price_target": 140.0,
            "log_message": "Red team complete",
        }
    if "Synthesis Agent" in system_prompt:
        return {
            "agent": "SYNTHESIS",
            "rating": "BULLISH",
            "confidence_score": 7.5,
            "summary": "Balanced upside with manageable risks.",
            "bull_verdict": "Production scale drives unit-cost advantage.",
            "bear_verdict": "Competitive pressure may squeeze margins.",
            "price_target": 220.0,
            "thesis_points": [
                {
                    "id": 1,
                    "text": "Margins above 18%",
                    "metric": "Margins",
                    "status": "PASS",
                    "current_value": "19.2%",
                    "threshold": "18%",
                }
            ],
            "audit_warnings": [],
            "log_message": "Final synthesis complete — rating: BULLISH",
        }
    return {"agent": "TEST", "log_message": "mock"}


@pytest.fixture
def mock_cerebras_agent(monkeypatch):
    """Patch pipeline _call_agent with deterministic JSON responses."""

    def fake_call(_client, system_prompt: str, _user_message: str) -> dict:
        return _agent_json_for_prompt(system_prompt)

    monkeypatch.setattr("agents.pipeline._call_agent", fake_call)
    return fake_call


@pytest.fixture
def mock_cerebras_client(monkeypatch):
    """Patch Cerebras SDK client used by ingest_service."""

    class FakeMessage:
        def __init__(self, content: str):
            self.content = content

    class FakeChoice:
        def __init__(self, content: str):
            self.message = FakeMessage(content)

    class FakeCompletion:
        def __init__(self, payload: dict):
            self.choices = [FakeChoice(json.dumps(payload))]

    class FakeCerebras:
        def __init__(self, api_key=None):
            self.chat = MagicMock()
            self.chat.completions.create = MagicMock(
                return_value=FakeCompletion(
                    {
                        "ticker_guess": "TSLA",
                        "document_type": "Analyst Memo",
                        "thesis_points": [
                            {
                                "id": 1,
                                "text": "Operating margins remain above 18% through FY2025",
                                "metric": "Margins",
                                "threshold": "18%",
                                "timeframe": "FY2025",
                                "confidence": "HIGH",
                            }
                        ],
                        "key_risks": ["Competition"],
                        "target_price": 220.0,
                        "rating": "BUY",
                    }
                )
            )

    monkeypatch.setattr("services.ingest_service.Cerebras", FakeCerebras)
    return FakeCerebras


@pytest.fixture
def mock_persistence(monkeypatch):
    """Avoid requiring PostgreSQL during API integration tests."""
    monkeypatch.setattr(
        "routers.analyze.save_analysis",
        AsyncMock(return_value="test-analysis-id"),
    )
    monkeypatch.setattr(
        "routers.ingest.save_ingestion",
        AsyncMock(return_value="test-ingest-id"),
    )


@pytest.fixture
def sample_pipeline_result(sample_market_data, sample_scenario):
    return {
        "ticker": "TSLA",
        "timestamp": "2026-06-29T12:00:00Z",
        "asset_price": sample_market_data["price"],
        "asset_change_pct": sample_market_data["change_pct"],
        "volatility_30d": sample_market_data["volatility_30d"],
        "scenario": sample_scenario,
        "pipeline_elapsed_seconds": 1.23,
        "memo": {
            "bull_verdict": "Production scale drives unit-cost advantage.",
            "bear_verdict": "Competitive pressure may squeeze margins.",
            "summary": "Balanced upside with manageable risks.",
            "price_target": 220.0,
            "confidence_band": [210, 270],
            "rating": "BULLISH",
            "confidence_score": 7.5,
            "audit_warnings": [],
        },
        "thesis_points": [
            {
                "id": 1,
                "text": "Margins above 18%",
                "metric": "Margins",
                "status": "PASS",
                "current_value": "19.2%",
                "threshold": "18%",
            }
        ],
        "agent_logs": [],
        "raw_agents": {},
    }
