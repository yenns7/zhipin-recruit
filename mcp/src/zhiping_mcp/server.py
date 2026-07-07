"""智聘招聘管理系统 MCP 服务器主文件

这个MCP服务器将智聘后端API封装为标准化工具，供AI助手（如Claude）和第三方应用调用。

支持的传输方式：
- stdio: 用于本地AI助手集成（如Claude Desktop）
- HTTP/SSE: 用于远程调用
"""

import argparse
import sys
from mcp.server import Server
from mcp.server.stdio import stdio_server

from .tools import (
    register_auth_tools,
    register_candidate_tools,
    register_job_tools,
    register_pipeline_tools,
    register_interview_tools,
    register_boss_tools,
    register_bi_tools,
    register_admin_tools,
    register_agent_tools,
    register_notification_tools,
)


def create_server() -> Server:
    """创建并配置MCP服务器"""
    server = Server(
        name="zhiping-mcp",
        version="0.1.0",
    )

    # 注册所有工具模块
    register_auth_tools(server)
    register_candidate_tools(server)
    register_job_tools(server)
    register_pipeline_tools(server)
    register_interview_tools(server)
    register_boss_tools(server)
    register_bi_tools(server)
    register_admin_tools(server)
    register_agent_tools(server)
    register_notification_tools(server)

    return server


async def run_stdio():
    """以stdio模式运行服务器"""
    server = create_server()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


def main():
    """主入口函数"""
    parser = argparse.ArgumentParser(
        description="智聘招聘管理系统 MCP 服务器"
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default="stdio",
        help="传输方式（默认stdio）",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="SSE模式监听地址（默认127.0.0.1）",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="SSE模式监听端口（默认8080）",
    )

    args = parser.parse_args()

    import asyncio

    if args.transport == "stdio":
        asyncio.run(run_stdio())
    elif args.transport == "sse":
        # SSE模式需要额外依赖
        try:
            from mcp.server.sse import SseServerSettings, sse_server

            async def run_sse():
                server = create_server()
                sse_settings = SseServerSettings(
                    host=args.host,
                    port=args.port,
                )
                async with sse_server(sse_settings) as (read_stream, write_stream):
                    await server.run(
                        read_stream,
                        write_stream,
                        server.create_initialization_options(),
                    )

            asyncio.run(run_sse())
        except ImportError:
            print("SSE模式需要安装额外依赖：pip install 'mcp[cli]'", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
