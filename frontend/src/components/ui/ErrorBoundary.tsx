// 全局错误边界：防止路由级组件抛错（含懒加载 chunk 加载失败）导致整站白屏。
// chunk 加载失败常见于发布后浏览器仍缓存旧 index.html 引用了已被替换的旧
// chunk 文件名；此时提示用户刷新即可恢复，而不是卡在一片空白无法自救。
import { Component, type ReactNode } from 'react';
import { Button } from './Button';
import { Card, CardBody } from './Card';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  return /Failed to fetch dynamically imported module|Loading chunk|dynamically imported module/i.test(
    error.message
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] 页面渲染出错：', error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const chunkError = isChunkLoadError(this.state.error);
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
          <Card className="max-w-md">
            <CardBody className="space-y-4 text-center">
              <div className="text-body font-medium text-ink">
                页面加载出错
              </div>
              <p className="text-body-sm text-muted">
                {chunkError
                  ? '页面资源加载失败，通常是网络波动或系统刚发布新版本导致。刷新页面即可恢复。'
                  : this.state.error?.message || '发生未知错误，请刷新页面重试。'}
              </p>
              <Button onClick={this.handleReload}>刷新页面</Button>
            </CardBody>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
