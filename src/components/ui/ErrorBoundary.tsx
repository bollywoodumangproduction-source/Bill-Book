import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-medium text-rose-500 dark:text-rose-400">Something went wrong displaying this view.</p>
          <pre className="max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-rose-50 p-3 text-left text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{this.state.errorMessage || 'Unknown error'}</pre>
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
