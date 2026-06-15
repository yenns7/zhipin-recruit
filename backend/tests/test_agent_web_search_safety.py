def test_search_leak_detector_flags_quota_and_credentials():
    from app.services.agent_service import _is_search_quota_or_credential_leak

    leak = (
        "daily_free_quota_exhausted\n"
        "API Key: as_sk_04c72d357372a6f05f10a67d2d7a8d93\n"
        "Username: as_auto_x\n"
        "Password: secret123\n"
        "add the API key to your MCP config"
    )

    assert _is_search_quota_or_credential_leak(leak) is True
    assert _is_search_quota_or_credential_leak("后端工程师薪资约 25-40K") is False


def test_search_text_sanitizer_redacts_credentials():
    from app.services.agent_service import _sanitize_search_text

    raw = "API Key: as_sk_04c72d357372a6f05f10a67d2d7a8d93\nPassword: secret123"

    cleaned = _sanitize_search_text(raw)

    assert "as_sk_04c72d357372a6f05f10a67d2d7a8d93" not in cleaned
    assert "secret123" not in cleaned
    assert "[已脱敏]" in cleaned


def test_search_payload_sanitizer_redacts_nested_results():
    from app.services.agent_service import _sanitize_search_payload

    payload = {
        "results": [
            {"title": "正常结果", "snippet": "token sk-abcdef1234567890abcdef"},
        ],
    }

    cleaned = _sanitize_search_payload(payload)

    assert "sk-abcdef1234567890abcdef" not in str(cleaned)
    assert cleaned["results"][0]["title"] == "正常结果"
