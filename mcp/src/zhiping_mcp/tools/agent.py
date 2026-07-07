"""AI助手相关MCP工具"""

from typing import Optional
from mcp.server import Server
from ..client import client


def register_agent_tools(mcp: Server):
    """注册AI助手相关工具"""

    @mcp.tool()
    async def zhiping_agent_list_tools() -> dict:
        """获取AI助手可用的工具列表

        Returns:
            AI工具列表，包括读取工具和写入工具
        """
        result = await client.request("GET", "/agent/tools")
        return result

    @mcp.tool()
    async def zhiping_agent_list_conversations(
        page: int = 1,
        per_page: int = 20,
        archived: bool = False,
    ) -> dict:
        """获取AI对话列表

        Args:
            page: 页码（默认1）
            per_page: 每页数量（默认20）
            archived: 是否显示已归档对话（默认False）

        Returns:
            对话列表
        """
        params = {"page": page, "per_page": per_page}
        if archived:
            params["archived"] = "true"

        result = await client.request("GET", "/agent/conversations", params=params)
        return result

    @mcp.tool()
    async def zhiping_agent_create_conversation(title: str = "新对话") -> dict:
        """创建新的AI对话

        Args:
            title: 对话标题（默认"新对话"）

        Returns:
            创建的对话信息
        """
        result = await client.request("POST", "/agent/conversations", data={
            "title": title,
        })
        return result

    @mcp.tool()
    async def zhiping_agent_get_conversation(conversation_id: int) -> dict:
        """获取AI对话详情（包含消息历史）

        Args:
            conversation_id: 对话ID

        Returns:
            对话详情和消息列表
        """
        result = await client.request("GET", f"/agent/conversations/{conversation_id}")
        return result

    @mcp.tool()
    async def zhiping_agent_rename_conversation(
        conversation_id: int,
        title: str,
    ) -> dict:
        """重命名AI对话

        Args:
            conversation_id: 对话ID
            title: 新标题

        Returns:
            更新结果
        """
        result = await client.request("PATCH", f"/agent/conversations/{conversation_id}", data={
            "title": title,
        })
        return result

    @mcp.tool()
    async def zhiping_agent_archive_conversation(conversation_id: int) -> dict:
        """归档AI对话（软删除）

        Args:
            conversation_id: 对话ID

        Returns:
            归档结果
        """
        result = await client.request("DELETE", f"/agent/conversations/{conversation_id}")
        return result

    @mcp.tool()
    async def zhiping_agent_list_call_logs(
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """获取AI调用日志（用于调试和审计）

        Args:
            page: 页码（默认1）
            per_page: 每页数量（默认20）

        Returns:
            调用日志列表
        """
        result = await client.request("GET", "/agent/call-logs", params={
            "page": page,
            "per_page": per_page,
        })
        return result
