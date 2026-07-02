# Enterprise SLA

## Uptime
- **Target:** 99.9% monthly API availability (`GET /health` + `/api/v1/public/*`)
- **Measurement:** Excludes scheduled maintenance with 72h notice

## Support
| Severity | Enterprise response |
|----------|---------------------|
| P1 — API down | 4 hours |
| P2 — Degraded | 1 business day |
| P3 — General | 3 business days |

## API tier
- Unlimited analyze calls via enterprise API keys
- Priority queue flag on responses
- Dedicated rate limit: `ENTERPRISE_API_RATE_LIMIT` (default 100k/month soft cap for abuse prevention)
