"""岗位相关MCP工具"""

from typing import Optional
from mcp.server import Server
from ..client import client


def register_job_tools(mcp: Server):
    """注册岗位相关工具"""

    @mcp.tool()
    async def zhiping_list_jobs(
        status: Optional[str] = None,
        keyword: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """获取岗位列表

        Args:
            status: 岗位状态筛选 (open/closed)
            keyword: 搜索关键词（职位名称等）
            page: 页码（默认1）
            per_page: 每页数量（默认20）

        Returns:
            岗位列表和分页信息
        """
        params = {"page": page, "per_page": per_page}
        if status:
            params["status"] = status
        if keyword:
            params["keyword"] = keyword

        result = await client.request("GET", "/jobs", params=params)
        return result

    @mcp.tool()
    async def zhiping_get_job(job_id: int) -> dict:
        """获取岗位详细信息

        Args:
            job_id: 岗位ID

        Returns:
            岗位详细信息，包括结构化JD
        """
        result = await client.request("GET", f"/jobs/{job_id}")
        return result

    @mcp.tool()
    async def zhiping_create_job(title: str, description: str, department: str = "", city: str = "") -> dict:
        """创建新岗位（自动生成结构化JD）

        Args:
            title: 职位名称
            description: 职位描述（JD）
            department: 部门（可选）
            city: 城市（可选）

        Returns:
            创建结果，包含岗位ID和结构化JD
        """
        data = {"title": title, "description": description}
        if department:
            data["department"] = department
        if city:
            data["city"] = city

        result = await client.request("POST", "/jobs", data=data)
        return result

    @mcp.tool()
    async def zhiping_update_job(
        job_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        department: Optional[str] = None,
        city: Optional[str] = None,
    ) -> dict:
        """更新岗位信息

        Args:
            job_id: 岗位ID
            title: 职位名称（可选）
            description: 职位描述（可选）
            department: 部门（可选）
            city: 城市（可选）

        Returns:
            更新结果
        """
        data = {}
        if title is not None:
            data["title"] = title
        if description is not None:
            data["description"] = description
        if department is not None:
            data["department"] = department
        if city is not None:
            data["city"] = city

        result = await client.request("PUT", f"/jobs/{job_id}", data=data)
        return result

    @mcp.tool()
    async def zhiping_close_job(job_id: int) -> dict:
        """关闭岗位

        Args:
            job_id: 岗位ID

        Returns:
            关闭结果
        """
        result = await client.request("POST", f"/jobs/{job_id}/close")
        return result

    @mcp.tool()
    async def zhiping_restore_job(job_id: int) -> dict:
        """恢复已关闭的岗位

        Args:
            job_id: 岗位ID

        Returns:
            恢复结果
        """
        result = await client.request("POST", f"/jobs/{job_id}/restore")
        return result

    @mcp.tool()
    async def zhiping_run_job_match(job_id: int) -> dict:
        """对岗位运行AI智能匹配

        Args:
            job_id: 岗位ID

        Returns:
            匹配结果，包含推荐候选人列表和匹配分数
        """
        result = await client.request("POST", f"/jobs/{job_id}/match")
        return result

    @mcp.tool()
    async def zhiping_preview_job_match(job_id: int) -> dict:
        """预览岗位匹配结果（只读）

        Args:
            job_id: 岗位ID

        Returns:
            预览匹配结果
        """
        result = await client.request("GET", f"/jobs/{job_id}/match-preview")
        return result

    @mcp.tool()
    async def zhiping_batch_add_to_pipeline(
        job_id: int,
        candidate_ids: list[int],
    ) -> dict:
        """批量将候选人添加到岗位招聘流程

        Args:
            job_id: 岗位ID
            candidate_ids: 候选人ID列表

        Returns:
            添加结果
        """
        result = await client.request("POST", f"/jobs/{job_id}/batch-pipeline", data={
            "candidate_ids": candidate_ids,
        })
        return result

    @mcp.tool()
    async def zhiping_clarify_job(description: str) -> dict:
        """对职位描述生成AI澄清问题（用于完善JD）

        Args:
            description: 职位描述文本

        Returns:
            AI生成的澄清问题列表
        """
        result = await client.request("POST", "/jobs/clarify", data={
            "description": description,
        })
        return result
