"""MCP工具模块"""

from .auth import register_auth_tools
from .candidates import register_candidate_tools
from .jobs import register_job_tools
from .pipeline import register_pipeline_tools
from .interview import register_interview_tools
from .boss import register_boss_tools
from .bi import register_bi_tools
from .admin import register_admin_tools
from .agent import register_agent_tools
from .notifications import register_notification_tools

__all__ = [
    "register_auth_tools",
    "register_candidate_tools",
    "register_job_tools",
    "register_pipeline_tools",
    "register_interview_tools",
    "register_boss_tools",
    "register_bi_tools",
    "register_admin_tools",
    "register_agent_tools",
    "register_notification_tools",
]
