from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.models import User, RefreshToken
from app.auth.utils import hash_password, verify_password, create_access_token, create_refresh_token, hash_token, decode_token
from app.config import settings


async def create_user(db: AsyncSession, email: str, password: str) -> User:
    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


async def create_refresh_token_record(db: AsyncSession, user_id: str) -> str:
    raw_token = create_refresh_token(user_id)
    token_hash = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    record = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(record)
    await db.commit()
    return raw_token


async def refresh_access_token(db: AsyncSession, raw_refresh_token: str) -> str | None:
    payload = decode_token(raw_refresh_token)
    if payload is None or payload.get("type") != "refresh":
        return None

    token_hash = hash_token(raw_refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        return None

    return create_access_token(str(record.user_id))


async def revoke_refresh_token(db: AsyncSession, raw_refresh_token: str) -> bool:
    token_hash = hash_token(raw_refresh_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    record = result.scalar_one_or_none()
    if record is None:
        return False
    await db.delete(record)
    await db.commit()
    return True
