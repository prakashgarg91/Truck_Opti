"""
Google OAuth Service for TruckOpti
Login with Google, profile sync, location sharing

Features:
- Google OAuth2 authentication flow
- Token storage and refresh
- Profile information sync
- Location sharing consent
"""

import os
import json
import requests
from typing import Optional, Dict, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlencode
import logging

logger = logging.getLogger(__name__)


@dataclass
class GoogleOAuthConfig:
    """Configuration for Google OAuth"""
    client_id: str = ""
    client_secret: str = ""
    redirect_uri: str = "http://localhost:5000/api/v1/auth/google/callback"
    scopes: tuple = (
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/user.birthday.read",
    )


class GoogleOAuthService:
    """
    Google OAuth2 Service for authentication and profile access
    
    Usage:
        google_service = GoogleOAuthService(config)
        
        # Get authorization URL
        auth_url = google_service.get_authorization_url(state="random_state")
        
        # Exchange code for tokens
        tokens = google_service.exchange_code(code)
        
        # Get user profile
        profile = google_service.get_user_profile(access_token)
    """
    
    AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"
    USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
    REVOKE_URL = "https://oauth2.googleapis.com/revoke"
    
    def __init__(self, config: Optional[GoogleOAuthConfig] = None):
        self.config = config or GoogleOAuthConfig()
    
    def get_authorization_url(self, state: str, 
                               additional_scopes: Optional[list] = None,
                               include_location: bool = False) -> str:
        """
        Generate Google OAuth authorization URL
        
        Args:
            state: Random state for CSRF protection
            additional_scopes: Additional OAuth scopes to request
            include_location: Include location sharing scope
            
        Returns:
            Authorization URL to redirect user to
        """
        scopes = list(self.config.scopes)
        
        if additional_scopes:
            scopes.extend(additional_scopes)
        
        if include_location:
            scopes.append("https://www.googleapis.com/auth/user.location.current.read")
        
        params = {
            "client_id": self.config.client_id,
            "redirect_uri": self.config.redirect_uri,
            "response_type": "code",
            "scope": " ".join(scopes),
            "state": state,
            "access_type": "offline",  # Get refresh token
            "prompt": "consent"  # Always show consent screen for refresh token
        }
        
        return f"{self.AUTHORIZATION_URL}?{urlencode(params)}"
    
    def exchange_code(self, code: str) -> Tuple[bool, Dict]:
        """
        Exchange authorization code for tokens
        
        Args:
            code: Authorization code from Google callback
            
        Returns:
            Tuple of (success, token_data or error)
        """
        try:
            payload = {
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.config.redirect_uri
            }
            
            response = requests.post(self.TOKEN_URL, data=payload, timeout=10)
            
            if response.status_code == 200:
                token_data = response.json()
                
                # Calculate expiry time
                expires_in = token_data.get("expires_in", 3600)
                token_data["expires_at"] = (
                    datetime.utcnow() + timedelta(seconds=expires_in)
                ).isoformat()
                
                logger.info("Google OAuth token exchange successful")
                return True, token_data
            
            error_data = response.json()
            logger.error(f"Token exchange failed: {error_data}")
            return False, {"error": error_data.get("error_description", "Token exchange failed")}
            
        except requests.RequestException as e:
            logger.error(f"Token exchange request failed: {str(e)}")
            return False, {"error": str(e)}
    
    def refresh_token(self, refresh_token: str) -> Tuple[bool, Dict]:
        """
        Refresh access token using refresh token
        
        Args:
            refresh_token: Google refresh token
            
        Returns:
            Tuple of (success, new_token_data or error)
        """
        try:
            payload = {
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            }
            
            response = requests.post(self.TOKEN_URL, data=payload, timeout=10)
            
            if response.status_code == 200:
                token_data = response.json()
                expires_in = token_data.get("expires_in", 3600)
                token_data["expires_at"] = (
                    datetime.utcnow() + timedelta(seconds=expires_in)
                ).isoformat()
                
                logger.info("Google OAuth token refresh successful")
                return True, token_data
            
            return False, {"error": "Token refresh failed"}
            
        except requests.RequestException as e:
            logger.error(f"Token refresh failed: {str(e)}")
            return False, {"error": str(e)}
    
    def get_user_profile(self, access_token: str) -> Tuple[bool, Dict]:
        """
        Get user profile information from Google
        
        Args:
            access_token: Valid Google access token
            
        Returns:
            Tuple of (success, profile_data or error)
        """
        try:
            headers = {"Authorization": f"Bearer {access_token}"}
            response = requests.get(self.USERINFO_URL, headers=headers, timeout=10)
            
            if response.status_code == 200:
                profile = response.json()
                
                # Normalize profile data
                normalized = {
                    "google_id": profile.get("sub"),
                    "email": profile.get("email"),
                    "email_verified": profile.get("email_verified", False),
                    "name": profile.get("name"),
                    "given_name": profile.get("given_name"),
                    "family_name": profile.get("family_name"),
                    "picture": profile.get("picture"),
                    "locale": profile.get("locale")
                }
                
                return True, normalized
            
            return False, {"error": "Failed to fetch profile"}
            
        except requests.RequestException as e:
            logger.error(f"Profile fetch failed: {str(e)}")
            return False, {"error": str(e)}
    
    def revoke_token(self, token: str) -> bool:
        """
        Revoke a Google OAuth token
        
        Args:
            token: Access token or refresh token to revoke
            
        Returns:
            True if revocation successful
        """
        try:
            response = requests.post(
                self.REVOKE_URL,
                params={"token": token},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10
            )
            
            return response.status_code == 200
            
        except requests.RequestException as e:
            logger.error(f"Token revocation failed: {str(e)}")
            return False
    
    def verify_id_token(self, id_token: str) -> Tuple[bool, Dict]:
        """
        Verify Google ID token (for mobile apps)
        
        Args:
            id_token: Google ID token from mobile SDK
            
        Returns:
            Tuple of (success, token_info or error)
        """
        try:
            response = requests.get(
                f"https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": id_token},
                timeout=10
            )
            
            if response.status_code == 200:
                token_info = response.json()
                
                # Verify audience
                if token_info.get("aud") != self.config.client_id:
                    return False, {"error": "Invalid token audience"}
                
                return True, token_info
            
            return False, {"error": "Invalid ID token"}
            
        except requests.RequestException as e:
            logger.error(f"ID token verification failed: {str(e)}")
            return False, {"error": str(e)}


# Global instance
google_oauth_service = GoogleOAuthService()


def init_google_oauth(app):
    """Initialize Google OAuth service with Flask app config"""
    config = GoogleOAuthConfig(
        client_id=app.config.get('GOOGLE_CLIENT_ID', ''),
        client_secret=app.config.get('GOOGLE_CLIENT_SECRET', ''),
        redirect_uri=app.config.get('GOOGLE_REDIRECT_URI', 
                                     'http://localhost:5000/api/v1/auth/google/callback')
    )
    global google_oauth_service
    google_oauth_service = GoogleOAuthService(config)
    return google_oauth_service
