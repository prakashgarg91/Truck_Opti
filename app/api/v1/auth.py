"""
Authentication API Endpoints
User registration, login, and account management
"""

from flask import Blueprint, request, jsonify, g
from app.models import db
from app.middleware.authentication import generate_token, require_auth
from app.middleware.validation import validate_request, Validator
from app.middleware.rate_limiting import rate_limit
from app.core.logging import get_logger
from datetime import datetime
import bcrypt

logger = get_logger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')


# User model (simplified - expand based on your needs)
class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255))
    role = db.Column(db.String(50), default='user')  # user, admin, etc.
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)

    def set_password(self, password: str):
        """Hash and set user password"""
        self.password_hash = bcrypt.hashpw(
            password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')

    def check_password(self, password: str) -> bool:
        """Verify password against hash"""
        return bcrypt.checkpw(
            password.encode('utf-8'),
            self.password_hash.encode('utf-8')
        )

    def as_dict(self):
        """Convert user to dictionary (without password)"""
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role,
            'active': self.active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }


@auth_bp.route('/register', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=3600)  # 5 registrations per hour
@validate_request({
    'email': {'type': 'email', 'required': True},
    'password': {'type': 'string', 'required': True, 'min': 8, 'max': 128},
    'name': {'type': 'string', 'required': False, 'max': 255}
})
def register():
    """
    Register new user account

    Request body:
    {
        "email": "user@example.com",
        "password": "SecurePassword123",
        "name": "John Doe"
    }
    """
    try:
        data = request.validated_data

        # Check if user already exists
        existing_user = User.query.filter_by(email=data['email']).first()
        if existing_user:
            return jsonify({
                'success': False,
                'error': 'Email already registered',
                'message': 'An account with this email already exists'
            }), 409

        # Validate password strength
        password = data['password']
        if len(password) < 8:
            return jsonify({
                'success': False,
                'error': 'Weak password',
                'message': 'Password must be at least 8 characters long'
            }), 400

        # Create user
        user = User(
            email=data['email'],
            name=data.get('name', '')
        )
        user.set_password(password)

        db.session.add(user)
        db.session.commit()

        # Generate token
        token = generate_token(user.id, user.email, user.role)

        logger.info(f"New user registered: {user.email}")

        return jsonify({
            'success': True,
            'message': 'User registered successfully',
            'data': {
                'user': user.as_dict(),
                'token': token
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Registration error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Registration failed',
            'message': str(e)
        }), 500


@auth_bp.route('/login', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=300)  # 10 login attempts per 5 minutes
@validate_request({
    'email': {'type': 'email', 'required': True},
    'password': {'type': 'string', 'required': True}
})
def login():
    """
    User login

    Request body:
    {
        "email": "user@example.com",
        "password": "SecurePassword123"
    }
    """
    try:
        data = request.validated_data

        # Find user
        user = User.query.filter_by(email=data['email']).first()

        if not user or not user.check_password(data['password']):
            return jsonify({
                'success': False,
                'error': 'Invalid credentials',
                'message': 'Email or password is incorrect'
            }), 401

        # Check if user is active
        if not user.active:
            return jsonify({
                'success': False,
                'error': 'Account disabled',
                'message': 'Your account has been disabled'
            }), 403

        # Update last login
        user.last_login = datetime.utcnow()
        db.session.commit()

        # Generate token
        token = generate_token(user.id, user.email, user.role)

        logger.info(f"User logged in: {user.email}")

        return jsonify({
            'success': True,
            'message': 'Login successful',
            'data': {
                'user': user.as_dict(),
                'token': token
            }
        }), 200

    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Login failed',
            'message': str(e)
        }), 500


@auth_bp.route('/me', methods=['GET'])
@require_auth
def get_current_user():
    """Get current authenticated user profile"""
    try:
        user_id = g.current_user['user_id']
        user = User.query.get(user_id)

        if not user:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404

        return jsonify({
            'success': True,
            'data': user.as_dict()
        }), 200

    except Exception as e:
        logger.error(f"Get user error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get user',
            'message': str(e)
        }), 500


@auth_bp.route('/me', methods=['PUT'])
@require_auth
@validate_request({
    'name': {'type': 'string', 'required': False, 'max': 255},
    'email': {'type': 'email', 'required': False}
})
def update_current_user():
    """Update current user profile"""
    try:
        user_id = g.current_user['user_id']
        user = User.query.get(user_id)

        if not user:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404

        data = request.validated_data

        # Update fields
        if 'name' in data:
            user.name = data['name']

        if 'email' in data:
            # Check if email is already taken
            existing_user = User.query.filter_by(email=data['email']).first()
            if existing_user and existing_user.id != user.id:
                return jsonify({
                    'success': False,
                    'error': 'Email already in use'
                }), 409
            user.email = data['email']

        db.session.commit()

        logger.info(f"User profile updated: {user.email}")

        return jsonify({
            'success': True,
            'message': 'Profile updated successfully',
            'data': user.as_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Update user error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update profile',
            'message': str(e)
        }), 500


@auth_bp.route('/change-password', methods=['POST'])
@require_auth
@validate_request({
    'current_password': {'type': 'string', 'required': True},
    'new_password': {'type': 'string', 'required': True, 'min': 8, 'max': 128}
})
def change_password():
    """Change user password"""
    try:
        user_id = g.current_user['user_id']
        user = User.query.get(user_id)

        if not user:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404

        data = request.validated_data

        # Verify current password
        if not user.check_password(data['current_password']):
            return jsonify({
                'success': False,
                'error': 'Invalid current password'
            }), 401

        # Set new password
        user.set_password(data['new_password'])
        db.session.commit()

        logger.info(f"Password changed for user: {user.email}")

        return jsonify({
            'success': True,
            'message': 'Password changed successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Change password error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to change password',
            'message': str(e)
        }), 500


@auth_bp.route('/logout', methods=['POST'])
@require_auth
def logout():
    """
    Logout user (client-side token removal)
    """
    logger.info(f"User logged out: {g.current_user['email']}")

    return jsonify({
        'success': True,
        'message': 'Logged out successfully'
    }), 200


__all__ = ['auth_bp', 'User']
