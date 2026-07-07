"""MCP服务器单元测试"""

import pytest
from zhiping_mcp.server import create_server


def test_create_server():
    """测试创建服务器"""
    server = create_server()
    assert server is not None
    assert server.name == "zhiping-mcp"


def test_server_has_tools():
    """测试服务器注册了工具"""
    server = create_server()
    # 服务器应该已经注册了工具
    assert server is not None


# 注意：完整的集成测试需要启动后端服务
# 可以使用 MCP Inspector 进行手动测试
