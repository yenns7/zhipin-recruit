"""招聘流程相关MCP工具"""

from typing import Optional
from mcp.server import Server
from ..client import client


def register_pipeline_tools(mcp: Server):
    """注册招聘流程相关工具"""

    @mcp.tool()
    async def zhiping_move_candidate(
        job_id: int,
        candidate_id: int,
        target_stage: str,
        reason: Optional[str] = None,
    ) -> dict:
        """推进候选人到下一招聘阶段

        Args:
            job_id: 岗位ID
            candidate_id: 候选人ID
            target_stage: 目标阶段 (ai_screen/business_review/interview/offer/onboarded/rejected)
            reason: 推进原因（可选）

        Returns:
            推进结果
        """
        data = {
            "job_id": job_id,
            "candidate_id": candidate_id,
            "target_stage": target_stage,
        }
        if reason:
            data["reason"] = reason

        result = await client.request("POST", "/pipeline/move", data=data)
        return result

    @mcp.tool()
    async def zhiping_get_pipeline_stages(job_id: int) -> dict:
        """获取岗位的招聘流程阶段分布

        Args:
            job_id: 岗位ID

        Returns:
            各阶段的候选人数量统计
        """
        result = await client.request("GET", f"/pipeline/{job_id}")
        return result

    @mcp.tool()
    async def zhiping_get_pipeline_board(job_id: int) -> dict:
        """获取岗位的招聘看板数据（Kanban视图）

        Args:
            job_id: 岗位ID

        Returns:
            看板数据，按阶段分组的候选人列表
        """
        result = await client.request("GET", f"/pipeline/{job_id}/board")
        return result

    @mcp.tool()
    async def zhiping_get_candidate_pipeline_history(
        job_id: int,
        candidate_id: int,
    ) -> dict:
        """获取候选人在某个岗位的阶段流转历史

        Args:
            job_id: 岗位ID
            candidate_id: 候选人ID

        Returns:
            阶段流转时间线
        """
        result = await client.request("GET", f"/pipeline/{job_id}/history/{candidate_id}")
        return result

    @mcp.tool()
    async def zhiping_get_offer_record(job_id: int, candidate_id: int) -> dict:
        """获取候选人的Offer记录

        Args:
            job_id: 岗位ID
            candidate_id: 候选人ID

        Returns:
            Offer详情
        """
        result = await client.request("GET", f"/pipeline/{job_id}/offer/{candidate_id}")
        return result

    @mcp.tool()
    async def zhiping_save_offer_record(
        job_id: int,
        candidate_id: int,
        salary: Optional[str] = None,
        position: Optional[str] = None,
        department: Optional[str] = None,
        start_date: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> dict:
        """保存或更新候选人的Offer记录

        Args:
            job_id: 岗位ID
            candidate_id: 候选人ID
            salary: 薪资（可选）
            position: 职位（可选）
            department: 部门（可选）
            start_date: 入职日期（可选）
            notes: 备注（可选）

        Returns:
            保存结果
        """
        data = {}
        if salary is not None:
            data["salary"] = salary
        if position is not None:
            data["position"] = position
        if department is not None:
            data["department"] = department
        if start_date is not None:
            data["start_date"] = start_date
        if notes is not None:
            data["notes"] = notes

        result = await client.request("PUT", f"/pipeline/{job_id}/offer/{candidate_id}", data=data)
        return result
