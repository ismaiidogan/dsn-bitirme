import os
import binascii

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import zstandard as zstd

from app.config import settings


def _master_key() -> bytes:
    return binascii.unhexlify(settings.MASTER_ENCRYPTION_KEY)


def generate_aes_key() -> bytes:
    """Generate a random 256-bit AES key."""
    return os.urandom(32)


def encrypt_aes_key(raw_key: bytes) -> bytes:
    """Encrypt an AES key with the master key (AES-GCM)."""
    master = _master_key()
    aesgcm = AESGCM(master)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, raw_key, None)
    return nonce + ciphertext  # 12 + 32 + 16 = 60 bytes


def decrypt_aes_key(encrypted: bytes) -> bytes:
    """Decrypt an AES key using the master key."""
    master = _master_key()
    aesgcm = AESGCM(master)
    nonce = encrypted[:12]
    ciphertext = encrypted[12:]
    return aesgcm.decrypt(nonce, ciphertext, None)


def generate_iv() -> bytes:
    """Generate a random 12-byte IV for AES-GCM."""
    return os.urandom(12)


def iv_to_hex(iv: bytes) -> str:
    return iv.hex()


def hex_to_iv(hex_str: str) -> bytes:
    return bytes.fromhex(hex_str)


def encrypt_chunk(plaintext: bytes, key: bytes, iv: bytes) -> bytes:
    """Encrypt chunk data with AES-256-GCM. Returns ciphertext+tag."""
    aesgcm = AESGCM(key)
    return aesgcm.encrypt(iv, plaintext, None)


def decrypt_chunk(ciphertext: bytes, key: bytes, iv: bytes) -> bytes:
    """Decrypt a chunk. Raises InvalidTag on integrity failure."""
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ciphertext, None)


def compress_chunk(data: bytes) -> bytes:
    """Compress chunk payload with zstd (level 3)."""
    cctx = zstd.ZstdCompressor(level=3)
    return cctx.compress(data)


def decompress_chunk(data: bytes) -> bytes:
    """Decompress a zstd-compressed chunk payload."""
    dctx = zstd.ZstdDecompressor()
    return dctx.decompress(data)
