"""
Referral API Endpoints
RESTful API for the customer referral program (backlog C-02)

Endpoints (under /api/v1):
- POST /referral/code    body {user_id} -> {user_id, code}
- POST /referral/redeem  body {referrer_user_id, referee_user_id, code}
"""

from flask import Blueprint, request, jsonify

from app.referral_service import (
    generate_referral_code,
    redeem,
    validate_code_format,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

referral_bp = Blueprint('referral', __name__, url_prefix='/referral')

# Simple in-memory idempotency store of referee ids that have already redeemed.
# NOTE: module-level state, no database migration (per scope).
_redeemed_referee_ids = set()


@referral_bp.route('/code', methods=['POST'])
def get_referral_code():
    """Return the stable referral code for a given user_id."""
    data = request.get_json(silent=True) or {}

    user_id = data.get('user_id')
    if user_id is None or (isinstance(user_id, str) and user_id.strip() == ''):
        return jsonify({
            'ok': False,
            'reason': 'missing user_id'
        }), 400

    code = generate_referral_code(user_id)

    return jsonify({
        'user_id': user_id,
        'code': code
    }), 200


@referral_bp.route('/redeem', methods=['POST'])
def redeem_referral():
    """Redeem a referral code, awarding both referrer and referee."""
    data = request.get_json(silent=True) or {}

    referrer_user_id = data.get('referrer_user_id')
    referee_user_id = data.get('referee_user_id')
    code = data.get('code')

    # Validate presence of required inputs
    if referrer_user_id is None or referee_user_id is None or code is None:
        return jsonify({
            'ok': False,
            'reason': 'missing required field(s): referrer_user_id, referee_user_id, code'
        }), 400

    result = redeem(
        referrer_user_id=referrer_user_id,
        referee_user_id=referee_user_id,
        code=code,
        already_redeemed_referee_ids=_redeemed_referee_ids,
    )

    if not result['ok']:
        return jsonify({
            'ok': False,
            'reason': result['reason']
        }), 400

    # Record referee for idempotency on success
    _redeemed_referee_ids.add(referee_user_id)

    logger.info(
        f"Referral redeemed: referrer={referrer_user_id} referee={referee_user_id}"
    )

    return jsonify({
        'ok': True,
        'referrer_reward': result['referrer_reward'],
        'referee_reward': result['referee_reward']
    }), 200


__all__ = ['referral_bp']
