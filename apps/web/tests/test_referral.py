"""
Tests for the Referral Program (backlog C-02).

Covers:
- referral_service pure logic (code format + stability, self-referral,
  duplicate referee, valid redeem awards 100/50)
- API endpoints (/api/v1/referral/code, /api/v1/referral/redeem) including
  success and 400 (self / duplicate / invalid / missing input)
"""

import pytest

from app import create_app
from app.referral_service import (
    generate_referral_code,
    validate_code_format,
    redeem,
    REFERRER_REWARD,
    REFEREE_REWARD,
)


# ---------------------------------------------------------------------------
# Pure service-layer tests
# ---------------------------------------------------------------------------

def test_generate_code_format():
    code = generate_referral_code(42)
    assert validate_code_format(code) is True
    assert len(code) == 8
    assert code == code.upper()
    assert code.isalnum()


def test_generate_code_is_stable():
    """Same user_id must always produce the same code."""
    assert generate_referral_code(123) == generate_referral_code(123)
    assert generate_referral_code("user-abc") == generate_referral_code("user-abc")


def test_generate_code_differs_between_users():
    assert generate_referral_code(1) != generate_referral_code(2)


@pytest.mark.parametrize("code,expected", [
    ("ABCD1234", True),
    ("AAAAAAAA", True),
    ("12345678", True),
    ("abcd1234", False),   # lowercase
    ("ABCD123", False),    # too short
    ("ABCD12345", False),  # too long
    ("ABCD-234", False),   # non-alphanumeric
    ("", False),
    (None, False),
    (12345678, False),     # not a string
])
def test_validate_code_format(code, expected):
    assert validate_code_format(code) is expected


def test_redeem_success_awards_rewards():
    result = redeem(1, 2, generate_referral_code(1), already_redeemed_referee_ids=set())
    assert result['ok'] is True
    assert result['referrer_reward'] == REFERRER_REWARD == 100
    assert result['referee_reward'] == REFEREE_REWARD == 50


def test_redeem_self_referral_rejected():
    result = redeem(7, 7, generate_referral_code(7), already_redeemed_referee_ids=set())
    assert result['ok'] is False
    assert result['referrer_reward'] == 0
    assert result['referee_reward'] == 0
    assert result['reason']


def test_redeem_bad_code_format_rejected():
    result = redeem(1, 2, "bad", already_redeemed_referee_ids=set())
    assert result['ok'] is False
    assert result['referrer_reward'] == 0
    assert result['referee_reward'] == 0


def test_redeem_duplicate_referee_rejected():
    result = redeem(1, 2, generate_referral_code(1), already_redeemed_referee_ids={2})
    assert result['ok'] is False
    assert result['referrer_reward'] == 0
    assert result['referee_reward'] == 0


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

@pytest.fixture()
def client():
    app = create_app("testing")
    return app.test_client()


def test_api_code_returns_stable_code(client):
    r1 = client.post('/api/v1/referral/code', json={'user_id': 99})
    assert r1.status_code == 200
    body1 = r1.get_json()
    assert body1['user_id'] == 99
    assert validate_code_format(body1['code'])

    # Stable: a second call yields the same code
    r2 = client.post('/api/v1/referral/code', json={'user_id': 99})
    assert r2.get_json()['code'] == body1['code']


def test_api_code_missing_user_id_returns_400(client):
    r = client.post('/api/v1/referral/code', json={})
    assert r.status_code == 400
    assert r.get_json()['ok'] is False


def test_api_redeem_success(client):
    code = generate_referral_code(1000)
    r = client.post('/api/v1/referral/redeem', json={
        'referrer_user_id': 1000,
        'referee_user_id': 2000,
        'code': code,
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body['ok'] is True
    assert body['referrer_reward'] == 100
    assert body['referee_reward'] == 50


def test_api_redeem_self_referral_returns_400(client):
    code = generate_referral_code(5)
    r = client.post('/api/v1/referral/redeem', json={
        'referrer_user_id': 5,
        'referee_user_id': 5,
        'code': code,
    })
    assert r.status_code == 400
    assert r.get_json()['ok'] is False


def test_api_redeem_invalid_code_returns_400(client):
    r = client.post('/api/v1/referral/redeem', json={
        'referrer_user_id': 1,
        'referee_user_id': 2,
        'code': 'bad',
    })
    assert r.status_code == 400
    assert r.get_json()['ok'] is False


def test_api_redeem_missing_input_returns_400(client):
    r = client.post('/api/v1/referral/redeem', json={
        'referrer_user_id': 1,
    })
    assert r.status_code == 400
    assert r.get_json()['ok'] is False


def test_api_redeem_duplicate_referee_returns_400(client):
    code = generate_referral_code(3001)
    payload = {
        'referrer_user_id': 3001,
        'referee_user_id': 4001,
        'code': code,
    }
    first = client.post('/api/v1/referral/redeem', json=payload)
    assert first.status_code == 200
    assert first.get_json()['ok'] is True

    # Same referee redeeming again -> rejected (idempotency)
    second = client.post('/api/v1/referral/redeem', json=payload)
    assert second.status_code == 400
    assert second.get_json()['ok'] is False
