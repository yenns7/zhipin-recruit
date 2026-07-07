"""Centralized logging configuration for backend services and HTTP access logs."""

from __future__ import annotations

import logging
import logging.config
import time

from flask import g, request


ACCESS_LOGGER_NAME = "hireinsight.access"
REQUEST_START_TIME_KEY = "_hireinsight_request_started_at"


def setup_logging(app) -> None:
    """Apply dictConfig once the Flask app config is available."""
    is_debug = app.config.get("FLASK_DEBUG", False) or app.config.get("TESTING", False)
    app_level = "DEBUG" if is_debug else "INFO"

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "[%(asctime)s] %(levelname)s %(name)s %(message)s",
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "level": "NOTSET",
                    "formatter": "default",
                    "stream": "ext://sys.stdout",
                }
            },
            "loggers": {
                "app": {
                    "level": app_level,
                    "handlers": ["console"],
                    "propagate": False,
                },
                ACCESS_LOGGER_NAME: {
                    "level": "INFO",
                    "handlers": ["console"],
                    "propagate": False,
                },
                "hireinsight": {
                    "level": app_level,
                    "handlers": ["console"],
                    "propagate": False,
                },
            },
            "root": {
                "level": "WARNING",
                "handlers": ["console"],
            },
        }
    )


def register_request_logging(app) -> None:
    """Emit a compact access log around every HTTP request."""
    access_logger = logging.getLogger(ACCESS_LOGGER_NAME)

    @app.before_request
    def _store_request_start_time():
        g._hireinsight_request_started_at = time.perf_counter()

    @app.after_request
    def _log_request(response):
        started_at = getattr(g, REQUEST_START_TIME_KEY, None)
        duration_ms = 0
        if started_at is not None:
            duration_ms = int((time.perf_counter() - started_at) * 1000)

        access_logger.info(
            "%s %s -> %s (%dms) ip=%s",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
            request.headers.get("X-Forwarded-For", request.remote_addr or "unknown"),
        )
        return response
