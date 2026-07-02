"""Audit service unit tests."""
import hashlib
import json
import uuid

from services.audit_service import _compute_checksum


def test_checksum_is_deterministic():
    org_id = uuid.uuid4()
    payload = {"rating": "BULLISH"}
    c1 = _compute_checksum(org_id, "user-1", "analyze.complete", "thesis", "TSLA", payload, None)
    c2 = _compute_checksum(org_id, "user-1", "analyze.complete", "thesis", "TSLA", payload, None)
    assert c1 == c2
    assert len(c1) == 64


def test_checksum_changes_with_prior():
    org_id = uuid.uuid4()
    prior = hashlib.sha256(b"prior").hexdigest()
    base = _compute_checksum(org_id, "u", "act", "res", "id", {}, None)
    chained = _compute_checksum(org_id, "u", "act", "res", "id", {"prior_checksum": prior}, prior)
    assert base != chained
