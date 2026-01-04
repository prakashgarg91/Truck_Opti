"""
Authentication API Endpoints
User registration, login, and account management
"""

from flask import Blueprint, request, jsonify, g
from app.models import db
from app.middleware.authentication import generate_token, require_auth
from app.middleware.validation import validate_request
from app.middleware.rate_limiting import rate_limit
from app.core.logging import get_logger
from datetime import datetime
import bcrypt

logger = get_logger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')


# User model (enhanced for OTP + Google OAuth - Indian Market)
class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255))
    role = db.Column(db.String(50), default='user')  # user, admin, driver, fleet_manager
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    # OTP Authentication fields (for Indian market)
    phone_number = db.Column(db.String(15), unique=True, index=True)  # +91XXXXXXXXXX
    phone_verified = db.Column(db.Boolean, default=False)
    otp_code = db.Column(db.String(6))
    otp_expires_at = db.Column(db.DateTime)
    otp_attempts = db.Column(db.Integer, default=0)
    
    # Google OAuth fields
    google_id = db.Column(db.String(255), unique=True, index=True)
    google_access_token = db.Column(db.Text)
    google_refresh_token = db.Column(db.Text)
    google_token_expires = db.Column(db.String(50))
    profile_picture = db.Column(db.String(500))
    email_verified = db.Column(db.Boolean, default=False)
    
    # Location sharing consent
    location_sharing_enabled = db.Column(db.Boolean, default=False)
    last_known_latitude = db.Column(db.Float)
    last_known_longitude = db.Column(db.Float)
    last_location_update = db.Column(db.DateTime)

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
        """Convert user to dictionary (without sensitive data)"""
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role,
            'active': self.active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            # OTP fields
            'phone_number': self.phone_number,
            'phone_verified': self.phone_verified,
            # Google fields
            'google_linked': bool(self.google_id),
            'profile_picture': self.profile_picture,
            'email_verified': self.email_verified,
            # Location
            'location_sharing_enabled': self.location_sharing_enabled
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


# =============================================================================
# OTP AUTHENTICATION ENDPOINTS (for Indian Market - FREE Options)
# Supports: Telegram Bot (FREE), Email (FREE), Console (DEV mode)
# =============================================================================

from app.services.otp_service import create_otp_service, OTPChannel
import os

# Create OTP service instance
otp_service = create_otp_service()


@auth_bp.route('/send-otp', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=3600)  # 10 OTPs per hour (more generous for free service)
@validate_request({
    'phone': {'type': 'string', 'required': False},  # Phone for Telegram
    'email': {'type': 'email', 'required': False},   # Email for email OTP
    'channel': {'type': 'string', 'required': False}  # telegram, email, console
})
def send_otp():
    """
    Send OTP via FREE channels (Telegram Bot, Email, or Console for dev)
    
    Request body:
    {
        "phone": "+919876543210" or "9876543210",  // For Telegram
        "email": "user@example.com",                // For Email
        "channel": "telegram" | "email" | "console" // Optional, auto-detected
    }
    
    Response:
    {
        "success": true,
        "message": "OTP sent via Telegram",
        "data": {
            "reference_id": "OTP-abc123-120000",
            "expires_in_seconds": 300,
            "channel": "telegram",
            "dev_otp": "123456"  // Only in DEV mode
        }
    }
    """
    try:
        data = request.validated_data
        phone = data.get('phone')
        email = data.get('email')
        channel_str = data.get('channel', '').lower()
        
        # Determine target and channel
        if email and (channel_str == 'email' or not channel_str):
            target = email
            channel = OTPChannel.EMAIL
        elif phone:
            # Validate phone format (Indian numbers)
            phone_digits = ''.join(filter(str.isdigit, phone))
            if len(phone_digits) < 10:
                return jsonify({
                    'success': False,
                    'error': 'Invalid phone number',
                    'message': 'Please provide a valid 10-digit Indian mobile number'
                }), 400
            
            target = phone
            if channel_str == 'telegram':
                channel = OTPChannel.TELEGRAM
            elif channel_str == 'console':
                channel = OTPChannel.CONSOLE
            else:
                channel = OTPChannel.TELEGRAM  # Default to Telegram (FREE)
        else:
            return jsonify({
                'success': False,
                'error': 'Contact required',
                'message': 'Please provide either phone number (for Telegram) or email address'
            }), 400
        
        # Send OTP (returns 3 values: success, message, dev_otp_or_none)
        success, message, dev_otp = otp_service.send_otp(target, channel)
        
        if success:
            response_data = {
                'reference_id': f"OTP-{target[-4:]}-{int(datetime.utcnow().timestamp())}",
                'expires_in_seconds': 300,
                'channel': channel.value
            }
            
            # Include OTP in response for DEV mode (console) or when FLASK_DEBUG=true
            if dev_otp and (os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'):
                response_data['dev_otp'] = dev_otp
                
            return jsonify({
                'success': True,
                'message': message,
                'data': response_data
            }), 200
        else:
            status_code = 429 if 'wait' in message.lower() or 'exceeded' in message.lower() else 400
            return jsonify({
                'success': False,
                'error': 'OTP send failed',
                'message': message
            }), status_code
            
    except Exception as e:
        logger.error(f"Send OTP error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to send OTP',
            'message': str(e)
        }), 500


@auth_bp.route('/verify-otp', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=300)  # 10 attempts per 5 minutes
@validate_request({
    'phone': {'type': 'string', 'required': False},  # For Telegram OTP
    'email': {'type': 'email', 'required': False},   # For Email OTP
    'otp': {'type': 'string', 'required': True}
})
def verify_otp():
    """
    Verify OTP and login/register user
    
    Request body:
    {
        "phone": "+919876543210",  // OR
        "email": "user@example.com",
        "otp": "123456"
    }
    
    Response (success):
    {
        "success": true,
        "message": "OTP verified successfully",
        "data": {
            "user": {...},
            "token": "jwt_token",
            "is_new_user": false
        }
    }
    """
    try:
        data = request.validated_data
        phone = data.get('phone')
        email = data.get('email')
        otp = data['otp']
        
        # Determine verification target
        if email:
            target = email
            is_phone_auth = False
        elif phone:
            target = phone
            is_phone_auth = True
        else:
            return jsonify({
                'success': False,
                'error': 'Contact required',
                'message': 'Please provide either phone number or email address'
            }), 400
        
        # Verify OTP
        valid, message = otp_service.verify_otp(target, otp)
        
        if not valid:
            return jsonify({
                'success': False,
                'error': 'OTP verification failed',
                'message': message
            }), 401
        
        # Find or create user based on auth method
        is_new_user = False
        
        if is_phone_auth:
            # Normalize phone number
            phone_digits = ''.join(filter(str.isdigit, phone))
            if len(phone_digits) == 10:
                normalized_phone = f"+91{phone_digits}"
            elif len(phone_digits) == 12 and phone_digits.startswith("91"):
                normalized_phone = f"+{phone_digits}"
            else:
                normalized_phone = f"+91{phone_digits[-10:]}"
            
            # Find or create user by phone
            user = User.query.filter_by(phone_number=normalized_phone).first()
            
            if not user:
                # Create new user with phone number
                user = User(
                    phone_number=normalized_phone,
                    email=f"{phone_digits[-10:]}@phone.truckopti.in",  # Placeholder email
                    phone_verified=True
                )
                user.set_password(f"OTP_{phone_digits[-4:]}_{datetime.utcnow().timestamp()}")
                db.session.add(user)
                is_new_user = True
                logger.info(f"New user created via Telegram OTP: {normalized_phone}")
            else:
                user.phone_verified = True
        else:
            # Email OTP - find or create by email
            user = User.query.filter_by(email=email).first()
            
            if not user:
                # Create new user with email
                user = User(
                    email=email,
                    email_verified=True
                )
                user.set_password(f"OTP_EMAIL_{datetime.utcnow().timestamp()}")
                db.session.add(user)
                is_new_user = True
                logger.info(f"New user created via Email OTP: {email}")
            else:
                user.email_verified = True
        
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        # Generate token
        token = generate_token(user.id, user.email, user.role)
        
        logger.info(f"OTP login successful: {target}")
        
        return jsonify({
            'success': True,
            'message': 'OTP verified successfully',
            'data': {
                'user': user.as_dict(),
                'token': token,
                'is_new_user': is_new_user
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Verify OTP error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'OTP verification failed',
            'message': str(e)
        }), 500


@auth_bp.route('/resend-otp', methods=['POST'])
@rate_limit(max_requests=3, window_seconds=300)  # 3 resends per 5 minutes
@validate_request({
    'phone': {'type': 'string', 'required': False},
    'email': {'type': 'email', 'required': False},
    'channel': {'type': 'string', 'required': False}
})
def resend_otp():
    """
    Resend OTP via Telegram, Email, or Console
    
    Request body:
    {
        "phone": "+919876543210",  // For Telegram
        "email": "user@example.com",  // For Email
        "channel": "telegram" | "email" (optional)
    }
    """
    try:
        data = request.validated_data
        phone = data.get('phone')
        email = data.get('email')
        channel_str = data.get('channel', '').lower()
        
        # Determine target and channel
        if email and (channel_str == 'email' or not channel_str):
            target = email
            channel = OTPChannel.EMAIL
        elif phone:
            target = phone
            channel = OTPChannel.TELEGRAM if channel_str != 'console' else OTPChannel.CONSOLE
        else:
            return jsonify({
                'success': False,
                'error': 'Contact required',
                'message': 'Please provide either phone number or email address'
            }), 400
        
        success, message, dev_otp = otp_service.resend_otp(target, channel)
        
        if success:
            response_data = {
                'reference_id': f"OTP-{target[-4:]}-{int(datetime.utcnow().timestamp())}",
                'expires_in_seconds': 300,
                'channel': channel.value
            }
            
            if dev_otp and os.environ.get('FLASK_DEBUG', 'false').lower() == 'true':
                response_data['dev_otp'] = dev_otp
                
            return jsonify({
                'success': True,
                'message': message,
                'data': response_data
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Resend failed',
                'message': message
            }), 429
            
    except Exception as e:
        logger.error(f"Resend OTP error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to resend OTP',
            'message': str(e)
        }), 500


@auth_bp.route('/otp-channels', methods=['GET'])
def get_otp_channels():
    """
    Get available OTP channels and their status
    
    Response:
    {
        "success": true,
        "data": {
            "available_channels": ["telegram", "email", "console"],
            "recommended": "telegram",
            "info": {
                "telegram": "FREE - Instant delivery via Telegram Bot",
                "email": "FREE - Delivery via Gmail/SMTP",
                "console": "DEV ONLY - Prints OTP to server console"
            }
        }
    }
    """
    is_dev = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    
    channels = ['telegram', 'email']
    if is_dev:
        channels.append('console')
    
    return jsonify({
        'success': True,
        'data': {
            'available_channels': channels,
            'recommended': 'telegram',
            'info': {
                'telegram': 'FREE - Instant delivery via Telegram Bot. Message @TruckOptiBot first!',
                'email': 'FREE - Delivery via Gmail/SMTP (may take a few seconds)',
                'console': 'DEV ONLY - Prints OTP to server console' if is_dev else None
            },
            'telegram_bot': '@TruckOptiBot'
        }
    }), 200


# =============================================================================
# GOOGLE OAUTH ENDPOINTS
# =============================================================================

from app.services.google_oauth_service import google_oauth_service
import secrets


@auth_bp.route('/google', methods=['GET'])
def google_auth():
    """
    Initiate Google OAuth flow
    
    Query params:
        include_location: true/false (optional) - Request location sharing permission
    
    Returns redirect URL to Google consent screen
    """
    try:
        include_location = request.args.get('include_location', 'false').lower() == 'true'
        
        # Generate state for CSRF protection
        state = secrets.token_urlsafe(32)
        
        # Store state in session (or Redis in production)
        # For simplicity, we'll include it in the response
        
        auth_url = google_oauth_service.get_authorization_url(
            state=state,
            include_location=include_location
        )
        
        return jsonify({
            'success': True,
            'data': {
                'auth_url': auth_url,
                'state': state  # Client should store and verify this
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Google auth error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to initiate Google auth',
            'message': str(e)
        }), 500


@auth_bp.route('/google/callback', methods=['GET', 'POST'])
def google_callback():
    """
    Handle Google OAuth callback
    
    Query params (GET) or body (POST):
        code: Authorization code from Google
        state: State for CSRF verification
    """
    try:
        # Get code from query params or body
        if request.method == 'POST':
            data = request.get_json() or {}
            code = data.get('code')
            state = data.get('state')
        else:
            code = request.args.get('code')
            state = request.args.get('state')
        
        if not code:
            return jsonify({
                'success': False,
                'error': 'Authorization code required'
            }), 400
        
        # Exchange code for tokens
        success, token_data = google_oauth_service.exchange_code(code)
        
        if not success:
            return jsonify({
                'success': False,
                'error': 'Token exchange failed',
                'message': token_data.get('error', 'Unknown error')
            }), 400
        
        # Get user profile
        access_token = token_data.get('access_token')
        success, profile = google_oauth_service.get_user_profile(access_token)
        
        if not success:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch profile',
                'message': profile.get('error', 'Unknown error')
            }), 400
        
        # Find or create user
        google_id = profile.get('google_id')
        email = profile.get('email')
        
        user = User.query.filter(
            (User.google_id == google_id) | (User.email == email)
        ).first()
        
        is_new_user = False
        
        if not user:
            # Create new user
            user = User(
                email=email,
                name=profile.get('name'),
                google_id=google_id,
                profile_picture=profile.get('picture'),
                email_verified=profile.get('email_verified', False)
            )
            # Set a random password (user won't need it with Google login)
            user.set_password(secrets.token_urlsafe(32))
            db.session.add(user)
            is_new_user = True
            logger.info(f"New user created via Google: {email}")
        else:
            # Update existing user with Google info
            if not user.google_id:
                user.google_id = google_id
            user.profile_picture = profile.get('picture')
            if profile.get('email_verified'):
                user.email_verified = True
        
        # Store tokens (in production, encrypt these)
        user.google_access_token = access_token
        user.google_refresh_token = token_data.get('refresh_token')
        user.google_token_expires = token_data.get('expires_at')
        user.last_login = datetime.utcnow()
        
        db.session.commit()
        
        # Generate our JWT token
        token = generate_token(user.id, user.email, user.role)
        
        logger.info(f"Google login successful: {email}")
        
        return jsonify({
            'success': True,
            'message': 'Google authentication successful',
            'data': {
                'user': user.as_dict(),
                'token': token,
                'is_new_user': is_new_user
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Google callback error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Google authentication failed',
            'message': str(e)
        }), 500


@auth_bp.route('/google/link', methods=['POST'])
@require_auth
def link_google_account():
    """
    Link Google account to existing user
    
    Request body:
    {
        "code": "authorization_code_from_google"
    }
    """
    try:
        data = request.get_json() or {}
        code = data.get('code')
        
        if not code:
            return jsonify({
                'success': False,
                'error': 'Authorization code required'
            }), 400
        
        user_id = g.current_user['user_id']
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404
        
        # Exchange code for tokens
        success, token_data = google_oauth_service.exchange_code(code)
        
        if not success:
            return jsonify({
                'success': False,
                'error': 'Token exchange failed'
            }), 400
        
        # Get profile
        access_token = token_data.get('access_token')
        success, profile = google_oauth_service.get_user_profile(access_token)
        
        if not success:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch profile'
            }), 400
        
        google_id = profile.get('google_id')
        
        # Check if Google account is already linked to another user
        existing = User.query.filter_by(google_id=google_id).first()
        if existing and existing.id != user.id:
            return jsonify({
                'success': False,
                'error': 'Google account already linked to another user'
            }), 409
        
        # Link account
        user.google_id = google_id
        user.google_access_token = access_token
        user.google_refresh_token = token_data.get('refresh_token')
        user.profile_picture = profile.get('picture')
        
        db.session.commit()
        
        logger.info(f"Google account linked for user: {user.email}")
        
        return jsonify({
            'success': True,
            'message': 'Google account linked successfully',
            'data': {
                'google_email': profile.get('email'),
                'google_name': profile.get('name')
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Link Google error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to link Google account',
            'message': str(e)
        }), 500


@auth_bp.route('/google/unlink', methods=['POST'])
@require_auth
def unlink_google_account():
    """
    Unlink Google account from user
    """
    try:
        user_id = g.current_user['user_id']
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404
        
        if not user.google_id:
            return jsonify({
                'success': False,
                'error': 'No Google account linked'
            }), 400
        
        # Revoke token if exists
        if user.google_access_token:
            google_oauth_service.revoke_token(user.google_access_token)
        
        # Clear Google data
        user.google_id = None
        user.google_access_token = None
        user.google_refresh_token = None
        user.google_token_expires = None
        
        db.session.commit()
        
        logger.info(f"Google account unlinked for user: {user.email}")
        
        return jsonify({
            'success': True,
            'message': 'Google account unlinked successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Unlink Google error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to unlink Google account',
            'message': str(e)
        }), 500


__all__ = ['auth_bp', 'User']
