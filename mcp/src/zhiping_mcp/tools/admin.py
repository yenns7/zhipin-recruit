"""系统管理相关MCP工具（需要管理员权限）"""

from typing import Optional
from mcp.server import Server
from ..client import client


def register_admin_tools(mcp: Server):
    """注册系统管理相关工具"""

    @mcp.tool()
    async def zhiping_admin_list_users(page: int = 1, per_page: int = 20) -> dict:
        """获取系统用户列表（需要管理员权限）

        Args:
            page: 页码（默认1）
            per_page: 每页数量（默认20）

        Returns:
            用户列表
        """
        result = await client.request("GET", "/admin/users", params={
            "page": page,
            "per_page": per_page,
        })
        return result

    @mcp.tool()
    async def zhiping_admin_create_user(
        username: str,
        password: str,
        role: str = "recruiter",
        display_name: str = "",
    ) -> dict:
        """创建用户（需要管理员权限）

        Args:
            username: 用户名
            password: 密码
            role: 角色 (admin/manager/recruiter/interviewer)
            display_name: 显示名称（可选）

        Returns:
            创建结果
        """
        data = {
            "username": username,
            "password": password,
            "role": role,
        }
        if display_name:
            data["display_name"] = display_name

        result = await client.request("POST", "/admin/users", data=data)
        return result

    @mcp.tool()
    async def zhiping_admin_update_user(
        user_id: int,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        display_name: Optional[str] = None,
    ) -> dict:
        """更新用户信息（需要管理员权限）

        Args:
            user_id: 用户ID
            role: 角色（可选）
            is_active: 是否启用（可选）
            display_name: 显示名称（可选）

        Returns:
            更新结果
        """
        data = {}
        if role is not None:
            data["role"] = role
        if is_active is not None:
            data["is_active"] = is_active
        if display_name is not None:
            data["display_name"] = display_name

        result = await client.request("PATCH", f"/admin/users/{user_id}", data=data)
        return result

    @mcp.tool()
    async def zhiping_admin_reset_password(user_id: int, new_password: str) -> dict:
        """重置用户密码（需要管理员权限）

        Args:
            user_id: 用户ID
            new_password: 新密码

        Returns:
            重置结果
        """
        result = await client.request("POST", f"/admin/users/{user_id}/reset-password", data={
            "new_password": new_password,
        })
        return result

    @mcp.tool()
    async def zhiping_admin_ai_architecture() -> dict:
        """获取AI架构仪表盘数据（需要管理员权限）

        Returns:
            AI架构相关信息
        """
        result = await client.request("GET", "/admin/ai-architecture")
        return result

    @mcp.tool()
    async def zhiping_admin_audit_logs(
        page: int = 1,
        per_page: int = 20,
        event_type: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> dict:
        """查询审计日志（需要管理员权限）

        Args:
            page: 页码（默认1）
            per_page: 每页数量（默认20）
            event_type: 事件类型筛选（可选）
            user_id: 用户ID筛选（可选）

        Returns:
            审计日志列表
        """
        params = {"page": page, "per_page": per_page}
        if event_type:
            params["event_type"] = event_type
        if user_id:
            params["user_id"] = user_id

        result = await client.request("GET", "/admin/audit-logs", params=params)
        return result
