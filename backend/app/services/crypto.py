# -*- coding: utf-8 -*-
"""字段级对称加密工具（Fernet）。

用于加密存储 BOSS 账号 cookies 等敏感会话凭证。密钥来自环境变量
FIELD_ENCRYPTION_KEY；缺失时在开发模式下生成临时内存 key（重启后旧密文不可解），
生产模式（非 TESTING 且 FLASK_DEBUG=false）下抛错阻断启动。

生成密钥：python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
from __future__ import annotations

import logging
import os
import threading

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None
_lock = threading.Lock()
_dev_key_used = False  # 标记是否在用临时 dev key（用于 warning）


def _is_production() -> bool:
    """与 app/__init__.py::_enforce_production_security 一致的生产判定。"""
    if os.environ.get("TESTING", "").lower() == "true":
        return False
    return os.environ.get("FLASK_DEBUG", "true").lower() != "true"


def _get_fernet() -> Fernet:
    """惰性初始化并缓存 Fernet 实例（线程安全）。"""
    global _fernet, _dev_key_used
    if _fernet is not None:
        return _fernet
    with _lock:
        if _fernet is not None:
            return _fernet
        key = os.environ.get("FIELD_ENCRYPTION_KEY", "").strip()
        if not key:
            if _is_production():
                raise RuntimeError(
                    "生产环境必须设置 FIELD_ENCRYPTION_KEY 环境变量。"
                    "生成：python -c \"from cryptography.fernet import Fernet; "
                    "print(Fernet.generate_key().decode())\""
                )
            # 开发模式：生成临时 key（重启后旧密文不可解，仅用于本地）
            key = Fernet.generate_key().decode()
            _dev_key_used = True
            logger.warning(
                "FIELD_ENCRYPTION_KEY 未设置，使用临时开发密钥。"
                "重启后已加密的 BOSS 账号 cookies 将无法解密，需重新登录。"
                "生产环境务必设置 FIELD_ENCRYPTION_KEY。"
            )
        try:
            _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        except Exception as e:
            raise RuntimeError(f"FIELD_ENCRYPTION_KEY 无效（非合法 Fernet key）：{e}") from e
        return _fernet


def encrypt(plaintext: str) -> str:
    """加密字符串，返回 base64 密文。"""
    if plaintext is None:
        raise ValueError("plaintext 不能为 None")
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(ciphertext: str) -> str:
    """解密 base64 密文，返回原字符串。密文无效抛 ValueError。"""
    if not ciphertext:
        raise ValueError("ciphertext 不能为空")
    try:
        return _get_fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as e:
        raise ValueError("密文无效或密钥不匹配") from e


def is_dev_key() -> bool:
    """是否在用临时开发密钥（供健康检查/前端提示用）。"""
    return _dev_key_used
