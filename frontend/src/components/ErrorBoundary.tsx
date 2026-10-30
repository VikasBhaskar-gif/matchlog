import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  resetKeys?: any[];
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an uncaught error:", error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && this.props.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, i) => !prevProps.resetKeys || key !== prevProps.resetKeys[i]
      );
      if (hasChanged) {
        this.reset();
      }
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 max-w-xl mx-auto my-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center shadow-lg">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-xl text-red-400">
            ⚠️
          </div>
          <h2 className="text-lg font-bold text-[var(--color-text)] mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-[var(--color-text-dim)] mb-4">
            An unexpected error occurred while displaying this section. Your data is safe.
          </p>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--color-primary)] text-black hover:brightness-110 transition-all"
            >
              Try Again
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-surface-2)] text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-text-dim)] transition-all"
            >
              Return Home
            </a>
          </div>

          {this.state.error?.message && (
            <details className="mt-4 text-left text-xs text-[var(--color-text-dim)] bg-black/30 rounded-lg p-2.5 font-mono overflow-x-auto">
              <summary className="cursor-pointer text-[11px] font-semibold text-[var(--color-text-dim)] hover:text-white">
                Technical details
              </summary>
              <p className="mt-2 text-red-300 break-words whitespace-pre-wrap">
                {this.state.error.message}
              </p>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
