"""
Referral Program - Pure Python Service Layer (no Flask)
TruckOpti Advanced Logistics Platform for India

A customer gets a unique, stable referral code. When a NEW user redeems it,
both the referrer and the referee receive a one-time reward credit (INR).

This module is framework-agnostic so it can be unit tested in isolation.
"""

import hashlib
import string

# Reward amounts in INR
REFERRER_REWARD = 100
REFEREE_REWARD = 50

# Code constants
CODE_LENGTH = 8
_ALPHABET = string.ascii_uppercase + string.digits  # 8-char UPPERCASE alphanumeric


def generate_referral_code(user_id):
    """
    Generate an 8-char UPPERCASE alphanumeric referral code that is STABLE
    per user_id (same input always yields the same code).

    A deterministic SHA-256 hash of the user_id is mapped onto the
    [A-Z0-9] alphabet, so no randomness is involved.
    """
    # Normalise to a stable string representation
    seed = str(user_id).encode('utf-8')
    digest = hashlib.sha256(seed).digest()

    code_chars = []
    for i in range(CODE_LENGTH):
        # Each byte selects one character from the alphabet
        code_chars.append(_ALPHABET[digest[i] % len(_ALPHABET)])

    return ''.join(code_chars)


def validate_code_format(code):
    """
    Return True only when `code` is exactly 8 UPPERCASE alphanumeric chars.
    """
    if not isinstance(code, str):
        return False
    if len(code) != CODE_LENGTH:
        return False
    return all(c in _ALPHABET for c in code)


def redeem(referrer_user_id, referee_user_id, code, already_redeemed_referee_ids):
    """
    Attempt to redeem a referral code.

    Returns a dict:
        {ok, referrer_reward, referee_reward, reason}

    Rejection rules (ok=False, rewards 0):
      - self-referral (referrer == referee)
      - bad code format
      - referee already redeemed (idempotency)
    """
    # Bad / missing code format
    if not validate_code_format(code):
        return {
            'ok': False,
            'referrer_reward': 0,
            'referee_reward': 0,
            'reason': 'invalid_code_format',
        }

    # Self-referral not allowed
    if referrer_user_id == referee_user_id:
        return {
            'ok': False,
            'referrer_reward': 0,
            'referee_reward': 0,
            'reason': 'self_referral_not_allowed',
        }

    # Idempotency: a referee may only ever be redeemed once
    if already_redeemed_referee_ids is not None and \
            referee_user_id in already_redeemed_referee_ids:
        return {
            'ok': False,
            'referrer_reward': 0,
            'referee_reward': 0,
            'reason': 'referee_already_redeemed',
        }

    # Success
    return {
        'ok': True,
        'referrer_reward': REFERRER_REWARD,
        'referee_reward': REFEREE_REWARD,
        'reason': 'ok',
    }


__all__ = [
    'generate_referral_code',
    'validate_code_format',
    'redeem',
    'REFERRER_REWARD',
    'REFEREE_REWARD',
]
