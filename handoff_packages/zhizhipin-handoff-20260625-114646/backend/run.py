#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
智聘 · 招聘管理系统 后端启动入口
开发模式：python run.py
生产模式：gunicorn -w 4 -b 0.0.0.0:5000 "run:app"
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Windows 控制台默认 GBK 编码，无法输出 ✓ 和中文，强制 stdout/stderr 用 UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# 加载 .env（如果存在）
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    print(f"\n✓ 智聘 · 招聘管理系统 后端已启动 http://localhost:{port}")
    print(f"  LLM provider : {os.environ.get('LLM_PROVIDER', 'openai')}")
    print(f"  Model        : {os.environ.get('LLM_MODEL', 'gpt-4o-mini')}")
    print(f"  Database     : {os.environ.get('DATABASE_URL', 'sqlite:///hireinsight.db')}")
    print(f"  Debug        : {debug}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
