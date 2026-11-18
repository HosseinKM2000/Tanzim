from __future__ import annotations

import argparse
import json
import os

from ..config import settings
from ..database import SessionLocal
from .auditor import audit
from .safety import validate_target
from .seeder import current_counts, seed_profile


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Fail-closed Tanzim Gate 7 QA data tooling")
    value.add_argument("command", choices=("seed", "audit", "counts"))
    value.add_argument("--profile", choices=("smoke", "comprehensive", "stress"), default="smoke")
    value.add_argument("--stress-size", type=int)
    value.add_argument("--dry-run", action="store_true")
    value.add_argument("--confirm", required=True)
    return value


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
            if not args.dry_run and len(password) < 16:
                raise RuntimeError("QA_SEED_PASSWORD_REQUIRED")
            result = seed_profile(db, args.profile, password=password, dry_run=args.dry_run, stress_size=args.stress_size).to_dict()
        elif args.command == "audit":
            result = audit(db)
        else:
            result = current_counts(db)
    print(json.dumps({"target": target.database_name, "result": result}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
