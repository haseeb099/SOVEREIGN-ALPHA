"""Complete schema — all ORM tables matching models.py."""

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    op.create_table(
        "watchlists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=False),
        sa.Column("name", sa.String(128), server_default="Default"),
        sa.Column("tickers", postgresql.JSONB(), server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_watchlists_user_id", "watchlists", ["user_id"])

    op.create_table(
        "holdings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=False),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("shares", sa.Float(), nullable=False),
        sa.Column("cost_basis", sa.Float(), nullable=True),
        sa.Column("account_label", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_holdings_user_id", "holdings", ["user_id"])
    op.create_index("ix_holdings_ticker", "holdings", ["ticker"])

    op.create_table(
        "thesis_health_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=True),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("target", sa.Float(), nullable=False),
        sa.Column("distribution", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_thesis_health_snapshots_ticker", "thesis_health_snapshots", ["ticker"])
    op.create_index("ix_thesis_health_snapshots_user_id", "thesis_health_snapshots", ["user_id"])
    op.create_index("ix_thesis_health_snapshots_created_at", "thesis_health_snapshots", ["created_at"])

    op.create_table(
        "ingested_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=True),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("file_size_kb", sa.Float(), nullable=True),
        sa.Column("extraction", postgresql.JSONB(), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("ticker_guess", sa.String(16), nullable=True),
        sa.Column("tags", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_ingested_documents_user_id", "ingested_documents", ["user_id"])
    op.create_index("ix_ingested_documents_created_at", "ingested_documents", ["created_at"])

    op.create_table(
        "document_library",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("extraction", postgresql.JSONB(), nullable=False),
        sa.Column("ticker_guess", sa.String(16), nullable=True),
        sa.Column("tags", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_document_library_user_id", "document_library", ["user_id"])

    op.create_table(
        "portfolio_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=True),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("scenario", postgresql.JSONB(), nullable=False),
        sa.Column("thesis_points", postgresql.JSONB(), server_default="[]"),
        sa.Column("memo_rating", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_portfolio_snapshots_user_id", "portfolio_snapshots", ["user_id"])
    op.create_index("ix_portfolio_snapshots_ticker", "portfolio_snapshots", ["ticker"])
    op.create_index("ix_portfolio_snapshots_created_at", "portfolio_snapshots", ["created_at"])

    op.create_table(
        "alert_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=False),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("condition", sa.String(64), nullable=False),
        sa.Column("channel", sa.String(32), server_default="in_app"),
        sa.Column("threshold", sa.Float(), nullable=True),
        sa.Column("config", postgresql.JSONB(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_alert_rules_user_id", "alert_rules", ["user_id"])

    op.create_table(
        "reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=True),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("analysis_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("share_token", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_reports_share_token", "reports", ["share_token"])
    op.create_index("ix_reports_user_id", "reports", ["user_id"])

    op.create_table(
        "api_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("api_key_hash", sa.String(128), nullable=False),
        sa.Column("endpoint", sa.String(128), nullable=False),
        sa.Column("ticker", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_api_usage_api_key_hash", "api_usage", ["api_key_hash"])
    op.create_index("ix_api_usage_created_at", "api_usage", ["created_at"])

    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=False),
        sa.Column("key_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("plan_tier", sa.String(32), server_default="free"),
        sa.Column("rate_limit", sa.Integer(), server_default="100"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])

    op.create_index("ix_thesis_analyses_created_at", "thesis_analyses", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_thesis_analyses_created_at", table_name="thesis_analyses")
    op.drop_table("api_keys")
    op.drop_table("api_usage")
    op.drop_table("reports")
    op.drop_table("alert_rules")
    op.drop_table("portfolio_snapshots")
    op.drop_table("document_library")
    op.drop_table("ingested_documents")
    op.drop_table("thesis_health_snapshots")
    op.drop_table("holdings")
    op.drop_table("watchlists")
