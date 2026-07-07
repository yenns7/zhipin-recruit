"""HTTP客户端模块，用于调用智聘后端API"""

import json
from typing import Any, Optional
import httpx

from .config import config


class ZhipingClient:
    """智聘后端API客户端"""

    def __init__(self):
        self.base_url = config.api_base_url.rstrip("/")
        self.timeout = config.request_timeout

    def _build_url(self, path: str) -> str:
        """构建完整的API URL"""
        return f"{self.base_url}/api{path}"

    async def request(
        self,
        method: str,
        path: str,
        data: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> dict:
        """发送API请求

        Args:
            method: HTTP方法 (GET, POST, PUT, PATCH, DELETE)
            path: API路径（不含/api前缀）
            data: 请求体数据
            params: 查询参数

        Returns:
            API响应数据
        """
        url = self._build_url(path)
        headers = config.get_headers()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                if method.upper() == "GET":
                    response = await client.get(url, headers=headers, params=params)
                elif method.upper() == "POST":
                    response = await client.post(url, headers=headers, json=data)
                elif method.upper() == "PUT":
                    response = await client.put(url, headers=headers, json=data)
                elif method.upper() == "PATCH":
                    response = await client.patch(url, headers=headers, json=data)
                elif method.upper() == "DELETE":
                    response = await client.delete(url, headers=headers)
                else:
                    return {"error": f"不支持的HTTP方法: {method}"}

                # 处理响应
                if response.status_code >= 400:
                    error_detail = response.text
                    try:
                        error_json = response.json()
                        error_detail = json.dumps(error_json, ensure_ascii=False)
                    except Exception:
                        pass
                    return {
                        "error": f"API请求失败 (HTTP {response.status_code})",
                        "detail": error_detail,
                    }

                # 尝试解析JSON响应
                try:
                    return response.json()
                except Exception:
                    return {"data": response.text}

            except httpx.TimeoutException:
                return {"error": f"请求超时 ({self.timeout}秒)"}
            except httpx.ConnectError:
                return {"error": f"无法连接到后端服务: {self.base_url}"}
            except Exception as e:
                return {"error": f"请求异常: {str(e)}"}


# 全局客户端实例
client = ZhipingClient()
