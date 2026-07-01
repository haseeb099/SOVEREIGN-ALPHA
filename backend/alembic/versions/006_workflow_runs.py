"""Phase 19 — workflow_runs table for HITL due diligence orchestrator."""

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "workflow_runs" not in inspector.get_table_names():
        op.create_table(
            "workflow_runs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.String(128), nullable=True),
            sa.Column("goal", sa.Text(), nullable=False),
            sa.Column("ticker", sa.String(16), nullable=True),
            sa.Column("status", sa.String(32), nullable=False, server_default="running"),
            sa.Column("plan_json", postgresql.JSONB(), nullable=True),
            sa.Column("state_json", postgresql.JSONB(), nullable=True),
            sa.Column("pending_checkpoint", postgresql.JSONB(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_workflow_runs_user_id", "workflow_runs", ["user_id"])
        op.create_index("ix_workflow_runs_ticker", "workflow_runs", ["ticker"])
        op.create_index("ix_workflow_runs_status", "workflow_runs", ["status"])
        op.create_index("ix_workflow_runs_created_at", "workflow_runs", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "workflow_runs" in inspector.get_table_names():
        op.drop_table("workflow_runs")
