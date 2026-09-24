import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#E8E6DD] text-[#273844] p-6 font-mono">
          <div className="bg-white p-6 rounded-2xl border border-red-300 shadow-md max-w-xl w-full">
            <h2 className="text-lg font-bold text-red-600 mb-2">Application Error</h2>
            <p className="text-sm text-gray-700 mb-4">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto text-gray-800 mb-4 max-h-48">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#4A6B78] text-white rounded-lg text-xs font-semibold hover:opacity-90"
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
