#!/usr/bin/env python3
"""Tell IndexNow (Bing, and ChatGPT search, Copilot and DuckDuckGo through it) every URL in the sitemap.
Run after a deploy that changes a page. The key file is site/public/<key>.txt. curl does the HTTP
(python urllib fails TLS on this machine)."""
import json, re, subprocess
from pathlib import Path

PUB = Path(__file__).resolve().parent.parent / "site" / "public"
HOST = "tip-overtime-w2.vercel.app"
key_file = next(p for p in PUB.glob("*.txt") if re.fullmatch(r"[0-9a-f]{32}\.txt", p.name))
key = key_file.read_text().strip()
urls = re.findall(r"<loc>([^<]+)</loc>", (PUB / "sitemap.xml").read_text()) + [f"https://{HOST}/llms.txt", f"https://{HOST}/llms-full.txt"]
body = json.dumps({"host": HOST, "key": key, "keyLocation": f"https://{HOST}/{key_file.name}", "urlList": urls})
out = subprocess.run(["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST", "https://api.indexnow.org/indexnow",
                      "-H", "Content-Type: application/json; charset=utf-8", "-d", body], capture_output=True, text=True)
print(f"IndexNow {out.stdout} for {len(urls)} URLs")
