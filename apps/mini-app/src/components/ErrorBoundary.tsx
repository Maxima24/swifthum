import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level safety net. Without this, any uncaught render error unmounts the
 * whole React tree and the Mini App shows a blank white screen — impossible to
 * recover from mid-demo. Here we show the error + a reload button instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-4xl">😵</div>
        <p className="font-semibold">Something went wrong</p>
        <p className="text-sm text-tg-hint max-w-xs break-words">
          {this.state.error.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-tg-button text-tg-button-text px-5 py-2 text-sm font-semibold"
        >
          Reload
        </button>
      </div>
    );
  }
}
