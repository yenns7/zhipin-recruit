"""通知相关MCP工具"""

from typing import Optional
from mcp.server import Server
from ..client import client


def register_notification_tools(mcp: Server):
    """注册通知相关工具"""

    @mcp.tool()
    async def zhiping_list_notifications(
        page: int = 1,
        per_page: int = 20,
        unread_only: bool = False,
    ) -> dict:
        """获取当前用户的通知列表

        Args:
            page: 页码（默认1）
            per_page: 每页数量（默认20）
            unread_only: 只显示未读通知（默认False）

        Returns:
            通知列表和未读数量
        """
        params = {"page": page, "per_page": per_page}
        if unread_only:
            params["unread_only"] = "true"

        result = await client.request("GET", "/notifications", params=params)
        return result

    @mcp.tool()
    async def zhiping_get_unread_count() -> dict:
        """获取未读通知数量

        Returns:
            未读通知数量
        """
        result = await client.request("GET", "/notifications/unread-count")
        return result

    @mcp.tool()
    async def zhiping_mark_notifications_read(
        notification_ids: Optional[list[int]] = None,
        mark_all: bool = False,
    ) -> dict:
        """标记通知为已读

        Args:
            notification_ids: 通知ID列表（可选，不传则标记全部）
            mark_all: 是否标记全部为已读（默认False）

        Returns:
            标记结果
        """
        data = {}
        if notification_ids:
            data["notification_ids"] = notification_ids
        if mark_all:
            data["mark_all"] = True

        result = await client.request("POST", "/notifications/mark-read", data=data)
        return result
