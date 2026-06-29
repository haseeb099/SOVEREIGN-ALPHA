"""Deterministic valuation consistency engine for bear/base/bull distribution."""
from __future__ import annotations

from typing import Any


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


DEFAULT_PROBABILITIES = {"bear": 0.20, "base": 0.55, "bull": 0.25}


def build_distribution(
    current_price: float,
    price_target: float,
    bull_target: float | None = None,
    bear_target: float | None = None,
) -> dict[str, Any]:
    bull = bull_target if bull_target is not None else price_target * 1.25
    bear = bear_target if bear_target is not None else price_target * 0.75
    if bear > price_target:
        bear = price_target * 0.85
    if bull < price_target:
        bull = price_target * 1.15
    bear = _clamp(bear, current_price * 0.5, price_target)
    bull = _clamp(bull, price_target, current_price * 3)
    return {
        "bear": {"price": round(bear, 2), "probability": DEFAULT_PROBABILITIES["bear"]},
        "base": {"price": round(price_target, 2), "probability": DEFAULT_PROBABILITIES["base"]},
        "bull": {"price": round(bull, 2), "probability": DEFAULT_PROBABILITIES["bull"]},
    }


def weighted_target(distribution: dict[str, Any]) -> float:
    total = 0.0
    for case in ("bear", "base", "bull"):
        node = distribution[case]
        total += node["price"] * node["probability"]
    return round(total, 2)


def _normalize_probabilities(distribution: dict[str, Any]) -> dict[str, Any]:
    """Renormalize bear/base/bull probabilities to sum to 1.0."""
    dist = {k: dict(distribution[k]) for k in ("bear", "base", "bull")}
    total = sum(dist[k]["probability"] for k in dist)
    if total <= 0:
        for k, prob in DEFAULT_PROBABILITIES.items():
            dist[k]["probability"] = prob
        return dist
    if abs(total - 1.0) > 0.01:
        for k in dist:
            dist[k]["probability"] = round(dist[k]["probability"] / total, 4)
    return dist


def enforce_valuation_consistency(
    price_target: float,
    distribution: dict[str, Any],
    current_price: float,
) -> tuple[float, dict[str, Any], list[str]]:
    """
    Hard-enforce bear <= price_target <= bull in API responses.
    Returns (adjusted_target, distribution, repair_warnings).
    """
    repairs: list[str] = []
    dist = _normalize_probabilities(distribution)

    bear_p = float(dist["bear"]["price"])
    bull_p = float(dist["bull"]["price"])
    target = float(price_target)

    if bear_p > bull_p:
        bear_p, bull_p = bull_p, bear_p
        repairs.append("Inverted bear/bull endpoints corrected")

    floor = max(0.01, current_price * 0.5)
    ceiling = max(bull_p, current_price * 3, target)
    bear_p = _clamp(bear_p, floor, bull_p)
    bull_p = _clamp(bull_p, bear_p, ceiling)

    if target < bear_p:
        repairs.append(f"Price target ${target:.2f} below bear — adjusted to ${bear_p:.2f}")
        target = bear_p
    elif target > bull_p:
        repairs.append(f"Price target ${target:.2f} above bull — adjusted to ${bull_p:.2f}")
        target = bull_p

    dist["bear"]["price"] = round(bear_p, 2)
    dist["bull"]["price"] = round(bull_p, 2)
    dist["base"]["price"] = round(target, 2)

    if not (dist["bear"]["price"] <= target <= dist["bull"]["price"]):
        target = _clamp(target, dist["bear"]["price"], dist["bull"]["price"])
        dist["base"]["price"] = round(target, 2)
        repairs.append("Price target clamped into bear/bull envelope")

    return round(target, 2), dist, repairs


def consistency_checks(
    price_target: float,
    distribution: dict[str, Any],
    tolerance: float = 0.01,
) -> list[str]:
    """Advisory checks — enforcement happens in enforce_valuation_consistency."""
    warnings: list[str] = []
    bear_p = distribution["bear"]["price"]
    bull_p = distribution["bull"]["price"]
    if not (bear_p <= price_target <= bull_p):
        warnings.append(
            f"Price target ${price_target:.2f} outside bear/bull range "
            f"[${bear_p:.2f}, ${bull_p:.2f}]"
        )
    prob_sum = sum(distribution[k]["probability"] for k in ("bear", "base", "bull"))
    if abs(prob_sum - 1.0) > tolerance:
        warnings.append(f"Distribution probabilities sum to {prob_sum:.2f}, expected 1.0")
    weighted = weighted_target(distribution)
    if abs(weighted - price_target) > price_target * 0.15 and price_target > 0:
        warnings.append(
            f"Weighted mean ${weighted:.2f} diverges from stated target ${price_target:.2f}"
        )
    return warnings


def apply_to_memo(
    memo: dict[str, Any],
    current_price: float,
    bull_agent: dict[str, Any] | None = None,
    red_team_agent: dict[str, Any] | None = None,
) -> dict[str, Any]:
    price_target = float(memo.get("price_target") or current_price)
    bull_target = bull_agent.get("price_target") if bull_agent else None
    bear_target = red_team_agent.get("bear_price_target") if red_team_agent else None

    existing = memo.get("distribution")
    if existing and all(k in existing for k in ("bear", "base", "bull")):
        distribution = {
            "bear": dict(existing["bear"]),
            "base": dict(existing["base"]),
            "bull": dict(existing["bull"]),
        }
        if bull_target is not None:
            distribution["bull"]["price"] = float(bull_target)
        if bear_target is not None:
            distribution["bear"]["price"] = float(bear_target)
    else:
        distribution = build_distribution(current_price, price_target, bull_target, bear_target)

    price_target, distribution, repairs = enforce_valuation_consistency(
        price_target, distribution, current_price
    )

    warnings = [
        w
        for w in (memo.get("audit_warnings") or [])
        if "Confidence band does not bracket" not in w
    ]
    warnings.extend(repairs)
    warnings.extend(consistency_checks(price_target, distribution))

    confidence_band = memo.get("confidence_band")
    if isinstance(confidence_band, list) and len(confidence_band) == 2:
        low, high = float(confidence_band[0]), float(confidence_band[1])
        if low > price_target or high < price_target:
            warnings.append("Confidence band does not bracket price target — band widened")
            confidence_band = [
                round(min(low, distribution["bear"]["price"]), 2),
                round(max(high, distribution["bull"]["price"]), 2),
            ]
    else:
        confidence_band = [
            round(distribution["bear"]["price"] * 0.95, 2),
            round(distribution["bull"]["price"] * 1.05, 2),
        ]

    return {
        **memo,
        "price_target": price_target,
        "distribution": distribution,
        "confidence_band": confidence_band,
        "audit_warnings": warnings,
    }


def scenario_preview(
    ticker: str,
    current_price: float,
    scenario: dict[str, Any],
    base: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Fast deterministic preview without LLM — <100ms."""
    base = base or {}
    base_margins = float(scenario.get("margins", 18.5))
    base_rates = float(scenario.get("rates", 4.5))
    margins = float(scenario.get("margins", base_margins))
    rates = float(scenario.get("rates", base_rates))
    regulatory = scenario.get("regulatory", "Low")
    sentiment = scenario.get("sentiment", "Neutral")

    margin_delta = (margins - base_margins) / 100
    rate_delta = (rates - base_rates) / 100
    reg_mult = {"Low": 0, "Medium": -0.03, "High": -0.08}.get(regulatory, 0)
    sent_mult = {"Bullish": 0.05, "Neutral": 0, "Bearish": -0.06}.get(sentiment, 0)

    base_target = float((base.get("memo") or {}).get("price_target") or current_price * 1.12)
    base_health = float((base.get("memo") or {}).get("confidence_score") or 7.0) * 10

    target_mult = 1 + margin_delta * 2.5 - rate_delta * 1.8 + reg_mult + sent_mult
    new_target = round(base_target * target_mult, 2)
    health_delta = round((margin_delta * 30 - rate_delta * 20 + sent_mult * 100 + reg_mult * 100), 1)
    new_health = _clamp(base_health + health_delta, 0, 100)

    distribution = build_distribution(current_price, new_target)
    new_target, distribution, _ = enforce_valuation_consistency(new_target, distribution, current_price)

    return {
        "ticker": ticker.upper(),
        "price_target": new_target,
        "thesis_health_pct": round(new_health, 1),
        "distribution": distribution,
        "deltas": {
            "price_target": round(new_target - base_target, 2),
            "thesis_health_pct": round(new_health - base_health, 1),
        },
        "scenario": scenario,
    }


def parse_nl_scenario(text: str) -> dict[str, Any]:
    """Rule-based NL scenario parser (no LLM required for preview)."""
    lower = text.lower()
    scenario: dict[str, Any] = {}
    explanation = []
    if "miss" in lower and "deliver" in lower:
        scenario["sentiment"] = "Bearish"
        scenario["margins"] = 14.0
        explanation.append("Delivery miss → bearish sentiment, margin compression")
    if "china" in lower or "subsidy" in lower:
        scenario["regulatory"] = "High"
        explanation.append("China/regulatory pressure elevated")
    if "rate cut" in lower or "fed cut" in lower:
        scenario["rates"] = 3.5
        explanation.append("Fed rate cut scenario")
    if "rate hike" in lower:
        scenario["rates"] = 5.5
        explanation.append("Rate hike scenario")
    if not scenario:
        scenario["sentiment"] = "Neutral"
        explanation.append("No strong signals — neutral baseline applied")
    return {"parsed_scenario": scenario, "explanation": "; ".join(explanation), "raw": text}
