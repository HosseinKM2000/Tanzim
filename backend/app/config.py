import os
import tempfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent


def _load_dotenv() -> None:
    """Minimal .env loader so we don't add a dependency just for this."""
    for env_path in (PROJECT_DIR / ".env", BASE_DIR / ".env"):
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()


class Settings:
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").strip().lower()
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080")  # 7 days
    )
    DATABASE_URL: str = os.getenv("DATABASE_URL", "").strip()
    CORS_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://localhost:5174,http://127.0.0.1:5174",
        ).split(",")
        if origin.strip()
    ]
    SYSTEM_ADMIN_PASSWORD: str | None = os.getenv("SYSTEM_ADMIN_PASSWORD")
    APP_BUILD_ID: str = os.getenv("APP_BUILD_ID", "development").strip() or "development"
    DATABASE_SCHEMA_VERSION: str = "20261123_0020"
    APP_ORIGIN: str = os.getenv("APP_ORIGIN", "https://app.tanzimapp.ir").strip().rstrip("/")
    DONGIPAY_BASE_URL: str = os.getenv(
        "DONGIPAY_BASE_URL", "https://api.chat.dongigpt.ir/api/v1/dongipay"
    ).strip().rstrip("/")
    DONGIPAY_TOKEN: str = os.getenv("DONGIPAY_TOKEN", "").strip()
    TELEWHAT_RELAY_URL: str = os.getenv(
        "TELEWHAT_RELAY_URL", "http://127.0.0.1:8100/api/send"
    ).strip()
    TELEWHAT_TG_TARGET: str = os.getenv("TELEWHAT_TG_TARGET", "09192472218").strip()
    TELEWHAT_ENABLED: bool = os.getenv("TELEWHAT_ENABLED", "1").strip().lower() not in {"0", "false", "no"}
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    # Product media must survive application/database replacement. Production
    # deployments provide an absolute durable mount; tests/development use an
    # operating-system runtime directory rather than the source tree.
    MEDIA_STORAGE_DIR: Path = Path(
        os.getenv("MEDIA_STORAGE_DIR", str(Path(tempfile.gettempdir()) / "tanzim-media"))
    ).expanduser().resolve()


settings = Settings()
if not settings.DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required; configure the PostgreSQL connection explicitly"
    )
if settings.DATABASE_URL.startswith("sqlite") and settings.ENVIRONMENT != "test":
    raise RuntimeError("SQLite is supported only when ENVIRONMENT=test")
if settings.ENVIRONMENT in {"production", "prod"} and settings.SECRET_KEY == "dev-secret-change-me":
    raise RuntimeError("SECRET_KEY must be configured before production startup")
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
if settings.ENVIRONMENT in {"production", "prod"} and not os.getenv("MEDIA_STORAGE_DIR"):
    raise RuntimeError("MEDIA_STORAGE_DIR is required in production")
settings.MEDIA_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
