import hashlib
import os
import re
import shutil
import uuid
from pathlib import Path, PurePosixPath

from .config import settings


SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9._-]+$")


class ReferenceAssetStorage:
    """Traversal-safe content/release storage on one durable filesystem."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or settings.REFERENCE_ASSET_STORAGE_DIR).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        pure = PurePosixPath(key)
        if pure.is_absolute() or not pure.parts or any(
            part in {"", ".", ".."} or not SAFE_SEGMENT.fullmatch(part)
            for part in pure.parts
        ):
            raise ValueError("REFERENCE_ASSET_KEY_INVALID")
        candidate = self.root.joinpath(*pure.parts).resolve()
        if self.root not in candidate.parents:
            raise ValueError("REFERENCE_ASSET_KEY_INVALID")
        return candidate

    def put_blob_if_absent(self, key: str, content: bytes) -> None:
        if not key.startswith("blobs/"):
            raise ValueError("REFERENCE_ASSET_KEY_INVALID")
        destination = self._path(key)
        if destination.is_file():
            if destination.read_bytes() != content:
                raise ValueError("REFERENCE_ASSET_IMMUTABILITY_VIOLATION")
            return
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.pending")
        try:
            with temporary.open("xb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)

    def path_for(self, key: str) -> Path:
        path = self._path(key)
        if not path.is_file():
            raise FileNotFoundError(key)
        return path

    def verified_blob(self, key: str, expected_sha256: str, expected_size: int) -> Path:
        path = self.path_for(key)
        if path.stat().st_size != expected_size:
            raise ValueError("REFERENCE_ASSET_INTEGRITY_VIOLATION")
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected_sha256:
            raise ValueError("REFERENCE_ASSET_INTEGRITY_VIOLATION")
        return path

    def publish_release(self, release_id: str, files: dict[str, bytes]) -> str:
        try:
            normalized_id = str(uuid.UUID(release_id))
        except ValueError as error:
            raise ValueError("CATALOG_RELEASE_ID_INVALID") from error
        final_key = f"releases/{normalized_id}"
        final = self._path(final_key)
        if final.exists():
            for relative, expected in files.items():
                if self.path_for(f"{final_key}/{relative}").read_bytes() != expected:
                    raise ValueError("CATALOG_RELEASE_IMMUTABILITY_VIOLATION")
            return final_key

        staging = self._path(f"staging/{normalized_id}-{uuid.uuid4().hex}")
        try:
            for relative, content in files.items():
                destination = self._path(f"staging/{staging.name}/{relative}")
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open("xb") as handle:
                    handle.write(content)
                    handle.flush()
                    os.fsync(handle.fileno())
            final.parent.mkdir(parents=True, exist_ok=True)
            os.replace(staging, final)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
        return final_key


reference_asset_storage = ReferenceAssetStorage()
