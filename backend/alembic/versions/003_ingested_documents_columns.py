"""Add missing ingested_documents columns from models.py."""

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "ingested_documents" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("ingested_documents")}
    if "user_id" not in existing:
        op.add_column("ingested_documents", sa.Column("user_id", sa.String(128), nullable=True))
        op.create_index("ix_ingested_documents_user_id", "ingested_documents", ["user_id"])
    if "raw_text" not in existing:
        op.add_column("ingested_documents", sa.Column("raw_text", sa.Text(), nullable=True))
    if "ticker_guess" not in existing:
        op.add_column("ingested_documents", sa.Column("ticker_guess", sa.String(16), nullable=True))
    if "tags" not in existing:
        op.add_column("ingested_documents", sa.Column("tags", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "ingested_documents" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("ingested_documents")}
    if "tags" in existing:
        op.drop_column("ingested_documents", "tags")
    if "ticker_guess" in existing:
        op.drop_column("ingested_documents", "ticker_guess")
    if "raw_text" in existing:
        op.drop_column("ingested_documents", "raw_text")
    if "user_id" in existing:
        op.drop_index("ix_ingested_documents_user_id", table_name="ingested_documents")
        op.drop_column("ingested_documents", "user_id")
