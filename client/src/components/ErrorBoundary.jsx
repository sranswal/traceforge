import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[TraceForge:ErrorBoundary] Uncaught component render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <div className="p-6 my-4 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-slate-800 dark:text-slate-100 shadow-lg space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                Workspace Render Error Encountered
              </h3>
              <p className="text-xs text-rose-700 dark:text-rose-300">
                A rendering exception occurred in this workspace view. The incident data and application state have been preserved.
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="p-3 rounded-lg bg-white dark:bg-[#0c101a] border border-rose-200 dark:border-rose-900/40 text-[11px] font-mono text-rose-800 dark:text-rose-300 overflow-x-auto max-h-40">
              {this.state.error.toString()}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Rendering</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
