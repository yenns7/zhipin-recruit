"""配置管理模块"""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Config:
    """MCP服务配置"""

    # 后端API地址
    api_base_url: str = field(
        default_factory=lambda: os.getenv("ZHIPING_API_URL", "http://localhost:5001")
    )

    # JWT认证token（从环境变量或配置文件读取）
    jwt_token: Optional[str] = field(
        default_factory=lambda: os.getenv("ZHIPING_JWT_TOKEN")
    )

    # 请求超时时间（秒）
    request_timeout: int = field(
        default_factory=lambda: int(os.getenv("ZHIPING_REQUEST_TIMEOUT", "30"))
    )

    # 是否启用调试模式
    debug: bool = field(
        default_factory=lambda: os.getenv("ZHIPING_DEBUG", "false").lower() == "true"
    )

    def get_headers(self) -> dict:
        """获取API请求头"""
        headers = {"Content-Type": "application/json"}
        if self.jwt_token:
            headers["Authorization"] = f"Bearer {self.jwt_token}"
        return headers


# 全局配置实例
config = Config()
