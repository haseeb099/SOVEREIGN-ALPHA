"""Initial schema — user-scoped tables and thesis time-series."""

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("email", sa.String(256), nullable=True),
        sa.Column("plan_tier", sa.String(32), server_default="free"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "thesis_analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), nullable=True),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("scenario", postgresql.JSONB(), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=False),
        sa.Column("sovereign_score", sa.Float(), nullable=True),
        sa.Column("distribution", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_thesis_analyses_ticker", "thesis_analyses", ["ticker"])
    op.create_index("ix_thesis_analyses_user_id", "thesis_analyses", ["user_id"])


def downgrade() -> None:
    op.drop_table("thesis_analyses")
    op.drop_table("users")
