"""Phase 23 — GTM: waitlist, beta, enterprise leads, Stripe fields."""

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "waitlist_subscribers" not in tables:
        op.create_table(
            "waitlist_subscribers",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("email", sa.String(256), nullable=False),
            sa.Column("role", sa.String(64), nullable=True),
            sa.Column("source", sa.String(64), server_default="landing"),
            sa.Column("confirmed", sa.Boolean(), server_default="false"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_waitlist_subscribers_email", "waitlist_subscribers", ["email"], unique=True)

    if "beta_applications" not in tables:
        op.create_table(
            "beta_applications",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("email", sa.String(256), nullable=False),
            sa.Column("name", sa.String(256), nullable=True),
            sa.Column("firm", sa.String(256), nullable=True),
            sa.Column("role", sa.String(128), nullable=True),
            sa.Column("use_case", sa.Text(), nullable=True),
            sa.Column("status", sa.String(32), server_default="pending"),
            sa.Column("invite_code", sa.String(64), nullable=True, unique=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_beta_applications_email", "beta_applications", ["email"])

    if "enterprise_leads" not in tables:
        op.create_table(
            "enterprise_leads",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("firm", sa.String(256), nullable=False),
            sa.Column("email", sa.String(256), nullable=False),
            sa.Column("aum_band", sa.String(64), nullable=True),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("ix_enterprise_leads_email", "enterprise_leads", ["email"])

    if "onboarding_events" not in tables:
        op.create_table(
            "onboarding_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.String(128), nullable=True, index=True),
            sa.Column("event_type", sa.String(64), nullable=False),
            sa.Column("payload", postgresql.JSONB(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
            ),
        )

    user_cols = {c["name"] for c in inspector.get_columns("users")}
    if "stripe_customer_id" not in user_cols:
        op.add_column("users", sa.Column("stripe_customer_id", sa.String(128), nullable=True))
    if "stripe_subscription_id" not in user_cols:
        op.add_column("users", sa.Column("stripe_subscription_id", sa.String(128), nullable=True))
    if "beta_invite_code" not in user_cols:
        op.add_column("users", sa.Column("beta_invite_code", sa.String(64), nullable=True))
    if "beta_expires_at" not in user_cols:
        op.add_column("users", sa.Column("beta_expires_at", sa.DateTime(timezone=True), nullable=True))
    if "onboarding_completed_at" not in user_cols:
        op.add_column("users", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed_at")
    op.drop_column("users", "beta_expires_at")
    op.drop_column("users", "beta_invite_code")
    op.drop_column("users", "stripe_subscription_id")
    op.drop_column("users", "stripe_customer_id")
    op.drop_table("onboarding_events")
    op.drop_table("enterprise_leads")
    op.drop_table("beta_applications")
    op.drop_table("waitlist_subscribers")
