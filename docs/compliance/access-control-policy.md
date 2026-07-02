# Access Control Policy

## Roles
| Role | Capabilities |
|------|-------------|
| Admin | Org settings, members, API keys, audit export |
| Analyst | Analyze, ingest, workspaces, approvals |
| Viewer | Read-only memos, dossier, shared theses |

## Onboarding / offboarding
- Members invited via Clerk Organizations or `/api/org/members`
- Offboarding sets membership status to `inactive`; access revoked immediately
