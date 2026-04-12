from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://dsn_user:changeme@localhost:5432/dsn"
    REDIS_URL: str = "redis://localhost:6379"

    JWT_SECRET: str = "change-this-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    MASTER_ENCRYPTION_KEY: str = "0" * 64  # 32 bytes hex

    MAX_FILE_SIZE_BYTES: int = 5 * 1024 * 1024 * 1024  # 5 GB
    CHUNK_SIZE_BYTES: int = 16 * 1024 * 1024  # 16 MB
    REPLICATION_FACTOR: int = 3
    NODE_ACTIVE_THRESHOLD_MIN: int = 5
    NODE_DEAD_THRESHOLD_HOURS: int = 24
    HEARTBEAT_INTERVAL_SEC: int = 30
    RE_REPLICATION_CHECK_MIN: int = 5

    # CORS: virgülle ayrılmış origin listesi (production'da frontend URL'i ekleyin)
    CORS_ORIGINS: str = "http://localhost:3000"


settings = Settings()
