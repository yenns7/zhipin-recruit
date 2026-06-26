"""LLM 调用埋点测试：验证 chat / chat_messages / chat_stream 在成功与失败时
都会把 model / token / 耗时 / status 记录到 self.last_call_log。"""
import json
from unittest.mock import patch, MagicMock

from llm_client import LLMClient, build_call_log


def _make_client(monkeypatch):
    """构造一个不依赖外部 key 文件 / 钥匙串的 LLMClient。"""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    return LLMClient()


def _ok_response(content="你好", prompt_tokens=10, completion_tokens=5):
    """构造一个带 usage 的成功 OpenAI 兼容响应。"""
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {
        "choices": [{"message": {"content": content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens},
    }
    return resp


def _err_response():
    resp = MagicMock()
    resp.raise_for_status.side_effect = Exception("upstream 500")
    return resp


def test_build_call_log_shape():
    """build_call_log 返回标准字段。"""
    log = build_call_log(
        model="deepseek-v4-flash",
        prompt_tokens=12,
        completion_tokens=8,
        duration_ms=320,
        status="ok",
    )
    assert log["model"] == "deepseek-v4-flash"
    assert log["prompt_tokens"] == 12
    assert log["completion_tokens"] == 8
    assert log["duration_ms"] == 320
    assert log["status"] == "ok"
    assert log["error_msg"] is None


def test_chat_success_records_call_log(monkeypatch):
    client = _make_client(monkeypatch)
    with patch("llm_client.requests.post", return_value=_ok_response("答案是 42", 10, 5)):
        out = client.chat("sys", "hi")
    assert out == "答案是 42"
    log = client.last_call_log
    assert log is not None
    assert log["status"] == "ok"
    assert log["prompt_tokens"] == 10
    assert log["completion_tokens"] == 5
    assert log["duration_ms"] is not None and log["duration_ms"] >= 0
    assert log["model"] == client.model


def test_chat_messages_success_records_call_log(monkeypatch):
    client = _make_client(monkeypatch)
    with patch("llm_client.requests.post", return_value=_ok_response("多轮回答", 20, 7)):
        out = client.chat_messages([{"role": "user", "content": "hi"}])
    assert out == "多轮回答"
    log = client.last_call_log
    assert log["status"] == "ok"
    assert log["prompt_tokens"] == 20
    assert log["completion_tokens"] == 7


def test_chat_failure_records_error_log(monkeypatch):
    client = _make_client(monkeypatch)
    # max_retry 默认 3，全部失败
    monkeypatch.setattr(client, "max_retry", 2)
    with patch("llm_client.requests.post", return_value=_err_response()):
        try:
            client.chat("sys", "hi")
            assert False, "应抛 RuntimeError"
        except RuntimeError:
            pass
    log = client.last_call_log
    assert log["status"] == "error"
    assert log["error_msg"]
    # 失败时 token 可能为 None
    assert log["duration_ms"] is not None and log["duration_ms"] >= 0


def test_chat_stream_success_records_call_log(monkeypatch):
    """chat_stream 流式结束应记录 status=ok 与耗时。"""
    client = _make_client(monkeypatch)

    class FakeStream:
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def raise_for_status(self):
            pass
        def iter_lines(self, decode_unicode=True):
            yield 'data: {"choices":[{"delta":{"content":"你好"}}]}'
            yield 'data: {"choices":[{"delta":{"content":"世界"}}]}'
            yield "data: [DONE]"

    with patch("llm_client.requests.post", return_value=FakeStream()):
        out = list(client.chat_stream([{"role": "user", "content": "hi"}]))

    # 两个 content + 一个 done
    contents = [e for e in out if e.get("type") == "content"]
    assert len(contents) == 2
    assert out[-1].get("type") == "done"
    log = client.last_call_log
    assert log["status"] == "ok"
    assert log["duration_ms"] is not None and log["duration_ms"] >= 0


def test_chat_stream_failure_records_error_log(monkeypatch):
    client = _make_client(monkeypatch)

    class FakeStreamErr:
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def raise_for_status(self):
            raise Exception("stream 500")

    with patch("llm_client.requests.post", return_value=FakeStreamErr()):
        try:
            list(client.chat_stream([{"role": "user", "content": "hi"}]))
            assert False, "应抛异常"
        except Exception:
            pass
    log = client.last_call_log
    assert log["status"] == "error"
    assert log["error_msg"]


def test_chat_stream_aborted_when_not_fully_consumed(monkeypatch):
    """生成器被中途停止迭代（客户端断连）时，last_call_log 应记录 aborted。"""
    client = _make_client(monkeypatch)

    class FakeStream:
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def raise_for_status(self):
            pass
        def iter_lines(self, decode_unicode=True):
            yield 'data: {"choices":[{"delta":{"content":"片段1"}}]}'
            yield 'data: {"choices":[{"delta":{"content":"片段2"}}]}'
            yield "data: [DONE]"

    with patch("llm_client.requests.post", return_value=FakeStream()):
        gen = client.chat_stream([{"role": "user", "content": "hi"}])
        # 只取第一个 token 就停止迭代，模拟客户端断连
        first = next(gen)
        assert first.get("type") == "content"
        # 显式关闭生成器，触发 GeneratorExit → finally
        gen.close()

    log = client.last_call_log
    assert log is not None
    assert log["status"] == "aborted"
    assert log["duration_ms"] is not None and log["duration_ms"] >= 0
