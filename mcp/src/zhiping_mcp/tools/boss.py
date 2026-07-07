"""BOSS直聘集成相关MCP工具"""

from typing import Optional
from mcp.server import Server
from ..client import client


def register_boss_tools(mcp: Server):
    """注册BOSS直聘相关工具"""

    @mcp.tool()
    async def zhiping_boss_check_status() -> dict:
        """检查BOSS直聘登录状态

        Returns:
            登录状态信息
        """
        result = await client.request("GET", "/boss/status")
        return result

    @mcp.tool()
    async def zhiping_boss_import_cookie(cookie: str, label: str = "") -> dict:
        """导入BOSS直聘浏览器Cookie

        Args:
            cookie: 从浏览器开发者工具复制的Cookie字符串
            label: 账号标签（可选，便于区分多个账号）

        Returns:
            导入结果
        """
        result = await client.request("POST", "/boss/login/browser-cookie", data={
            "cookie": cookie,
            "label": label,
        })
        return result

    @mcp.tool()
    async def zhiping_boss_list_accounts() -> dict:
        """列出已保存的BOSS直聘账号

        Returns:
            账号列表（不含Cookie明文）
        """
        result = await client.request("GET", "/boss/accounts")
        return result

    @mcp.tool()
    async def zhiping_boss_switch_account(account_id: int) -> dict:
        """切换激活的BOSS直聘账号

        Args:
            account_id: 账号ID

        Returns:
            切换结果
        """
        result = await client.request("POST", f"/boss/accounts/{account_id}/activate")
        return result

    @mcp.tool()
    async def zhiping_boss_verify_account(account_id: int) -> dict:
        """验证BOSS直聘账号登录态

        Args:
            account_id: 账号ID

        Returns:
            验证结果
        """
        result = await client.request("POST", f"/boss/accounts/{account_id}/verify")
        return result

    @mcp.tool()
    async def zhiping_boss_delete_account(account_id: int) -> dict:
        """删除BOSS直聘账号

        Args:
            account_id: 账号ID

        Returns:
            删除结果
        """
        result = await client.request("DELETE", f"/boss/accounts/{account_id}")
        return result

    @mcp.tool()
    async def zhiping_boss_list_jobs() -> dict:
        """获取BOSS直聘招聘端在招职位列表

        Returns:
            职位列表
        """
        result = await client.request("GET", "/boss/jobs")
        return result

    @mcp.tool()
    async def zhiping_boss_get_recommendations(
        job: Optional[str] = None,
        limit: int = 20,
    ) -> dict:
        """获取BOSS直聘推荐候选人

        Args:
            job: 岗位ID筛选（可选）
            limit: 返回数量限制（默认20）

        Returns:
            推荐候选人列表
        """
        params = {"limit": limit}
        if job:
            params["job"] = job

        result = await client.request("GET", "/boss/candidates/recommend", params=params)
        return result

    @mcp.tool()
    async def zhiping_boss_get_inbox(
        job: Optional[str] = None,
        limit: int = 20,
    ) -> dict:
        """获取BOSS直聘收件箱/沟通列表

        Args:
            job: 岗位ID筛选（可选）
            limit: 返回数量限制（默认20）

        Returns:
            收件箱列表
        """
        params = {"limit": limit}
        if job:
            params["job"] = job

        result = await client.request("GET", "/boss/candidates/inbox", params=params)
        return result

    @mcp.tool()
    async def zhiping_boss_get_resume(encrypt_geek_id: str) -> dict:
        """获取BOSS直聘候选人简历

        Args:
            encrypt_geek_id: 加密的候选人ID

        Returns:
            简历信息（Markdown格式）
        """
        result = await client.request("GET", f"/boss/candidates/{encrypt_geek_id}/resume")
        return result

    @mcp.tool()
    async def zhiping_boss_batch_import(
        items: list[dict],
        target_job_id: int,
        limit: int = 50,
        interval_sec: float = 1.5,
    ) -> dict:
        """批量导入BOSS直聘候选人到本地系统

        Args:
            items: 候选人列表，每个元素包含geek_id和name
            target_job_id: 目标岗位ID
            limit: 最大导入数量（默认50）
            interval_sec: 请求间隔秒数（默认1.5，防频控）

        Returns:
            导入结果
        """
        result = await client.request("POST", "/boss/candidates/batch-import", data={
            "items": items,
            "target_job_id": target_job_id,
            "limit": limit,
            "interval_sec": interval_sec,
        })
        return result

    @mcp.tool()
    async def zhiping_boss_ai_screen(candidate_ids: list[int], job_id: int) -> dict:
        """对已导入的BOSS候选人进行AI简历初筛

        Args:
            candidate_ids: 本地候选人ID列表
            job_id: 岗位ID

        Returns:
            AI初筛结果
        """
        result = await client.request("POST", "/boss/candidates/ai-screen", data={
            "candidate_ids": candidate_ids,
            "job_id": job_id,
        })
        return result

    @mcp.tool()
    async def zhiping_boss_get_labels() -> dict:
        """获取BOSS直聘候选人标签列表

        Returns:
            标签列表
        """
        result = await client.request("GET", "/boss/labels")
        return result

    @mcp.tool()
    async def zhiping_boss_get_chat_history(friend_id: str) -> dict:
        """获取BOSS直聘聊天记录

        Args:
            friend_id: 好友ID（加密的geek_id）

        Returns:
            聊天记录
        """
        result = await client.request("GET", f"/boss/chat/{friend_id}")
        return result

    @mcp.tool()
    async def zhiping_boss_export() -> dict:
        """导出BOSS直聘候选人列表

        Returns:
            导出的候选人数据（JSON格式）
        """
        result = await client.request("GET", "/boss/export")
        return result
