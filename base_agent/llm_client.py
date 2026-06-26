#!/usr/bin/env python
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import subprocess
import time
import logging
from pathlib import Path
from typing import Any, Dict, Optional

import requests

from llm_utils import apply_temperature_strategy

try:
    # reuse key manager if available
    from tag_rate import APIKeyManager, load_api_keys
except Exception:
    APIKeyManager = None  # type: ignore
    load_api_keys = None  # type: ignore

ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_FILE = ROOT_DIR / "llm_config.json"
DEFAULT_API_KEY_FILE = ROOT_DIR / "API_key-openai.md"
KEYCHAIN_PREFIX = "keychain:"

DEFAULTS = {
    "provider": "openai",  # or "deepseek"
    "model": "gpt-5-mini",
    "api_url_openai": "https://api.openai.com/v1/chat/completions",
    "api_url_deepseek": "https://api.deepseek.com/v1/chat/completions",
    "timeout": 120,
    "max_retry": 3,
    "temperature": 0.7,
}


def resolve_secret_value(value: str) -> str:
    """Resolve supported secret references while keeping real keys out of files."""
    if not value or not value.startswith(KEYCHAIN_PREFIX):
        return value

    service = value[len(KEYCHAIN_PREFIX):].strip()
    if not service:
        raise ValueError("keychain secret reference is missing a service name")

    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", service, "-w"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        raise RuntimeError(f"无法从 macOS 钥匙串读取 API Key: {service}") from e

    secret = result.stdout.strip()
    if not secret:
        raise RuntimeError(f"macOS 钥匙串里的 API Key 为空: {service}")
    return secret


def first_configured_api_key() -> str:
    for name in ("OPENAI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "API_KEY", "LLM_API_KEY"):
        raw_value = os.getenv(name)
        if raw_value:
            return resolve_secret_value(raw_value)
    return ""

# DeepSeek v4 模型路由：按任务难度选择模型与思考模式。
#   fast   —— 结构化/简单任务：flash 关思考，最快、最省 token
#   think  —— 中等复杂：flash 开思考
#   pro    —— 高难度推理：v4-pro 开思考
MODEL_ROUTES = {
    "fast": {"model": "deepseek-v4-flash", "thinking": "disabled"},
    "think": {"model": "deepseek-v4-flash", "thinking": "enabled"},
    "pro": {"model": "deepseek-v4-pro", "thinking": "enabled"},
}


def route_model(difficulty: str = "fast") -> Dict[str, str]:
    """根据难度返回 {model, thinking}。难度未知时回退 fast。"""
    return MODEL_ROUTES.get(difficulty, MODEL_ROUTES["fast"])


def build_call_log(
    model: Optional[str] = None,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    duration_ms: Optional[int] = None,
    status: str = "ok",
    error_msg: Optional[str] = None,
) -> Dict[str, Any]:
    """构造一次 LLM 调用的结构化日志 dict（不写库，由调用方决定入库时机，
    避免 base_agent 反向依赖 app）。"""
    return {
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "duration_ms": duration_ms,
        "status": status,
        "error_msg": error_msg,
    }


def _extract_usage(data: Dict[str, Any]) -> tuple:
    """从 OpenAI/DeepSeek 兼容响应里取 (prompt_tokens, completion_tokens)。无则 (None, None)。"""
    usage = (data or {}).get("usage") or {}
    return usage.get("prompt_tokens"), usage.get("completion_tokens")



def load_llm_config() -> Dict[str, Any]:
    cfg: Dict[str, Any] = {}
    if DEFAULT_CONFIG_FILE.exists():
        try:
            cfg = json.loads(DEFAULT_CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            logging.warning(f"无法解析 llm_config.json，使用默认配置: {e}")
    # env overrides
    provider = os.getenv("LLM_PROVIDER", cfg.get("provider", DEFAULTS["provider"]))
    model = os.getenv("LLM_MODEL", cfg.get("model", DEFAULTS["model"]))
    api_url = os.getenv("LLM_API_URL") or cfg.get("api_url")  # from env or config file
    timeout = int(os.getenv("LLM_TIMEOUT_S", str(cfg.get("timeout", DEFAULTS["timeout"]))))
    max_retry = int(os.getenv("LLM_MAX_RETRY", str(cfg.get("max_retry", DEFAULTS["max_retry"]))))
    temperature = float(os.getenv("LLM_TEMPERATURE", str(cfg.get("temperature", DEFAULTS["temperature"]))))
    # max_tokens: 推理模型（如 deepseek-v4-flash）会先消耗额度做 reasoning，
    # 必须给足上限，否则 content 可能为空/被截断。0 或缺省表示不显式限制。
    _max_tokens_raw = os.getenv("LLM_MAX_TOKENS", str(cfg.get("max_tokens", "") or ""))
    max_tokens = int(_max_tokens_raw) if str(_max_tokens_raw).strip() else None
    # thinking: DeepSeek v4 思考模式开关，"enabled"/"disabled"/None（不传，用模型默认）。
    thinking = os.getenv("LLM_THINKING", cfg.get("thinking") or "") or None
    return {
        "provider": provider,
        "model": model,
        "api_url": api_url,
        "timeout": timeout,
        "max_retry": max_retry,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "thinking": thinking,
    }


class LLMClient:
    """
    Unified LLM client supporting multiple providers (OpenAI, DeepSeek).
    - Rotates API keys using tag_rate.APIKeyManager if available
    - Supports response_format={"type": "json_object"}
    """
    def __init__(
        self,
        api_key_manager: Optional["APIKeyManager"] = None,
        override: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.cfg = load_llm_config()
        if override:
            self.cfg.update({k: v for k, v in override.items() if v is not None})

        self.provider: str = self.cfg["provider"]
        self.model: str = self.cfg["model"]
        self.timeout: int = self.cfg["timeout"]
        self.max_retry: int = self.cfg["max_retry"]
        self.temperature: float = self.cfg["temperature"]
        self.max_tokens: Optional[int] = self.cfg.get("max_tokens")
        self.thinking: Optional[str] = self.cfg.get("thinking")
        self.api_key_manager = api_key_manager or self._maybe_build_key_manager()

        # 最近一次调用结构化日志（build_call_log 返回的 dict），供调用方读取入库。
        # 每次调用覆盖；流式在生成器结束后更新。
        self.last_call_log: Optional[Dict[str, Any]] = None

        # 推理模型给 max_tokens 安全默认值，避免思考耗尽额度导致 content 为空
        if self.max_tokens is None and "deepseek" in (self.model or "").lower():
            self.max_tokens = 8192

        # Resolve API URL
        if self.cfg.get("api_url"):
            self.api_url = self.cfg["api_url"]
        else:
            if self.provider.lower() == "deepseek":
                self.api_url = DEFAULTS["api_url_deepseek"]
            else:
                self.api_url = DEFAULTS["api_url_openai"]

    def _maybe_build_key_manager(self) -> Optional["APIKeyManager"]:
        # First check env var
        env_key = first_configured_api_key()
        if env_key:
            if APIKeyManager is not None:
                return APIKeyManager([env_key])
            return None

        if APIKeyManager is None or load_api_keys is None:
            return None
        # Default to API_key-openai.md in project root
        key_file = DEFAULT_API_KEY_FILE
        try:
            api_keys = [resolve_secret_value(key) for key in load_api_keys(key_file)]
            return APIKeyManager(api_keys)
        except Exception as e:
            logging.warning(f"无法从 {key_file} 加载API Key: {e}")
            return None

    def _headers(self, api_key: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def _resolve_key(self) -> str:
        if self.api_key_manager:
            return self.api_key_manager.get_key()
        return first_configured_api_key()

    def _build_body(
        self,
        messages: list,
        response_format: Optional[Dict[str, Any]] = None,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
        thinking: Optional[str] = None,
        stream: bool = False,
    ) -> Dict[str, Any]:
        """构造请求 body。messages 已是完整 role/content 列表。"""
        use_model = model or self.model
        target_temperature = self.temperature if temperature is None else temperature
        # temperature 策略对推理模型可能无效，但 apply 仍安全
        _, temp_param = apply_temperature_strategy(use_model, "", target_temperature)
        body: Dict[str, Any] = {"model": use_model, "messages": messages}
        if temp_param is not None:
            body["temperature"] = temp_param
        if response_format:
            body["response_format"] = response_format
        if self.max_tokens:
            body["max_tokens"] = self.max_tokens
        # thinking：显式参数 > 实例配置；仅 deepseek-v4 系列接受
        eff_thinking = thinking if thinking is not None else self.thinking
        if eff_thinking in ("enabled", "disabled") and "deepseek-v4" in use_model:
            body["thinking"] = {"type": eff_thinking}
        if stream:
            body["stream"] = True
        return body

    def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        response_format: Optional[Dict[str, Any]] = None,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
        thinking: Optional[str] = None,
    ) -> str:
        adjusted_system_prompt, _ = apply_temperature_strategy(
            model or self.model, system_prompt, self.temperature if temperature is None else temperature
        )
        messages = [
            {"role": "system", "content": adjusted_system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        body = self._build_body(messages, response_format, temperature, model, thinking)
        use_model = body.get("model", self.model)

        last_err: Optional[Exception] = None
        t0 = time.time()
        for attempt in range(1, self.max_retry + 1):
            api_key = self._resolve_key()
            try:
                resp = requests.post(
                    self.api_url,
                    headers=self._headers(api_key),
                    json=body,
                    timeout=self.timeout,
                )
                resp.raise_for_status()
                data = resp.json()
                choice = data.get("choices", [{}])[0]
                message = choice.get("message", {})
                content = (message.get("content") or "").strip()
                if content:
                    p_tok, c_tok = _extract_usage(data)
                    self.last_call_log = build_call_log(
                        model=use_model, prompt_tokens=p_tok, completion_tokens=c_tok,
                        duration_ms=int((time.time() - t0) * 1000), status="ok",
                    )
                    return content
                # 空 content：推理模型可能把额度耗在 reasoning 上，或被 length 截断
                finish = choice.get("finish_reason")
                has_reasoning = bool(message.get("reasoning_content"))
                raise ValueError(
                    f"LLM 响应为空或缺少 content（finish_reason={finish}, "
                    f"reasoning_content={'有' if has_reasoning else '无'}）。"
                    f"若为推理模型请调大 LLM_MAX_TOKENS。"
                )
            except Exception as e:
                last_err = e
                logging.warning(f"LLM调用失败（{self.provider}, 第{attempt}/{self.max_retry}次）: {e}")
                if attempt < self.max_retry:
                    time.sleep(2 ** attempt)
        self.last_call_log = build_call_log(
            model=use_model, duration_ms=int((time.time() - t0) * 1000),
            status="error", error_msg=str(last_err),
        )
        raise RuntimeError(f"LLM 多次重试后仍失败: {last_err}")

    def chat_messages(
        self,
        messages: list,
        response_format: Optional[Dict[str, Any]] = None,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
        thinking: Optional[str] = None,
    ) -> str:
        """多轮对话：直接传入完整 messages 列表，返回最终回答文本。"""
        body = self._build_body(messages, response_format, temperature, model, thinking)
        use_model = body.get("model", self.model)
        last_err: Optional[Exception] = None
        t0 = time.time()
        for attempt in range(1, self.max_retry + 1):
            try:
                resp = requests.post(
                    self.api_url, headers=self._headers(self._resolve_key()),
                    json=body, timeout=self.timeout,
                )
                resp.raise_for_status()
                data = resp.json()
                msg = data.get("choices", [{}])[0].get("message", {})
                content = (msg.get("content") or "").strip()
                if content:
                    p_tok, c_tok = _extract_usage(data)
                    self.last_call_log = build_call_log(
                        model=use_model, prompt_tokens=p_tok, completion_tokens=c_tok,
                        duration_ms=int((time.time() - t0) * 1000), status="ok",
                    )
                    return content
                raise ValueError("LLM 响应为空")
            except Exception as e:
                last_err = e
                logging.warning(f"LLM多轮调用失败（第{attempt}/{self.max_retry}次）: {e}")
                if attempt < self.max_retry:
                    time.sleep(2 ** attempt)
        self.last_call_log = build_call_log(
            model=use_model, duration_ms=int((time.time() - t0) * 1000),
            status="error", error_msg=str(last_err),
        )
        raise RuntimeError(f"LLM 多次重试后仍失败: {last_err}")

    def chat_stream(
        self,
        messages: list,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
        thinking: Optional[str] = None,
    ):
        """流式对话：逐 token yield {'type':'reasoning'|'content', 'text':...}。

        最后 yield {'type':'done'}。供 SSE 端点转发。
        调用结束后 self.last_call_log 记录本次调用耗时与状态。
        """
        body = self._build_body(messages, None, temperature, model, thinking, stream=True)
        use_model = body.get("model", self.model)
        api_key = self._resolve_key()
        t0 = time.time()
        try:
            with requests.post(
                self.api_url, headers=self._headers(api_key), json=body,
                timeout=self.timeout, stream=True,
            ) as resp:
                resp.raise_for_status()
                for raw in resp.iter_lines(decode_unicode=True):
                    if not raw or not raw.startswith("data: "):
                        continue
                    data = raw[6:]
                    if data.strip() == "[DONE]":
                        break
                    try:
                        parsed = json.loads(data)
                        delta = parsed.get("choices", [{}])[0].get("delta", {})
                    except Exception:
                        continue
                    reasoning = delta.get("reasoning_content")
                    if reasoning:
                        yield {"type": "reasoning", "text": reasoning}
                    piece = delta.get("content")
                    if piece:
                        yield {"type": "content", "text": piece}
            self.last_call_log = build_call_log(
                model=use_model, duration_ms=int((time.time() - t0) * 1000), status="ok",
            )
            yield {"type": "done"}
        except Exception as e:
            self.last_call_log = build_call_log(
                model=use_model, duration_ms=int((time.time() - t0) * 1000),
                status="error", error_msg=str(e),
            )
            raise


