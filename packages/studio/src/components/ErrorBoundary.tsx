import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly error: Error | null;
  readonly errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.hash = "#/";
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      const isZh = typeof navigator !== "undefined" && navigator.language.startsWith("zh");
      return (
        <div className="min-h-screen w-full bg-[#0b0f19] text-foreground flex items-center justify-center p-6">
          <div className="max-w-xl w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-8 space-y-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/20 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-destructive">
                  {isZh ? "页面渲染遇到异常" : "Page Encountered an Error"}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isZh ? "已捕获未处理的运行时错误，不会造成应用崩溃。" : "Caught an unhandled runtime error."}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-border/40 font-mono text-xs text-red-300 overflow-x-auto max-h-48">
              {this.state.error?.message || "Unknown error"}
              {this.state.errorInfo?.componentStack && (
                <div className="mt-2 text-muted-foreground/60 text-[11px] whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                <RefreshCw size={14} />
                {isZh ? "重新加载" : "Reload Page"}
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors border border-border/40"
              >
                <Home size={14} />
                {isZh ? "返回首页" : "Go to Dashboard"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
