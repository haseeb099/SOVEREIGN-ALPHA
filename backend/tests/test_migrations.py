"""Alembic migration integrity tests."""
from pathlib import Path


def test_migration_006_is_head():
    versions_dir = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    revisions = sorted(p.stem for p in versions_dir.glob("*.py") if not p.name.startswith("__"))
    assert revisions, "No alembic versions found"
    assert revisions[-1].startswith("006_"), f"Expected 006 as head, got {revisions[-1]}"


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
