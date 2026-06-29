"""Helpers for JSON Schema contract tests."""
import json
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "schemas"


def load_schema(name: str) -> dict:
    path = SCHEMAS_DIR / name
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def validate_against_schema(payload: dict, schema_name: str) -> list[str]:
    """Return a list of validation error messages (empty if valid)."""
    schema = load_schema(schema_name)
    validator = Draft202012Validator(schema)
    return [e.message for e in sorted(validator.iter_errors(payload), key=lambda e: e.path)]
