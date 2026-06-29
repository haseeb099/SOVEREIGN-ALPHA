"""Portfolio analytics service."""
from typing import Any

from services.market_service import get_market_data
from services.polygon_service import get_ticker_sector


async def compute_portfolio_summary(holdings: list[dict]) -> dict[str, Any]:
    """Compute portfolio weights, real sector breakdown, and concentration flags."""
    if not holdings:
        return {
            "total_value": 0,
            "holdings": [],
            "sector_weights": {},
            "concentration_flags": [],
            "hedge_quality_score": None,
        }

    enriched = []
    total_value = 0.0

    for h in holdings:
        ticker = h["ticker"].upper()
        shares = float(h.get("shares", 0))
        cost_basis = float(h.get("cost_basis", 0))
        md: dict = {}
        try:
            md = await get_market_data(ticker)
            price = md.get("price", 0)
        except Exception:
            price = cost_basis / shares if shares else 0

        sector = await get_ticker_sector(ticker) or md.get("asset_class") or "Unknown"

        market_value = shares * price
        total_value += market_value
        enriched.append({
            **h,
            "ticker": ticker,
            "current_price": price,
            "market_value": round(market_value, 2),
            "unrealized_pnl": round(market_value - shares * cost_basis, 2) if cost_basis else None,
            "sector": sector,
            "weight_pct": 0,
        })

    for item in enriched:
        item["weight_pct"] = round(item["market_value"] / total_value * 100, 2) if total_value else 0

    sector_weights: dict[str, float] = {}
    for item in enriched:
        sector = item.get("sector") or "Unknown"
        sector_weights[sector] = sector_weights.get(sector, 0) + item["weight_pct"]

    concentration_flags = []
    for sector, weight in sector_weights.items():
        if weight > 40:
            concentration_flags.append(f">{weight:.0f}% in {sector}")

    for item in enriched:
        if item["weight_pct"] > 40:
            concentration_flags.append(f">{item['weight_pct']:.0f}% in {item['ticker']}")

    return {
        "total_value": round(total_value, 2),
        "holdings": enriched,
        "sector_weights": {k: round(v, 2) for k, v in sector_weights.items()},
        "concentration_flags": concentration_flags,
        "hedge_quality_score": _hedge_quality_score(enriched),
    }


def _hedge_quality_score(holdings: list[dict]) -> float | None:
    """Simple diversification proxy — higher is better."""
    if len(holdings) < 2:
        return 50.0
    weights = [h["weight_pct"] for h in holdings]
    max_weight = max(weights)
    return round(max(0, 100 - max_weight), 1)
