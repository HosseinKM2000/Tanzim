"""Run the local-only Catalog release portion of the Gate 6 recovery rehearsal."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import mimetypes
import os
from pathlib import Path
import statistics
import subprocess
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4


class LocalResponse:
    def __init__(self, method: str, url: str, status: int, content: bytes, headers) -> None:
        self.method = method
        self.url = url
        self.status_code = status
        self.content = content
        self.headers = headers

    @property
    def is_success(self) -> bool:
        return 200 <= self.status_code < 300

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")

    def json(self):
        return json.loads(self.content)


class LocalClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def request(self, method: str, path: str, *, headers=None, json_body=None, params=None, data=None, files=None) -> LocalResponse:
        url = f"{self.base_url}{path}"
        if params:
            url = f"{url}?{urlencode(params)}"
        request_headers = dict(headers or {})
        body = None
        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        elif files:
            boundary = f"----tanzim-gate6-{uuid4().hex}"
            chunks: list[bytes] = []
            for name, value in (data or {}).items():
                chunks.extend([
                    f"--{boundary}\r\n".encode(),
                    f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                    str(value).encode(), b"\r\n",
                ])
            for name, (filename, handle, content_type) in files.items():
                chunks.extend([
                    f"--{boundary}\r\n".encode(),
                    f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode(),
                    f"Content-Type: {content_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'}\r\n\r\n".encode(),
                    handle.read(), b"\r\n",
                ])
            chunks.append(f"--{boundary}--\r\n".encode())
            body = b"".join(chunks)
            request_headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        elif data is not None:
            body = urlencode(data).encode("utf-8")
            request_headers["Content-Type"] = "application/x-www-form-urlencoded"
        request = Request(url, data=body, headers=request_headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                return LocalResponse(method, url, response.status, response.read(), response.headers)
        except HTTPError as error:
            return LocalResponse(method, url, error.code, error.read(), error.headers)

    def post(self, path: str, **kwargs) -> LocalResponse:
        if "json" in kwargs:
            kwargs["json_body"] = kwargs.pop("json")
        return self.request("POST", path, **kwargs)

    def patch(self, path: str, **kwargs) -> LocalResponse:
        if "json" in kwargs:
            kwargs["json_body"] = kwargs.pop("json")
        return self.request("PATCH", path, **kwargs)

    def get(self, path: str, **kwargs) -> LocalResponse:
        return self.request("GET", path, **kwargs)

    def close(self) -> None:
        return None


def require_ok(response: LocalResponse) -> LocalResponse:
    if not response.is_success:
        raise RuntimeError(f"{response.method} {response.url}: {response.status_code} {response.text}")
    return response


def client_and_headers(api: str) -> tuple[LocalClient, dict[str, str]]:
    password = os.getenv("GATE6_ADMIN_PASSWORD")
    if not password:
        raise RuntimeError("GATE6_ADMIN_PASSWORD is required")
    client = LocalClient(api)
    device = f"gate6-admin-{uuid4().hex}"
    login = require_ok(client.post("/auth/login", json={
        "username": "HosseinKM2000",
        "password": password,
        "device_fingerprint": device,
    })).json()
    return client, {
        "Authorization": f"Bearer {login['access_token']}",
        "X-Device-Fingerprint": device,
    }


def publish_r1(api: str, state_path: Path, image_path: Path) -> None:
    client, headers = client_and_headers(api)
    suffix = uuid4().hex[:10]
    industry = require_ok(client.post("/industries", headers=headers, json={
        "name": f"Gate 6 recovery {suffix}",
        "description": "Disposable release and restore rehearsal",
        "tools": {"catalog": True},
    })).json()
    product = require_ok(client.post("/catalog-products", headers=headers, json={
        "industry_id": industry["id"],
        "name": f"Gate 6 product R1 {suffix}",
        "description": "Release one synthetic product",
        "brand": "Gate6",
        "image_url": None,
        "is_packaged": False,
        "pack_size": None,
    })).json()
    family = require_ok(client.post("/catalog-reference/families", headers=headers, json={
        "industry_id": industry["id"],
        "slug": f"gate6-family-{suffix}",
        "name": "Gate 6 recovery family",
        "sort_order": 1,
    })).json()
    require_ok(client.post(
        f"/catalog-reference/families/{family['id']}/products/{product['id']}",
        headers=headers,
    ))
    with image_path.open("rb") as image:
        ingest = require_ok(client.post(
            "/catalog-reference/media/ingest",
            headers=headers,
            data={
                "product_id": str(product["id"]),
                "source_reference": "gate6:synthetic-repository-test-asset:r1",
                "rights_confirmed": "true",
            },
            files={"file": (image_path.name, image, "image/png")},
        )).json()
    release = require_ok(client.post("/catalog-reference/releases/publish", headers=headers, json={
        "request_id": str(uuid4()),
        "industry_id": industry["id"],
    })).json()
    state = {
        "industry_id": industry["id"],
        "product_id": product["id"],
        "family_id": family["id"],
        "family_slug": family["slug"],
        "release_1": release,
        "assets_1": ingest["assets"],
    }
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    print(json.dumps({"phase": "r1", "release_id": release["id"], "version": release["version"], "assets": len(ingest["assets"])}))
    client.close()


def publish_r2(api: str, state_path: Path, image_path: Path) -> None:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    client, headers = client_and_headers(api)
    require_ok(client.patch(f"/catalog-products/{state['product_id']}", headers=headers, json={
        "name": "Gate 6 product R2",
        "description": "Release two incremental update",
    }))
    with image_path.open("rb") as image:
        ingest = require_ok(client.post(
            "/catalog-reference/media/ingest",
            headers=headers,
            data={
                "product_id": str(state["product_id"]),
                "source_reference": "gate6:synthetic-repository-test-asset:r2",
                "rights_confirmed": "true",
            },
            files={"file": (image_path.name, image, "image/png")},
        )).json()
    release = require_ok(client.post("/catalog-reference/releases/publish", headers=headers, json={
        "request_id": str(uuid4()),
        "industry_id": state["industry_id"],
    })).json()
    state.update({"release_2": release, "assets_2": ingest["assets"]})
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    print(json.dumps({
        "phase": "r2",
        "release_id": release["id"],
        "version": release["version"],
        "previous_release_id": release["previous_release_id"],
        "assets": len(ingest["assets"]),
    }))
    client.close()


def verify(api: str, state_path: Path, expected: str) -> None:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    release = state[f"release_{expected}"]
    assets = state[f"assets_{expected}"]
    client, headers = client_and_headers(api)
    current = require_ok(client.get(
        "/catalog-reference/releases/current",
        headers=headers,
        params={"industry_id": state["industry_id"]},
    )).json()
    if current["id"] != release["id"]:
        raise RuntimeError(f"pointer mismatch: {current['id']} != {release['id']}")
    manifest = require_ok(client.get(
        f"/catalog-reference/releases/{release['id']}/manifest",
        headers=headers,
        params={"industry_id": state["industry_id"], "family_slug": state["family_slug"]},
    )).json()
    product = manifest["products"][0]
    if product["id"] != state["product_id"] or manifest["product_count"] != 1:
        raise RuntimeError("restored product relationship mismatch")
    observed = {}
    for asset in assets:
        response = require_ok(client.get(
            f"/catalog-reference-assets/{asset['id']}",
            headers=headers,
            params={"release_id": release["id"], "family_slug": state["family_slug"]},
        ))
        digest = hashlib.sha256(response.content).hexdigest()
        if digest != asset["content_sha256"]:
            raise RuntimeError(f"asset hash mismatch for {asset['id']}")
        observed[asset["variant_type"]] = digest
    if set(observed) != {"preview", "detail"}:
        raise RuntimeError("preview/detail relationship incomplete")
    print(json.dumps({
        "phase": f"verify-r{expected}",
        "release_id": current["id"],
        "version": current["version"],
        "manifest_hash": current["manifest_hash"],
        "manifest_content_hash": manifest["content_hash"],
        "product_id": product["id"],
        "asset_hashes": observed,
    }, sort_keys=True))
    client.close()


def percentile(values: list[float], percentage: float) -> float:
    ordered = sorted(values)
    position = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * percentage) - 1))
    return ordered[position]


def process_sample(process_id: int | None) -> dict[str, float | int] | None:
    if process_id is None or os.name != "nt":
        return None
    command = (
        f"Get-Process -Id {process_id} | "
        "Select-Object CPU,WorkingSet64,PeakWorkingSet64 | ConvertTo-Json -Compress"
    )
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-Command", command],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return json.loads(completed.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return None


def create_benchmark_session(api: str) -> tuple[LocalClient, dict[str, str]]:
    admin, admin_headers = client_and_headers(api)
    suffix = uuid4().hex[:10]
    industry = require_ok(admin.post("/industries", headers=admin_headers, json={
        "name": f"Gate 6 contention {suffix}",
        "description": "Disposable local contention probe",
        "tools": {},
    })).json()
    device = f"gate6-contention-{suffix}"
    phone = f"09{int(uuid4().hex[:12], 16) % 1_000_000_000:09d}"
    session = require_ok(admin.post("/auth/signup", json={
        "username": f"gate6-contention-{suffix}",
        "password": "StrongPass123!",
        "device_fingerprint": device,
        "phone": phone,
    })).json()
    started_at = datetime.now(timezone.utc)
    require_ok(admin.patch(
        f"/admin/users/{session['user']['id']}/subscription",
        headers=admin_headers,
        json={
            "plan": "personal",
            "subscription_started_at": started_at.isoformat(),
            "subscription_expires_at": (started_at + timedelta(days=1)).isoformat(),
        },
    ))
    headers = {
        "Authorization": f"Bearer {session['access_token']}",
        "X-Device-Fingerprint": device,
        "X-Client-Data-Schema": "3",
    }
    require_ok(admin.patch(
        "/auth/industry",
        headers=headers,
        json={"industry_id": industry["id"]},
    ))
    admin.close()
    return LocalClient(api), headers


def sync_operation(
    client: LocalClient,
    headers: dict[str, str],
    sequence: int,
) -> tuple[float, bool]:
    entity_id = int(time.time_ns() // 1_000) + sequence
    operation = {
        "operation_id": str(uuid4()),
        "entity": "product",
        "entity_id": entity_id,
        "operation": "CREATE",
        "payload": {
            "quantity": 1,
            "sale_price": 100,
            "custom_label": f"Gate 6 contention item {sequence}",
            "low_stock_threshold": 0,
            "low_stock_alert": False,
            "is_hidden": False,
            "catalog_product": {"id": 0, "name": f"Gate 6 contention item {sequence}"},
        },
    }
    started = time.perf_counter()
    response = client.post(
        "/sync/batch",
        headers=headers,
        data={"operations_json": json.dumps({"operations": [operation]})},
    )
    elapsed = (time.perf_counter() - started) * 1_000
    applied = response.is_success and response.json()["results"][0]["status"] == "applied"
    return elapsed, applied


def benchmark_phase(
    api: str,
    state: dict,
    sync_count: int,
    download_requests: int,
    download_workers: int,
) -> dict:
    sync_client, sync_headers = create_benchmark_session(api)
    admin_client, admin_headers = client_and_headers(api)
    release = state["release_2"]
    assets = state["assets_2"]
    start_gate = threading.Event()

    def download(worker: int) -> tuple[int, int, list[float]]:
        count = download_requests // download_workers
        if worker < download_requests % download_workers:
            count += 1
        total_bytes = 0
        errors = 0
        latencies: list[float] = []
        start_gate.wait()
        for index in range(count):
            asset = assets[(worker + index) % len(assets)]
            started = time.perf_counter()
            response = admin_client.get(
                f"/catalog-reference-assets/{asset['id']}",
                headers=admin_headers,
                params={
                    "release_id": release["id"],
                    "family_slug": state["family_slug"],
                },
            )
            latencies.append((time.perf_counter() - started) * 1_000)
            if response.is_success:
                total_bytes += len(response.content)
            else:
                errors += 1
        return total_bytes, errors, latencies

    started = time.perf_counter()
    futures = []
    if download_requests:
        pool = ThreadPoolExecutor(max_workers=download_workers)
        futures = [pool.submit(download, worker) for worker in range(download_workers)]
    start_gate.set()
    sync_results = [sync_operation(sync_client, sync_headers, index) for index in range(sync_count)]
    downloads = [future.result() for future in futures]
    if download_requests:
        pool.shutdown()
    elapsed = time.perf_counter() - started
    sync_client.close()
    admin_client.close()
    sync_latencies = [item[0] for item in sync_results]
    download_latencies = [latency for result in downloads for latency in result[2]]
    return {
        "duration_ms": round(elapsed * 1_000, 2),
        "sync_requests": sync_count,
        "sync_errors": sum(not item[1] for item in sync_results),
        "sync_p50_ms": round(statistics.median(sync_latencies), 2),
        "sync_p95_ms": round(percentile(sync_latencies, 0.95), 2),
        "download_requests": download_requests,
        "download_errors": sum(result[1] for result in downloads),
        "download_bytes": sum(result[0] for result in downloads),
        "download_p95_ms": round(percentile(download_latencies, 0.95), 2) if download_latencies else None,
    }


def benchmark(
    api: str,
    state_path: Path,
    sync_count: int,
    download_requests: int,
    download_workers: int,
    server_pid: int | None,
) -> None:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    before = process_sample(server_pid)
    baseline = benchmark_phase(api, state, sync_count, 0, download_workers)
    after_baseline = process_sample(server_pid)
    contention = benchmark_phase(api, state, sync_count, download_requests, download_workers)
    after_contention = process_sample(server_pid)
    ratio = contention["sync_p95_ms"] / baseline["sync_p95_ms"] if baseline["sync_p95_ms"] else None
    print(json.dumps({
        "scope": "local synthetic release with repeated authenticated asset reads",
        "representative_large_family": False,
        "baseline": baseline,
        "contention": contention,
        "sync_p95_ratio": round(ratio, 3) if ratio is not None else None,
        "server_process": {
            "pid": server_pid,
            "before": before,
            "after_baseline": after_baseline,
            "after_contention": after_contention,
        },
    }, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("r1", "r2", "verify", "benchmark"))
    parser.add_argument("--api", default="http://127.0.0.1:8002/api")
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--image", type=Path)
    parser.add_argument("--expected", choices=("1", "2"))
    parser.add_argument("--sync-count", type=int, default=30)
    parser.add_argument("--download-requests", type=int, default=500)
    parser.add_argument("--download-workers", type=int, default=4)
    parser.add_argument("--server-pid", type=int)
    args = parser.parse_args()
    parsed = urlparse(args.api)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("Gate 6 rehearsal refuses non-local APIs")
    if args.phase in {"r1", "r2"} and (args.image is None or not args.image.is_file()):
        raise RuntimeError("--image is required for publication phases")
    if args.phase == "r1":
        publish_r1(args.api, args.state, args.image)
    elif args.phase == "r2":
        publish_r2(args.api, args.state, args.image)
    elif args.phase == "verify":
        if args.expected is None:
            raise RuntimeError("--expected is required for verification")
        verify(args.api, args.state, args.expected)
    else:
        if args.sync_count < 1 or args.download_requests < 1 or args.download_workers < 1:
            raise RuntimeError("benchmark counts must be positive")
        benchmark(
            args.api,
            args.state,
            args.sync_count,
            args.download_requests,
            args.download_workers,
            args.server_pid,
        )


if __name__ == "__main__":
    main()
