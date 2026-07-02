"""Phase 20 — filing_events and filing_watch_subscriptions tables."""

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "filing_events" not in tables:
        op.create_table(
            "filing_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("ticker", sa.String(16), nullable=False),
            sa.Column("form", sa.String(16), nullable=False),
            sa.Column("accession", sa.String(32), nullable=False),
            sa.Column("filed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "ingested_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
            sa.Column("analysis_triggered", sa.Boolean(), server_default=sa.text("false")),
            sa.Column("user_id", sa.String(128), nullable=True),
        )
        op.create_index("ix_filing_events_ticker", "filing_events", ["ticker"])
        op.create_index("ix_filing_events_accession", "filing_events", ["accession"])
        op.create_index("ix_filing_events_user_id", "filing_events", ["user_id"])

    if "filing_watch_subscriptions" not in tables:
        op.create_table(
            "filing_watch_subscriptions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.String(128), nullable=False),
            sa.Column("ticker", sa.String(16), nullable=False),
            sa.Column("forms", postgresql.JSONB(), nullable=True),
            sa.Column("enabled", sa.Boolean(), server_default=sa.text("true")),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index(
            "ix_filing_watch_subscriptions_user_id",
            "filing_watch_subscriptions",
            ["user_id"],
        )
        op.create_index(
            "ix_filing_watch_subscriptions_ticker",
            "filing_watch_subscriptions",
            ["ticker"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    if "filing_watch_subscriptions" in tables:
        op.drop_table("filing_watch_subscriptions")
    if "filing_events" in tables:
        op.drop_table("filing_events")
