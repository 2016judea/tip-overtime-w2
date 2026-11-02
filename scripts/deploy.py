#!/usr/bin/env python3
"""Deploy site/ to Vercel production over the REST API (project: tip-overtime-w2).

Ported from block-brief/scripts/deploy.py. First copies the engine and the TTOC table from api/ to
public/js/ (the browser runs the same file the functions and tests run; the copies are gitignored and
never hand-edited). Static files upload under public/, api/ and vercel.json at the root. Polls
readyState and exits non-zero on anything but READY. Needs VERCEL_TOKEN (bricks/.env).
"""
import hashlib, json, os, shutil, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "site"
TEAM = "team_XnhPzBEcaSfEmZFo9M2isLFY"
PROJECT = "tip-overtime-w2"


def request(url, token, data=None, headers=None, method=None):
    head = {"Authorization": f"Bearer {token}"}
    head.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=head, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def collect():
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path.name in (".env", ".DS_Store"):
            continue
        rel = path.relative_to(ROOT)
        if any(p in (".vercel", "node_modules") for p in rel.parts):
            continue
        if rel.parts[0] in ("api", "public") or str(rel) == "vercel.json":
            yield rel, path


def main():
    token = os.environ.get("VERCEL_TOKEN") or sys.exit("VERCEL_TOKEN is not set.")
    shutil.copyfile(ROOT / "api" / "_engine.js", ROOT / "public" / "js" / "engine.js")
    shutil.copyfile(ROOT / "api" / "_ttoc.js", ROOT / "public" / "js" / "ttoc.js")
    assert (ROOT / "public" / "sample" / "input.json").exists(), "run scripts/make_sample.js first"
    files, total = [], 0
    for rel, path in collect():
        body = path.read_bytes()
        sha = hashlib.sha1(body).hexdigest()
        code, out = request("https://api.vercel.com/v2/files", token, data=body,
                            headers={"Content-Type": "application/octet-stream", "x-vercel-digest": sha, "x-vercel-team-id": TEAM})
        if code >= 400:
            sys.exit(f"upload {rel} failed: {code} {out}")
        files.append({"file": str(rel), "sha": sha, "size": len(body)})
        total += len(body)
    print(f"  {len(files)} files, {total:,} bytes")
    payload = json.dumps({"name": PROJECT, "project": PROJECT, "target": "production", "files": files,
                          "projectSettings": {"framework": None, "outputDirectory": "public", "buildCommand": "echo build"}}).encode()
    code, out = request(f"https://api.vercel.com/v13/deployments?teamId={TEAM}&skipAutoDetectionConfirmation=1", token,
                        data=payload, headers={"Content-Type": "application/json"})
    if code >= 400 or out.get("error"):
        sys.exit(f"create failed: {code} {json.dumps(out.get('error'))}")
    url = out["url"]
    print(f"  deploying https://{url}")
    for _ in range(100):
        time.sleep(3)
        _, d = request(f"https://api.vercel.com/v13/deployments/{url}?teamId={TEAM}", token)
        state = d.get("readyState")
        if state in ("READY", "ERROR", "BLOCKED", "CANCELED"):
            print(f"  {state} {d.get('errorMessage') or ''}")
            sys.exit(0 if state == "READY" else 1)
    sys.exit("timed out waiting for the deployment to settle")


if __name__ == "__main__":
    main()
