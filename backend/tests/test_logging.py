"""Verify centralized logging config and HTTP access logging."""

import logging

from backend.app import create_app
from backend.app.config import TestingConfig
from backend.app.logging_config import ACCESS_LOGGER_NAME


def test_logging_dictconfig_applied():
    app = create_app(TestingConfig)

    assert logging.getLogger("hireinsight").level == logging.DEBUG
    assert logging.getLogger("app").level == logging.DEBUG
    assert logging.getLogger("hireinsight").handlers
    assert logging.getLogger("app").handlers

    with app.app_context():
        assert app.logger.name == "backend.app"
        assert app.logger.getEffectiveLevel() == logging.DEBUG


def test_http_request_access_log_emitted():
    app = create_app(TestingConfig)
    client = app.test_client()

    records = []
    handler = logging.Handler()
    handler.emit = records.append

    access_logger = logging.getLogger(ACCESS_LOGGER_NAME)
    access_logger.addHandler(handler)
    try:
        response = client.get("/health", environ_base={"REMOTE_ADDR": "203.0.113.10"})
    finally:
        access_logger.removeHandler(handler)

    assert response.status_code == 200
    assert records, "请求后应至少产生一条访问日志"

    messages = [record.getMessage() for record in records]
    assert any("GET /health -> 200" in message for message in messages)
    assert any("203.0.113.10" in message for message in messages)
