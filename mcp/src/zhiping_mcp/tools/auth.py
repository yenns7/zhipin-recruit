"""认证相关MCP工具"""

from mcp.server import Server
from ..client import client


def register_auth_tools(mcp: Server):
    """注册认证相关工具"""

    @mcp.tool()
    async def zhiping_login(username: str, password: str) -> dict:
        """登录智聘系统，获取JWT认证token

        Args:
            username: 用户名
            password: 密码

        Returns:
            登录结果，包含token和用户信息
        """
        result = await client.request("POST", "/auth/login", data={
            "username": username,
            "password": password,
        })
        return result

    @mcp.tool()
    async def zhiping_register(username: str, password: str, display_name: str = "") -> dict:
        """注册新用户账号（默认为招聘专员角色）

        Args:
            username: 用户名
            password: 密码
            display_name: 显示名称（可选）

        Returns:
            注册结果
        """
        data = {"username": username, "password": password}
        if display_name:
            data["display_name"] = display_name
        result = await client.request("POST", "/auth/register", data=data)
        return result

    @mcp.tool()
    async def zhiping_get_me() -> dict:
        """获取当前登录用户的信息

        Returns:
            当前用户信息，包括ID、用户名、角色等
        """
        result = await client.request("GET", "/auth/me")
        return result

    @mcp.tool()
    async def zhiping_change_password(old_password: str, new_password: str) -> dict:
        """修改当前用户密码

        Args:
            old_password: 旧密码
            new_password: 新密码

        Returns:
            修改结果
        """
        result = await client.request("POST", "/auth/change-password", data={
            "old_password": old_password,
            "new_password": new_password,
        })
        return result
