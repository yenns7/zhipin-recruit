"""候选人和简历相关MCP工具"""

from typing import Optional
from mcp.server import Server
from ..client import client


def register_candidate_tools(mcp: Server):
    """注册候选人相关工具"""

    @mcp.tool()
    async def zhiping_list_candidates(
        keyword: Optional[str] = None,
        stage: Optional[str] = None,
        job_id: Optional[int] = None,
        city: Optional[str] = None,
        source_channel: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """获取候选人列表

        Args:
            keyword: 搜索关键词（姓名、技能等）
            stage: 招聘阶段筛选 (pending/ai_screen/business_review/interview/offer/onboarded/rejected)
            job_id: 岗位ID筛选
            city: 城市筛选
            source_channel: 来源渠道筛选
            page: 页码（默认1）
            per_page: 每页数量（默认20）

        Returns:
            候选人列表和分页信息
        """
        params = {"page": page, "per_page": per_page}
        if keyword:
            params["keyword"] = keyword
        if stage:
            params["stage"] = stage
        if job_id:
            params["job_id"] = job_id
        if city:
            params["city"] = city
        if source_channel:
            params["source_channel"] = source_channel

        result = await client.request("GET", "/candidates", params=params)
        return result

    @mcp.tool()
    async def zhiping_get_candidate(candidate_id: int) -> dict:
        """获取单个候选人的详细信息

        Args:
            candidate_id: 候选人ID

        Returns:
            候选人详细信息，包括简历解析数据
        """
        result = await client.request("GET", f"/candidates/{candidate_id}")
        return result

    @mcp.tool()
    async def zhiping_get_candidate_pipelines(candidate_id: int) -> dict:
        """获取候选人的所有应聘流程

        Args:
            candidate_id: 候选人ID

        Returns:
            候选人参与的所有岗位流程
        """
        result = await client.request("GET", f"/candidates/{candidate_id}/pipelines")
        return result

    @mcp.tool()
    async def zhiping_get_candidate_journey(candidate_id: int) -> dict:
        """获取候选人的完整应聘旅程（时间线）

        Args:
            candidate_id: 候选人ID

        Returns:
            候选人的时间线、面试记录、反馈等完整旅程
        """
        result = await client.request("GET", f"/candidates/{candidate_id}/journey")
        return result

    @mcp.tool()
    async def zhiping_update_candidate_profile(
        candidate_id: int,
        skills: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> dict:
        """更新候选人档案信息

        Args:
            candidate_id: 候选人ID
            skills: 技能标签（逗号分隔）
            notes: 备注信息

        Returns:
            更新结果
        """
        data = {}
        if skills is not None:
            data["skills"] = skills
        if notes is not None:
            data["notes"] = notes

        result = await client.request("PATCH", f"/resume/{candidate_id}/profile", data=data)
        return result

    @mcp.tool()
    async def zhiping_reassign_candidate(
        candidate_id: int,
        new_owner_id: int,
        reason: str,
    ) -> dict:
        """转派候选人负责人（需要经理或管理员权限）

        Args:
            candidate_id: 候选人ID
            new_owner_id: 新负责人用户ID
            reason: 转派原因

        Returns:
            转派结果
        """
        result = await client.request("PATCH", f"/candidates/{candidate_id}/owner", data={
            "new_owner_id": new_owner_id,
            "reason": reason,
        })
        return result

    @mcp.tool()
    async def zhiping_upload_resume(file_path: str, source_channel: str = "manual") -> dict:
        """上传简历文件（PDF/DOC/DOCX/ZIP）

        Args:
            file_path: 简历文件路径
            source_channel: 来源渠道（默认manual）

        Returns:
            上传和解析结果
        """
        # 注意：实际使用时需要处理文件上传
        # 这里提供接口说明，具体实现需要multipart上传
        return {
            "info": "文件上传需要使用multipart/form-data格式",
            "endpoint": "POST /api/resume/upload",
            "supported_formats": ["pdf", "doc", "docx", "zip"],
            "note": "请使用curl或其他工具上传文件",
        }
