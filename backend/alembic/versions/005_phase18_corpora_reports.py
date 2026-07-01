"""Phase 18 — document corpora and extended report columns."""

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "document_corpora" not in inspector.get_table_names():
        op.create_table(
            "document_corpora",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.String(128), nullable=False),
            sa.Column("ticker", sa.String(16), nullable=True),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column("document_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
            sa.Column("merged_extraction", postgresql.JSONB(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_document_corpora_user_id", "document_corpora", ["user_id"])
        op.create_index("ix_document_corpora_ticker", "document_corpora", ["ticker"])

    report_cols = {c["name"] for c in inspector.get_columns("reports")}
    if "template" not in report_cols:
        op.add_column(
            "reports",
            sa.Column("template", sa.String(64), nullable=False, server_default="equity_research"),
        )
    if "password_hash" not in report_cols:
        op.add_column("reports", sa.Column("password_hash", sa.String(256), nullable=True))
    if "expires_in_days" not in report_cols:
        op.add_column("reports", sa.Column("expires_in_days", sa.Integer(), nullable=True))
    if "version" not in report_cols:
        op.add_column("reports", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    if "parent_report_id" not in report_cols:
        op.add_column(
            "reports",
            sa.Column("parent_report_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
    if "corpus_id" not in report_cols:
        op.add_column(
            "reports",
            sa.Column("corpus_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
    if "branding" not in report_cols:
        op.add_column("reports", sa.Column("branding", postgresql.JSONB(), nullable=True))

    idx_names = {i["name"] for i in inspector.get_indexes("reports")}
    if "ix_reports_analysis_id" not in idx_names:
        op.create_index("ix_reports_analysis_id", "reports", ["analysis_id"])

    ingest_cols = {c["name"] for c in inspector.get_columns("ingested_documents")}
    if "content_hash" not in ingest_cols:
        op.add_column("ingested_documents", sa.Column("content_hash", sa.String(64), nullable=True))
        op.create_index("ix_ingested_documents_content_hash", "ingested_documents", ["content_hash"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    ingest_cols = {c["name"] for c in inspector.get_columns("ingested_documents")}
    if "content_hash" in ingest_cols:
        op.drop_index("ix_ingested_documents_content_hash", table_name="ingested_documents")
        op.drop_column("ingested_documents", "content_hash")

    report_cols = {c["name"] for c in inspector.get_columns("reports")}
    for col in ("branding", "corpus_id", "parent_report_id", "version", "expires_in_days", "password_hash", "template"):
        if col in report_cols:
            op.drop_column("reports", col)
    idx_names = {i["name"] for i in inspector.get_indexes("reports")}
    if "ix_reports_analysis_id" in idx_names:
        op.drop_index("ix_reports_analysis_id", table_name="reports")

    if "document_corpora" in inspector.get_table_names():
        op.drop_table("document_corpora")
