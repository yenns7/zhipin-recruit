"""BI数据看板相关MCP工具"""

from typing import Optional
from mcp.server import Server
from ..client import client


def register_bi_tools(mcp: Server):
    """注册BI数据看板相关工具"""

    @mcp.tool()
    async def zhiping_bi_overview() -> dict:
        """获取招聘数据总览看板

        Returns:
            包含漏斗数据、员工绩效、渠道质量、面试官、部门、告警、需求健康度等综合数据
        """
        result = await client.request("GET", "/bi/overview")
        return result

    @mcp.tool()
    async def zhiping_bi_staff_performance(hr_id: Optional[int] = None) -> dict:
        """获取招聘专员绩效详情

        Args:
            hr_id: 招聘专员用户ID（可选，不传则查看自己）

        Returns:
            该招聘专员的详细绩效数据
        """
        params = {}
        if hr_id:
            params["hr_id"] = hr_id

        result = await client.request("GET", "/bi/staff", params=params)
        return result

    @mcp.tool()
    async def zhiping_bi_job_funnel(job_id: int) -> dict:
        """获取单个岗位的招聘漏斗数据

        Args:
            job_id: 岗位ID

        Returns:
            该岗位的漏斗转化数据
        """
        result = await client.request("GET", f"/bi/job/{job_id}")
        return result
