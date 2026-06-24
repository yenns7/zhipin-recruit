#!/usr/bin/env python3
"""Build deployment ZIP, excluding dev artifacts."""
import zipfile, os, pathlib, datetime, sys

src = pathlib.Path(r"C:\Users\Administrator\Desktop\hl")
out = pathlib.Path(r"C:\Users\Administrator\Desktop") / (
    "zhipin-deploy-" + datetime.date.today().strftime("%Y%m%d") + ".zip"
)

SKIP_DIRS = {
    ".git", ".agents", ".claude", "node_modules", "__pycache__",
    "FrontEnd", "instance", "uploads", ".vite", ".pytest_cache", ".github",
}
SKIP_EXTS = {".db", ".pyc", ".log"}
SKIP_FILES = {
    "cloudflared.exe", "fill_xueji.py", "gen_xueji.py", "skills-lock.json",
    "dev.out.log", "dev.err.log", "dev.log", "server.log",
    "make_zip.py",
    ".env",           # 真实密钥，绝不打包
    "hireinsight.db", # 运行时数据库
}

count = 0
skipped = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            fp = pathlib.Path(root) / f
            # Skip .env (but keep .env.example)
            if f == ".env":
                skipped += 1
                continue
            if f in SKIP_FILES or fp.suffix.lower() in SKIP_EXTS:
                skipped += 1
                continue
            # Skip .docx files at root
            if fp.suffix.lower() == ".docx" and fp.parent == src:
                skipped += 1
                continue
            arc = fp.relative_to(src.parent)
            zf.write(fp, arc)
            count += 1

size_mb = round(out.stat().st_size / 1024 / 1024, 1)
print(f"ZIP: {out}")
print(f"Files included: {count} | Skipped: {skipped} | Size: {size_mb} MB")
