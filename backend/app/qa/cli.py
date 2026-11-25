from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from ..config import settings
from ..database import SessionLocal
from ..services.canonical_taxonomy_seed import reset_reference_taxonomy_for_qa
from .auditor import audit
from .safety import validate_target
from .seeder import current_counts, seed_profile


PROFILES = ("smoke", "comprehensive", "automotive", "five_sector", "stress")
MIN_PASSWORD_LENGTH = 16


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Fail-closed Tanzim Gate 7 QA data tooling")
    value.add_argument("command", choices=("seed", "audit", "counts", "reset-reference"))
    value.add_argument("--profile", choices=PROFILES, default="smoke")
    value.add_argument("--stress-size", type=int)
    value.add_argument("--passwords-file", help="JSON map of QA store key -> password (never logged)")
    value.add_argument("--dry-run", action="store_true")
    value.add_argument("--confirm", required=True)
    return value


def _passwords(path: str | None) -> dict[str, str]:
    """Load per-store QA passwords without ever echoing their values."""
    candidate = path or os.getenv("QA_SEED_PASSWORDS_FILE", "")
    if not candidate:
        return {}
    source = Path(candidate)
    if not source.is_file():
        raise RuntimeError("QA_SEED_PASSWORDS_FILE_MISSING")
    try:
        raw = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise RuntimeError("QA_SEED_PASSWORDS_FILE_INVALID") from error
    if not isinstance(raw, dict):
        raise RuntimeError("QA_SEED_PASSWORDS_FILE_INVALID")
    values: dict[str, str] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not key.strip() or not isinstance(value, str):
            raise RuntimeError("QA_SEED_PASSWORDS_FILE_INVALID")
        if len(value) < MIN_PASSWORD_LENGTH:
            raise RuntimeError(f"QA_SEED_PASSWORD_TOO_SHORT:{key.strip()}")
        values[key.strip()] = value
    if len(set(values.values())) != len(values):
        raise RuntimeError("QA_SEED_PASSWORDS_MUST_BE_UNIQUE")
    return values


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    target = validate_target(
        environment=settings.ENVIRONMENT,
        database_url=settings.DATABASE_URL,
        media_root=str(settings.MEDIA_STORAGE_DIR),
        reference_media_root=str(settings.REFERENCE_ASSET_STORAGE_DIR),
        allowlist={item.strip() for item in os.getenv("QA_DATABASE_ALLOWLIST", "").split(",") if item.strip()},
        confirmation=args.confirm,
    )
    target.media_root.mkdir(parents=True, exist_ok=True)
    target.reference_media_root.mkdir(parents=True, exist_ok=True)
    with SessionLocal() as db:
        if args.command == "seed":
            password = os.getenv("QA_SEED_PASSWORD", "")
            passwords = _passwords(args.passwords_file)
            if not args.dry_run and len(password) < MIN_PASSWORD_LENGTH and not passwords:
                raise RuntimeError("QA_SEED_PASSWORD_REQUIRED")
            result = seed_profile(
                db,
                args.profile,
                password=password,
                passwords=passwords or None,
                dry_run=args.dry_run,
                stress_size=args.stress_size,
            ).to_dict()
        elif args.command == "audit":
            result = audit(db)
        elif args.command == "reset-reference":
            result = reset_reference_taxonomy_for_qa(db)
            db.commit()
        else:
            result = current_counts(db)
    print(json.dumps({"target": target.database_name, "result": result}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
