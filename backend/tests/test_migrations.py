"""Alembic migration integrity tests."""
from pathlib import Path


def test_migration_009_is_head():
    versions_dir = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    revisions = sorted(p.stem for p in versions_dir.glob("*.py") if not p.name.startswith("__"))
    assert revisions, "No alembic versions found"
    assert revisions[-1].startswith("009_"), f"Expected 009 as head, got {revisions[-1]}"


def test_migration_008_is_before_009():
    versions_dir = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    revisions = sorted(p.stem for p in versions_dir.glob("*.py") if not p.name.startswith("__"))
    assert "008_phase22_enterprise" in revisions
    assert revisions.index("008_phase22_enterprise") < revisions.index("009_phase23_gtm")


def test_migration_009_adds_gtm_tables():
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "009_phase23_gtm.py"
    )
    source = migration_path.read_text(encoding="utf-8")
    assert "waitlist_subscribers" in source
    assert "beta_applications" in source
    assert "enterprise_leads" in source
    assert "stripe_customer_id" in source


def test_migration_007_is_before_008():
    versions_dir = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    revisions = sorted(p.stem for p in versions_dir.glob("*.py") if not p.name.startswith("__"))
    assert "007_phase20_filing_watchers" in revisions
    assert revisions.index("007_phase20_filing_watchers") < revisions.index("008_phase22_enterprise")


def test_migration_008_adds_enterprise_tables():
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "008_phase22_enterprise.py"
    )
    source = migration_path.read_text(encoding="utf-8")
    assert "organisations" in source
    assert "audit_events" in source
    assert "workspaces" in source
    assert "org_id" in source


def test_migration_006_is_before_007():
    versions_dir = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    revisions = sorted(p.stem for p in versions_dir.glob("*.py") if not p.name.startswith("__"))
    assert "006_workflow_runs" in revisions
    assert revisions.index("006_workflow_runs") < revisions.index("007_phase20_filing_watchers")


def test_migration_007_adds_filing_watchers():
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "007_phase20_filing_watchers.py"
    )
    source = migration_path.read_text(encoding="utf-8")
    assert "filing_events" in source
    assert "filing_watch_subscriptions" in source


def test_migration_006_adds_workflow_runs():
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "006_workflow_runs.py"
    )
    source = migration_path.read_text(encoding="utf-8")
    assert "workflow_runs" in source
    assert "pending_checkpoint" in source


def test_migration_005_is_before_006():
    versions_dir = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    revisions = sorted(p.stem for p in versions_dir.glob("*.py") if not p.name.startswith("__"))
    assert "005_phase18_corpora_reports" in revisions
    assert revisions.index("005_phase18_corpora_reports") < revisions.index("006_workflow_runs")


def test_migration_004_adds_pgvector_and_chunks():
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "004_pgvector_chunks.py"
    )
    source = migration_path.read_text(encoding="utf-8")
    assert "vector" in source
    assert "document_chunks" in source
    assert "memo_feedback" in source


def test_migration_005_adds_corpora_and_report_columns():
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "005_phase18_corpora_reports.py"
    )
    source = migration_path.read_text(encoding="utf-8")
    assert "document_corpora" in source
    assert "password_hash" in source
    assert "parent_report_id" in source


def test_langgraph_listed_in_requirements():
    req_path = Path(__file__).resolve().parent.parent / "requirements.txt"
    content = req_path.read_text(encoding="utf-8")
    assert "langgraph" in content
    assert "langchain-core" in content


def test_psycopg2_listed_in_requirements():
    req_path = Path(__file__).resolve().parent.parent / "requirements.txt"
    content = req_path.read_text(encoding="utf-8")
    assert "psycopg2-binary" in content
