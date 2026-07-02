# SOC 2 Control Matrix (TSC CC6 / CC7)

| Control | Implementation |
|---------|----------------|
| CC6.1 Logical access | Clerk auth + RBAC middleware |
| CC6.2 Provisioning | Org membership API, Clerk invites |
| CC6.3 Deprovisioning | Member status inactive + session expiry |
| CC7.1 Monitoring | Sentry, Prometheus `/metrics`, `/health` |
| CC7.2 Incident response | [incident-response.md](./incident-response.md) |
| CC7.3 Change management | [change-management.md](./change-management.md) |
