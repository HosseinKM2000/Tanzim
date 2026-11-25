from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.engine import make_url


ALLOWED_ENVIRONMENTS = {"qa", "test", "development"}
LOCAL_HOSTS = {None, "", "localhost", "127.0.0.1", "::1"}


class QaSafetyError(RuntimeError):
    pass


@dataclass(frozen=True)
class QaTarget:
    environment: str
    database_name: str
    media_root: Path
    reference_media_root: Path


def validate_target(
    *,
    environment: str,
    database_url: str,
    media_root: str,
    reference_media_root: str,
    allowlist: set[str],
    confirmation: str,
) -> QaTarget:
    """Fail closed unless every signal independently identifies an isolated QA target."""
    normalized_environment = environment.strip().lower()
    if normalized_environment not in ALLOWED_ENVIRONMENTS:
        raise QaSafetyError("QA_ENVIRONMENT_REQUIRED")

    url = make_url(database_url)
    database_name = (url.database or "").strip()
    if not database_name or not any(marker in database_name.lower() for marker in ("qa", "test")):
        raise QaSafetyError("QA_DATABASE_NAME_REQUIRED")
    if url.host not in LOCAL_HOSTS:
        raise QaSafetyError("QA_LOCAL_DATABASE_REQUIRED")
    if database_name not in allowlist:
        raise QaSafetyError("QA_DATABASE_NOT_ALLOWLISTED")
    if confirmation != f"qa:{database_name}":
        raise QaSafetyError("QA_TARGET_CONFIRMATION_REQUIRED")

    private = Path(media_root).expanduser().resolve()
    reference = Path(reference_media_root).expanduser().resolve()
    if not private.is_absolute() or not reference.is_absolute() or private == reference:
        raise QaSafetyError("QA_MEDIA_ROOTS_MUST_BE_DISTINCT")
    for root in (private, reference):
        if not any(marker in root.name.lower() for marker in ("qa", "test")):
            raise QaSafetyError("QA_MEDIA_ROOT_MARKER_REQUIRED")
    return QaTarget(normalized_environment, database_name, private, reference)
