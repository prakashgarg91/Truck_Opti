"""
OTP Service for TruckOpti
FREE OTP delivery via Telegram Bot, Email, or Console (dev mode)

FREE OPTIONS (No SMS costs!):
1. Telegram Bot - Completely FREE, instant delivery
2. Email OTP - FREE with Gmail SMTP or SendGrid free tier
3. Console/Dev Mode - For testing without any external service

Features:
- 6-digit OTP generation with 5-minute expiry
- Rate limiting (5 OTPs per phone per hour)
- Multiple delivery channels: Telegram, Email, Console
- Secure hashing and storage
- India phone number support
"""

import random
import string
import hashlib
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict
from dataclasses import dataclass, field
from enum import Enum
import logging
import os

logger = logging.getLogger(__name__)


class OTPChannel(Enum):
    """OTP delivery channels - all FREE!"""
    TELEGRAM = "telegram"      # FREE - via Telegram Bot
    EMAIL = "email"            # FREE - via Gmail SMTP
    CONSOLE = "console"        # FREE - for development
    WHATSAPP = "whatsapp"      # Placeholder for future


@dataclass
class OTPConfig:
    """Configuration for OTP service"""
    otp_length: int = 6
    otp_expiry_minutes: int = 5
    max_attempts: int = 3
    cooldown_seconds: int = 30
    max_otps_per_hour: int = 5
    
    # Telegram Bot Config (FREE!)
    telegram_bot_token: str = ""
    telegram_enabled: bool = True
    
    # Email Config (FREE with Gmail)
    email_enabled: bool = True
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""  # Use App Password for Gmail
    email_from: str = "TruckOpti <noreply@truckopti.in>"
    
    # Dev Mode - print to console
    dev_mode: bool = True


class TelegramOTPBot:
    """
    FREE Telegram Bot for OTP delivery
    
    Setup:
    1. Create bot with @BotFather on Telegram
    2. Get your bot token
    3. User must start chat with bot first to get chat_id
    """
    
    def __init__(self, bot_token: str):
        self.bot_token = bot_token
        self.api_base = f"https://api.telegram.org/bot{bot_token}"
        # Store phone -> chat_id mapping (in production use Redis/DB)
        self._chat_id_store: Dict[str, str] = {}
    
    def register_chat_id(self, phone: str, chat_id: str):
        """Register user's Telegram chat_id for their phone"""
        self._chat_id_store[phone] = chat_id
    
    def get_chat_id(self, phone: str) -> Optional[str]:
        """Get chat_id for phone number"""
        return self._chat_id_store.get(phone)
    
    def send_otp(self, chat_id: str, otp: str, phone: str) -> Tuple[bool, str]:
        """Send OTP via Telegram"""
        if not self.bot_token:
            return False, "Telegram bot not configured"
        
        message = f"""🔐 *TruckOpti OTP*

Your verification code is:

*`{otp}`*

Valid for 5 minutes.
Do not share this code with anyone.

📱 Phone: {phone[-4:].rjust(10, '*')}
🕐 Time: {datetime.now().strftime('%H:%M:%S')}

_TruckOpti - India's Smart Logistics_"""
        
        try:
            response = requests.post(
                f"{self.api_base}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": message,
                    "parse_mode": "Markdown"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Telegram OTP sent to chat_id: {chat_id}")
                return True, "OTP sent via Telegram"
            else:
                logger.error(f"Telegram API error: {response.text}")
                return False, "Failed to send Telegram message"
                
        except Exception as e:
            logger.error(f"Telegram send error: {e}")
            return False, str(e)
    
    def get_updates(self) -> list:
        """Get recent messages to bot (for registering users)"""
        try:
            response = requests.get(
                f"{self.api_base}/getUpdates",
                timeout=10
            )
            if response.status_code == 200:
                return response.json().get('result', [])
        except Exception as e:
            logger.error(f"Telegram getUpdates error: {e}")
        return []


class EmailOTPService:
    """
    FREE Email OTP delivery via Gmail SMTP
    
    Setup:
    1. Enable 2FA on Gmail
    2. Create App Password: https://myaccount.google.com/apppasswords
    3. Use that App Password as smtp_password
    """
    
    def __init__(self, config: OTPConfig):
        self.config = config
    
    def send_otp(self, email: str, otp: str, phone: str) -> Tuple[bool, str]:
        """Send OTP via email"""
        if not self.config.smtp_username or not self.config.smtp_password:
            return False, "Email not configured"
        
        subject = f"🔐 TruckOpti OTP: {otp}"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f5f7fa; padding: 20px; }}
                .container {{ max-width: 400px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }}
                .logo {{ text-align: center; margin-bottom: 24px; }}
                .logo h1 {{ color: #2563eb; margin: 0; font-size: 28px; }}
                .otp-box {{ background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 24px; border-radius: 12px; text-align: center; margin: 24px 0; }}
                .otp-code {{ font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0; }}
                .info {{ color: #64748b; font-size: 14px; text-align: center; }}
                .footer {{ margin-top: 24px; text-align: center; color: #94a3b8; font-size: 12px; }}
                .india {{ color: #f97316; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">
                    <h1>🚛 TruckOpti</h1>
                    <p style="color: #64748b; margin: 4px 0;">India's Smart Logistics</p>
                </div>
                
                <p style="color: #334155;">Your verification code is:</p>
                
                <div class="otp-box">
                    <p class="otp-code">{otp}</p>
                </div>
                
                <p class="info">
                    ⏰ Valid for <strong>5 minutes</strong><br>
                    📱 Phone: {phone[-4:].rjust(10, '*')}<br>
                    🕐 {datetime.now().strftime('%d %b %Y, %H:%M:%S')}
                </p>
                
                <p style="color: #ef4444; font-size: 13px; text-align: center;">
                    ⚠️ Never share this code with anyone
                </p>
                
                <div class="footer">
                    <p>Made with ❤️ in <span class="india">India</span></p>
                    <p>© 2025 TruckOpti</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
TruckOpti OTP Verification

Your verification code is: {otp}

Valid for 5 minutes.
Phone: {phone[-4:].rjust(10, '*')}
Time: {datetime.now().strftime('%d %b %Y, %H:%M:%S')}

Do not share this code with anyone.

- TruckOpti Team
        """
        
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = self.config.email_from
            msg['To'] = email
            
            msg.attach(MIMEText(text_body, 'plain'))
            msg.attach(MIMEText(html_body, 'html'))
            
            with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port) as server:
                server.starttls()
                server.login(self.config.smtp_username, self.config.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Email OTP sent to: {email}")
            return True, "OTP sent to email"
            
        except Exception as e:
            logger.error(f"Email send error: {e}")
            return False, str(e)


class OTPService:
    """
    FREE OTP Service - No SMS costs!
    
    Delivery Priority:
    1. Telegram (if user registered)
    2. Email (if provided)
    3. Console (dev mode)
    
    Usage:
        config = OTPConfig(
            telegram_bot_token="YOUR_BOT_TOKEN",
            smtp_username="your@gmail.com",
            smtp_password="your_app_password"
        )
        otp_service = OTPService(config)
        
        # Send OTP
        success, message = otp_service.send_otp("+919876543210")
        
        # Verify OTP
        valid, message = otp_service.verify_otp("+919876543210", "123456")
    """
    
    def __init__(self, config: Optional[OTPConfig] = None):
        self.config = config or OTPConfig()
        self._otp_store: Dict[str, dict] = {}  # Use Redis in production
        
        # Initialize delivery services
        self.telegram_bot = TelegramOTPBot(self.config.telegram_bot_token) if self.config.telegram_enabled else None
        self.email_service = EmailOTPService(self.config) if self.config.email_enabled else None
        
    def _generate_otp(self) -> str:
        """Generate a secure random OTP"""
        return ''.join(random.choices(string.digits, k=self.config.otp_length))
    
    def _hash_phone(self, phone: str) -> str:
        """Hash phone number for storage key"""
        return hashlib.sha256(phone.encode()).hexdigest()[:16]
    
    def _normalize_phone(self, phone: str) -> str:
        """Normalize phone number to E.164 format for India"""
        phone = ''.join(filter(str.isdigit, phone))
        
        if len(phone) == 10:
            return f"+91{phone}"
        elif len(phone) == 12 and phone.startswith("91"):
            return f"+{phone}"
        elif len(phone) == 13 and phone.startswith("+91"):
            return phone
        
        return f"+91{phone[-10:]}" if len(phone) >= 10 else phone
    
    def _check_rate_limit(self, phone_hash: str) -> Tuple[bool, str]:
        """Check if phone number has exceeded rate limit"""
        now = datetime.utcnow()
        
        if phone_hash not in self._otp_store:
            return True, ""
        
        record = self._otp_store[phone_hash]
        
        # Check cooldown
        if 'last_sent' in record:
            time_since_last = (now - record['last_sent']).total_seconds()
            if time_since_last < self.config.cooldown_seconds:
                remaining = int(self.config.cooldown_seconds - time_since_last)
                return False, f"Please wait {remaining} seconds before requesting another OTP"
        
        # Check hourly limit
        hourly_count = record.get('hourly_count', 0)
        hour_start = record.get('hour_start', now)
        
        if (now - hour_start).total_seconds() > 3600:
            # Reset hourly counter
            record['hourly_count'] = 0
            record['hour_start'] = now
        elif hourly_count >= self.config.max_otps_per_hour:
            return False, "Maximum OTP limit reached. Please try after an hour."
        
        return True, ""
    
    def register_telegram_user(self, phone: str, telegram_chat_id: str):
        """Register user's Telegram chat_id for OTP delivery"""
        if self.telegram_bot:
            normalized_phone = self._normalize_phone(phone)
            self.telegram_bot.register_chat_id(normalized_phone, telegram_chat_id)
            logger.info(f"Registered Telegram chat_id for phone: {normalized_phone[-4:]}")
    
    def send_otp(self, phone: str, 
                 email: Optional[str] = None,
                 channel: OTPChannel = OTPChannel.TELEGRAM) -> Tuple[bool, str, Optional[str]]:
        """
        Send OTP via available FREE channel
        
        Args:
            phone: Phone number (Indian format)
            email: Optional email for fallback
            channel: Preferred delivery channel
            
        Returns:
            Tuple of (success, message, otp_for_dev_mode)
        """
        normalized_phone = self._normalize_phone(phone)
        phone_hash = self._hash_phone(normalized_phone)
        
        # Check rate limit
        allowed, rate_message = self._check_rate_limit(phone_hash)
        if not allowed:
            return False, rate_message, None
        
        # Generate OTP
        otp = self._generate_otp()
        now = datetime.utcnow()
        
        # Try delivery channels in priority order
        delivered = False
        delivery_message = ""
        
        # 1. Try Telegram first (FREE!)
        if self.telegram_bot and channel in [OTPChannel.TELEGRAM, OTPChannel.WHATSAPP]:
            chat_id = self.telegram_bot.get_chat_id(normalized_phone)
            if chat_id:
                delivered, delivery_message = self.telegram_bot.send_otp(chat_id, otp, normalized_phone)
                if delivered:
                    delivery_message = "OTP sent via Telegram 📱"
        
        # 2. Try Email (FREE!)
        if not delivered and email and self.email_service:
            delivered, delivery_message = self.email_service.send_otp(email, otp, normalized_phone)
            if delivered:
                delivery_message = f"OTP sent to {email[:3]}***@*** 📧"
        
        # 3. Dev Mode - Console output (ALWAYS FREE!)
        if not delivered and self.config.dev_mode:
            print(f"\n{'='*50}")
            print(f"🔐 DEV MODE - OTP for {normalized_phone}")
            print(f"{'='*50}")
            print(f"   OTP CODE: {otp}")
            print(f"   Expires: {(now + timedelta(minutes=self.config.otp_expiry_minutes)).strftime('%H:%M:%S')}")
            print(f"{'='*50}\n")
            delivered = True
            delivery_message = f"OTP: {otp} (Dev Mode - check console)"
        
        if not delivered:
            return False, "No delivery channel available. Please configure Telegram or Email.", None
        
        # Store OTP
        if phone_hash not in self._otp_store:
            self._otp_store[phone_hash] = {
                'hour_start': now,
                'hourly_count': 0
            }
        
        self._otp_store[phone_hash].update({
            'otp': hashlib.sha256(otp.encode()).hexdigest(),
            'expires_at': now + timedelta(minutes=self.config.otp_expiry_minutes),
            'attempts': 0,
            'last_sent': now,
            'hourly_count': self._otp_store[phone_hash].get('hourly_count', 0) + 1
        })
        
        # Return OTP in dev mode for testing
        dev_otp = otp if self.config.dev_mode else None
        
        return True, delivery_message, dev_otp
    
    def verify_otp(self, phone: str, otp: str) -> Tuple[bool, str]:
        """
        Verify OTP for phone number
        
        Args:
            phone: Phone number
            otp: OTP code to verify
            
        Returns:
            Tuple of (valid, message)
        """
        normalized_phone = self._normalize_phone(phone)
        phone_hash = self._hash_phone(normalized_phone)
        
        if phone_hash not in self._otp_store:
            return False, "No OTP found. Please request a new one."
        
        record = self._otp_store[phone_hash]
        
        # Check expiry
        if datetime.utcnow() > record.get('expires_at', datetime.utcnow()):
            del self._otp_store[phone_hash]
            return False, "OTP has expired. Please request a new one."
        
        # Check attempts
        if record.get('attempts', 0) >= self.config.max_attempts:
            del self._otp_store[phone_hash]
            return False, "Maximum verification attempts exceeded. Please request a new OTP."
        
        # Verify OTP
        otp_hash = hashlib.sha256(otp.encode()).hexdigest()
        if otp_hash != record.get('otp'):
            record['attempts'] = record.get('attempts', 0) + 1
            remaining = self.config.max_attempts - record['attempts']
            return False, f"Invalid OTP. {remaining} attempts remaining."
        
        # Success - clear OTP
        del self._otp_store[phone_hash]
        return True, "OTP verified successfully!"
    
    def get_otp_status(self, phone: str) -> Dict:
        """Get OTP status for phone number"""
        normalized_phone = self._normalize_phone(phone)
        phone_hash = self._hash_phone(normalized_phone)
        
        if phone_hash not in self._otp_store:
            return {"exists": False}
        
        record = self._otp_store[phone_hash]
        now = datetime.utcnow()
        
        return {
            "exists": True,
            "expired": now > record.get('expires_at', now),
            "expires_in": max(0, (record.get('expires_at', now) - now).total_seconds()),
            "attempts_remaining": self.config.max_attempts - record.get('attempts', 0),
            "can_resend": (now - record.get('last_sent', now)).total_seconds() >= self.config.cooldown_seconds
        }


# Factory function for easy initialization
def create_otp_service() -> OTPService:
    """Create OTP service with configuration from environment"""
    config = OTPConfig(
        telegram_bot_token=os.environ.get('TELEGRAM_BOT_TOKEN', ''),
        telegram_enabled=os.environ.get('TELEGRAM_ENABLED', 'true').lower() == 'true',
        email_enabled=os.environ.get('EMAIL_ENABLED', 'true').lower() == 'true',
        smtp_host=os.environ.get('SMTP_HOST', 'smtp.gmail.com'),
        smtp_port=int(os.environ.get('SMTP_PORT', '587')),
        smtp_username=os.environ.get('SMTP_USERNAME', ''),
        smtp_password=os.environ.get('SMTP_PASSWORD', ''),
        dev_mode=os.environ.get('FLASK_ENV', 'development') == 'development'
    )
    return OTPService(config)
