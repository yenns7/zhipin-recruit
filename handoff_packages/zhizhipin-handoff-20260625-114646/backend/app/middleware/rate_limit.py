from collections import defaultdict, deque
from functools import wraps
from time import monotonic

from flask import current_app, jsonify, request


_buckets = defaultdict(deque)


def _client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.remote_addr or "unknown"


def _limit_config(name):
    limits = current_app.config.get("RATE_LIMITS") or {}
    return limits.get(name) or {}


def rate_limit(name):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if not current_app.config.get("RATE_LIMIT_ENABLED", True):
                return fn(*args, **kwargs)

            config = _limit_config(name)
            limit = int(config.get("limit") or 0)
            window = int(config.get("window_seconds") or 60)
            if limit <= 0:
                return fn(*args, **kwargs)

            now = monotonic()
            bucket_key = f"{name}:{_client_ip()}"
            bucket = _buckets[bucket_key]
            while bucket and now - bucket[0] >= window:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(1, int(window - (now - bucket[0])))
                response = jsonify({"error": "请求过于频繁，请稍后再试"})
                response.status_code = 429
                response.headers["Retry-After"] = str(retry_after)
                return response

            bucket.append(now)
            return fn(*args, **kwargs)

        return wrapped

    return decorator
