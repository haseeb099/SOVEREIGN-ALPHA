# Security Policy

## Access control
- Clerk JWT authentication for all user-facing routes
- Organization-scoped RBAC: Admin, Analyst, Viewer
- API keys hashed with SHA-256; never stored in plaintext

## Encryption
- TLS in transit for all API and web traffic
- PostgreSQL and Redis encrypted at rest (provider-managed)

## Vendors
See [subprocessors.md](./subprocessors.md).
