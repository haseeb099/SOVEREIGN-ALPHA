"""Alembic migration integrity tests."""
import os
from pathlib import Path

import pytest


def test_migration_003_is_head():
    versions_dir = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    revisions = sorted(p.stem for p in versions_dir.glob("*.py") if not p.name.startswith("__"))
    assert revisions, "No alembic versions found"
    assert revisions[-1].startswith("003_"), f"Expected 003 as head, got {revisions[-1]}"


def test_migration_003_adds_ingested_document_columns():
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "003_ingested_documents_columns.py"
    )
    source = migration_path.read_text(encoding="utf-8")
    for column in ("user_id", "raw_text", "ticker_guess", "tags"):
        assert column in source, f"Migration 003 should add {column}"


def test_psycopg2_listed_in_requirements():
    req_path = Path(__file__).resolve().parent.parent / "requirements.txt"
    content = req_path.read_text(encoding="utf-8")
    assert "psycopg2-binary" in content
