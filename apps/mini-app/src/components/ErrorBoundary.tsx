import { Component, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from '../ui';

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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-danger-soft text-danger flex items-center justify-center">
          <Icon name="alert" size={26} />
        </div>
        <p className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">
          Something went wrong
        </p>
        <p className="text-sm text-text-secondary max-w-xs break-words leading-relaxed">
          {this.state.error.message}
        </p>
        <Button className="mt-2" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
