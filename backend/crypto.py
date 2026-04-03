"""Application-level encryption for sensitive data at rest (AES-128-CBC + HMAC via Fernet)."""

import os

from cryptography.fernet import Fernet, InvalidToken


def _fernet() -> Fernet:
    key = os.environ.get("ENCRYPTION_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY environment variable is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt(plaintext: str) -> str:
    """Encrypt a UTF-8 string and return an opaque token string."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a token produced by encrypt(). Raises InvalidToken if tampered."""
    return _fernet().decrypt(token.encode()).decode()
