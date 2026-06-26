#!/usr/bin/env python
"""Prepare local demo data for product walkthroughs.

Run from the repository root:
  .venv312/bin/python backend/scripts/prepare_demo_readiness.py
"""

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from app.services.demo_readiness_service import prepare_demo_readiness


def main():
    app = create_app()
    with app.app_context():
        result = prepare_demo_readiness()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
