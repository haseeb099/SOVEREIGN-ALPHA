"""Align tenant tables with ORM — org_id on snapshots; document_chunks types."""

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


SNAPSHOT_TABLES = ("portfolio_snapshots", "thesis_health_snapshots")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    for table in SNAPSHOT_TABLES:
        if table in tables:
            cols = {c["name"] for c in inspector.get_columns(table)}
            if "org_id" not in cols:
                op.add_column(
                    table,
                    sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
                )
                op.create_index(f"ix_{table}_org_id", table, ["org_id"])

    if "document_chunks" in tables:
        cols = {c["name"]: c for c in inspector.get_columns("document_chunks")}
        id_col = cols.get("id")
        if id_col and "uuid" in str(id_col.get("type", "")).lower():
            op.execute(
                """
                ALTER TABLE document_chunks
                ALTER COLUMN id TYPE VARCHAR(128) USING id::text
                """
            )
        doc_col = cols.get("document_id")
        if doc_col and "uuid" in str(doc_col.get("type", "")).lower():
            op.execute(
                """
                ALTER TABLE document_chunks
                ALTER COLUMN document_id TYPE VARCHAR(128) USING document_id::text
                """
            )
        emb_col = cols.get("embedding")
        if emb_col and "json" not in str(emb_col.get("type", "")).lower():
            op.execute(
                """
                ALTER TABLE document_chunks
                ALTER COLUMN embedding TYPE JSONB
                USING CASE
                    WHEN embedding IS NULL THEN NULL
                    WHEN embedding::text ~ '^\\[' THEN embedding::jsonb
                    ELSE NULL
                END
                """
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    for table in SNAPSHOT_TABLES:
        if table in tables:
            cols = {c["name"] for c in inspector.get_columns(table)}
            if "org_id" in cols:
                op.drop_index(f"ix_{table}_org_id", table_name=table)
                op.drop_column(table, "org_id")
