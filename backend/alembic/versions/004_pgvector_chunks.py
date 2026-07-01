"""Enable pgvector and add document_chunks + memo_feedback tables."""

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    inspector = sa.inspect(bind)
    if "document_chunks" not in inspector.get_table_names():
        op.create_table(
            "document_chunks",
            sa.Column("id", sa.String(128), primary_key=True),
            sa.Column("document_id", sa.String(128), nullable=True),
            sa.Column("ticker", sa.String(16), nullable=True),
            sa.Column("source_type", sa.String(32), nullable=False),
            sa.Column("page", sa.Integer(), nullable=True),
            sa.Column("chunk_text", sa.Text(), nullable=False),
            sa.Column("embedding", postgresql.JSONB(), nullable=True),
            sa.Column("chunk_metadata", postgresql.JSONB(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )
        op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
        op.create_index("ix_document_chunks_ticker", "document_chunks", ["ticker"])
        op.create_index("ix_document_chunks_source_type", "document_chunks", ["source_type"])
        op.create_index("ix_document_chunks_created_at", "document_chunks", ["created_at"])

    if "memo_feedback" not in inspector.get_table_names():
        op.create_table(
            "memo_feedback",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.String(128), nullable=True),
            sa.Column("analysis_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("ticker", sa.String(16), nullable=True),
            sa.Column("section", sa.String(32), nullable=False),
            sa.Column("vote", sa.String(8), nullable=False),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )
        op.create_index("ix_memo_feedback_user_id", "memo_feedback", ["user_id"])
        op.create_index("ix_memo_feedback_analysis_id", "memo_feedback", ["analysis_id"])
        op.create_index("ix_memo_feedback_ticker", "memo_feedback", ["ticker"])
        op.create_index("ix_memo_feedback_created_at", "memo_feedback", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "memo_feedback" in inspector.get_table_names():
        op.drop_table("memo_feedback")
    if "document_chunks" in inspector.get_table_names():
        op.drop_table("document_chunks")
