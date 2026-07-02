"""Phase 22 — enterprise hardening: orgs, workspaces, audit, org_id on tenant tables."""

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

TENANT_TABLES = (
    "watchlists",
    "holdings",
    "thesis_analyses",
    "ingested_documents",
    "document_corpora",
    "reports",
    "alert_rules",
    "workflow_runs",
    "filing_watch_subscriptions",
    "api_keys",
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "organisations" not in tables:
        op.create_table(
            "organisations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column("slug", sa.String(128), nullable=False),
            sa.Column("clerk_org_id", sa.String(128), nullable=True),
            sa.Column("branding", postgresql.JSONB(), nullable=True),
            sa.Column("settings", postgresql.JSONB(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_organisations_slug", "organisations", ["slug"], unique=True)
        op.create_index("ix_organisations_clerk_org_id", "organisations", ["clerk_org_id"], unique=True)

    if "org_memberships" not in tables:
        op.create_table(
            "org_memberships",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", sa.String(128), nullable=False),
            sa.Column("role", sa.String(32), server_default="viewer"),
            sa.Column("status", sa.String(32), server_default="active"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_org_memberships_org_id", "org_memberships", ["org_id"])
        op.create_index("ix_org_memberships_user_id", "org_memberships", ["user_id"])

    if "workspaces" not in tables:
        op.create_table(
            "workspaces",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column("created_by", sa.String(128), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_workspaces_org_id", "workspaces", ["org_id"])

    if "workspace_members" not in tables:
        op.create_table(
            "workspace_members",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", sa.String(128), nullable=False),
            sa.Column("role", sa.String(32), server_default="analyst"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_workspace_members_workspace_id", "workspace_members", ["workspace_id"])
        op.create_index("ix_workspace_members_user_id", "workspace_members", ["user_id"])

    if "shared_theses" not in tables:
        op.create_table(
            "shared_theses",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("ticker", sa.String(16), nullable=False),
            sa.Column("analysis_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("status", sa.String(32), server_default="draft"),
            sa.Column("shared_by", sa.String(128), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_shared_theses_workspace_id", "shared_theses", ["workspace_id"])
        op.create_index("ix_shared_theses_ticker", "shared_theses", ["ticker"])

    if "thesis_annotations" not in tables:
        op.create_table(
            "thesis_annotations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("thesis_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", sa.String(128), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("section_ref", sa.String(64), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_thesis_annotations_workspace_id", "thesis_annotations", ["workspace_id"])
        op.create_index("ix_thesis_annotations_thesis_id", "thesis_annotations", ["thesis_id"])

    if "approval_requests" not in tables:
        op.create_table(
            "approval_requests",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("resource_type", sa.String(64), nullable=False),
            sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("requested_by", sa.String(128), nullable=False),
            sa.Column("approved_by", sa.String(128), nullable=True),
            sa.Column("status", sa.String(32), server_default="pending"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_approval_requests_workspace_id", "approval_requests", ["workspace_id"])

    if "audit_events" not in tables:
        op.create_table(
            "audit_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("actor_id", sa.String(128), nullable=True),
            sa.Column("action", sa.String(128), nullable=False),
            sa.Column("resource_type", sa.String(64), nullable=True),
            sa.Column("resource_id", sa.String(128), nullable=True),
            sa.Column("payload", postgresql.JSONB(), nullable=True),
            sa.Column("checksum", sa.String(64), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_audit_events_org_id", "audit_events", ["org_id"])
        op.create_index("ix_audit_events_action", "audit_events", ["action"])
        op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])

    for table in TENANT_TABLES:
        if table in tables:
            cols = {c["name"] for c in inspector.get_columns(table)}
            if "org_id" not in cols:
                op.add_column(
                    table,
                    sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
                )
                op.create_index(f"ix_{table}_org_id", table, ["org_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    for table in TENANT_TABLES:
        if table in tables:
            cols = {c["name"] for c in inspector.get_columns(table)}
            if "org_id" in cols:
                op.drop_index(f"ix_{table}_org_id", table_name=table)
                op.drop_column(table, "org_id")

    for name in (
        "audit_events",
        "approval_requests",
        "thesis_annotations",
        "shared_theses",
        "workspace_members",
        "workspaces",
        "org_memberships",
        "organisations",
    ):
        if name in tables:
            op.drop_table(name)
