"""面试相关MCP工具"""

from typing import Optional
from mcp.server import Server
from ..client import client


def register_interview_tools(mcp: Server):
    """注册面试相关工具"""

    @mcp.tool()
    async def zhiping_start_ai_interview(
        candidate_id: int,
        job_id: int,
    ) -> dict:
        """启动AI预筛选面试

        Args:
            candidate_id: 候选人ID
            job_id: 岗位ID

        Returns:
            面试问题和相关信息
        """
        result = await client.request("POST", "/interview/start", data={
            "candidate_id": candidate_id,
            "job_id": job_id,
        })
        return result

    @mcp.tool()
    async def zhiping_submit_interview_answers(
        interview_id: int,
        answers: list[dict],
    ) -> dict:
        """提交AI面试答案并获取评估结果

        Args:
            interview_id: 面试ID
            answers: 答案列表，每个元素包含question_id和answer

        Returns:
            AI评估结果，包含通过/不通过建议和详细反馈
        """
        result = await client.request("POST", "/interview/submit", data={
            "interview_id": interview_id,
            "answers": answers,
        })
        return result

    @mcp.tool()
    async def zhiping_get_interview_report(interview_id: int) -> dict:
        """获取AI面试报告

        Args:
            interview_id: 面试ID

        Returns:
            面试报告，包含问题、答案、评分和建议
        """
        result = await client.request("GET", f"/interview/{interview_id}")
        return result

    @mcp.tool()
    async def zhiping_get_interview_guide(
        job_id: int,
        candidate_id: int,
        round: str = "round_1",
    ) -> dict:
        """获取面试指引（重点考察领域、问题、风险点）

        Args:
            job_id: 岗位ID
            candidate_id: 候选人ID
            round: 面试轮次 (round_1/round_2/round_3/additional/hr/business/technical)

        Returns:
            面试指引信息
        """
        result = await client.request("GET", "/interview/guide", params={
            "job_id": job_id,
            "candidate_id": candidate_id,
            "round": round,
        })
        return result

    @mcp.tool()
    async def zhiping_submit_interviewer_feedback(
        candidate_id: int,
        job_id: int,
        round: str,
        score: int,
        passed: bool,
        reason_tags: Optional[list[str]] = None,
        evaluation: Optional[str] = None,
    ) -> dict:
        """提交面试官反馈

        Args:
            candidate_id: 候选人ID
            job_id: 岗位ID
            round: 面试轮次
            score: 评分（1-100）
            passed: 是否通过
            reason_tags: 原因标签（可选）
            evaluation: 评价内容（可选）

        Returns:
            提交结果
        """
        data = {
            "candidate_id": candidate_id,
            "job_id": job_id,
            "round": round,
            "score": score,
            "passed": passed,
        }
        if reason_tags:
            data["reason_tags"] = reason_tags
        if evaluation:
            data["evaluation"] = evaluation

        result = await client.request("POST", "/interview/feedback", data=data)
        return result

    @mcp.tool()
    async def zhiping_list_interviews(
        candidate_id: Optional[int] = None,
        job_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """获取面试列表（AI面试+面试官反馈）

        Args:
            candidate_id: 候选人ID筛选（可选）
            job_id: 岗位ID筛选（可选）
            page: 页码（默认1）
            per_page: 每页数量（默认20）

        Returns:
            面试列表
        """
        params = {"page": page, "per_page": per_page}
        if candidate_id:
            params["candidate_id"] = candidate_id
        if job_id:
            params["job_id"] = job_id

        result = await client.request("GET", "/interviews", params=params)
        return result

    @mcp.tool()
    async def zhiping_list_interviewers() -> dict:
        """获取可用面试官列表

        Returns:
            面试官列表
        """
        result = await client.request("GET", "/interview/interviewers")
        return result

    @mcp.tool()
    async def zhiping_create_interview_assignment(
        candidate_id: int,
        job_id: int,
        interviewer_id: int,
        round: str,
        scheduled_at: Optional[str] = None,
    ) -> dict:
        """创建面试安排

        Args:
            candidate_id: 候选人ID
            job_id: 岗位ID
            interviewer_id: 面试官用户ID
            round: 面试轮次
            scheduled_at: 预约时间（ISO格式，可选）

        Returns:
            创建结果
        """
        data = {
            "candidate_id": candidate_id,
            "job_id": job_id,
            "interviewer_id": interviewer_id,
            "round": round,
        }
        if scheduled_at:
            data["scheduled_at"] = scheduled_at

        result = await client.request("POST", "/interview/assignments", data=data)
        return result

    @mcp.tool()
    async def zhiping_list_interview_assignments() -> dict:
        """获取面试安排列表

        Returns:
            面试安排列表
        """
        result = await client.request("GET", "/interview/assignments")
        return result
