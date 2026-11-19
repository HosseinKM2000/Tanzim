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


def _environment_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


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
    DATABASE_SCHEMA_VERSION: str = "20261119_0022"
    PASSWORD_RECOVERY_WINDOW_MINUTES: int = int(
        os.getenv("PASSWORD_RECOVERY_WINDOW_MINUTES", "15")
    )
    PASSWORD_RECOVERY_IDENTIFIER_LIMIT: int = int(
        os.getenv("PASSWORD_RECOVERY_IDENTIFIER_LIMIT", "5")
    )
    PASSWORD_RECOVERY_SOURCE_LIMIT: int = int(
        os.getenv("PASSWORD_RECOVERY_SOURCE_LIMIT", "20")
    )
    # Reference data may be deployed before customer adoption. Keep this off
    # until the Code 128 label-capacity and physical release gates are cleared.
    TAXONOMY_ADOPTION_ENABLED: bool = _environment_flag("TAXONOMY_ADOPTION_ENABLED")
    # Gate 1: preserve legacy Catalog fan-out unless a development environment
    # explicitly enables on-demand Store adoption.
    CATALOG_ON_DEMAND_ADOPTION_ENABLED: bool = _environment_flag(
        "CATALOG_ON_DEMAND_ADOPTION_ENABLED"
    )
    # Gate 2 is independently reversible. It only selects the cursor-backed
    # catalog reader; the legacy list endpoint remains available to clients.
    CATALOG_CURSOR_READ_V2_ENABLED: bool = _environment_flag(
        "CATALOG_CURSOR_READ_V2_ENABLED"
    )
    # Gate 3: reference assets remain invisible until the registry, publication
    # and access policy are deliberately enabled in an authorized environment.
    CATALOG_REFERENCE_MEDIA_V1_ENABLED: bool = _environment_flag(
        "CATALOG_REFERENCE_MEDIA_V1_ENABLED"
    )
    CATALOG_OFFLINE_FAMILIES_V1_ENABLED: bool = _environment_flag(
        "CATALOG_OFFLINE_FAMILIES_V1_ENABLED"
    )
    REFERENCE_ASSET_MAX_INPUT_BYTES: int = int(
        os.getenv("REFERENCE_ASSET_MAX_INPUT_BYTES", str(8 * 1024 * 1024))
    )
    REFERENCE_ASSET_MAX_PIXELS: int = int(
        os.getenv("REFERENCE_ASSET_MAX_PIXELS", "25000000")
    )
    REFERENCE_ASSET_PREVIEW_MAX_PX: int = int(
        os.getenv("REFERENCE_ASSET_PREVIEW_MAX_PX", "320")
    )
    REFERENCE_ASSET_DETAIL_MAX_PX: int = int(
        os.getenv("REFERENCE_ASSET_DETAIL_MAX_PX", "1024")
    )
    REFERENCE_ASSET_WEBP_QUALITY: int = int(
        os.getenv("REFERENCE_ASSET_WEBP_QUALITY", "88")
    )
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    # Product media must survive application/database replacement. Production
    # deployments provide an absolute durable mount; tests/development use an
    # operating-system runtime directory rather than the source tree.
    MEDIA_STORAGE_DIR: Path = Path(
        os.getenv("MEDIA_STORAGE_DIR", str(Path(tempfile.gettempdir()) / "tanzim-media"))
    ).expanduser().resolve()
    REFERENCE_ASSET_STORAGE_DIR: Path = Path(
        os.getenv(
            "REFERENCE_ASSET_STORAGE_DIR",
            str(Path(tempfile.gettempdir()) / "tanzim-reference-assets"),
        )
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
if (
    settings.ENVIRONMENT in {"production", "prod"}
    and settings.CATALOG_REFERENCE_MEDIA_V1_ENABLED
    and not os.getenv("REFERENCE_ASSET_STORAGE_DIR")
):
    raise RuntimeError("REFERENCE_ASSET_STORAGE_DIR is required when reference media is enabled in production")
settings.REFERENCE_ASSET_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
