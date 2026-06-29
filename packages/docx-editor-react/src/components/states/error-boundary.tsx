/**
 * ErrorBoundary — catches render errors in the editor subtree and shows a
 * recoverable fallback (the only error UI the editor actually renders). The
 * fallback is built on @patrick/ui's Empty + Button so it inherits Patrick's
 * tokens (incl. dark mode) instead of the legacy `--doc-*` chrome.
 */

import { Button } from '@patrick/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@patrick/ui/components/empty';
import { AlertCircle } from 'lucide-react';
import { Component, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Custom fallback UI */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Callback when an error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show the error details / component stack */
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      const { fallback, showDetails = true } = this.props;
      const { error, errorInfo } = this.state;

      if (fallback) {
        return typeof fallback === 'function' ? fallback(error!, this.resetError) : fallback;
      }

      return (
        <EditorErrorFallback
          error={error!}
          errorInfo={errorInfo}
          showDetails={showDetails}
          onReset={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}

function EditorErrorFallback({
  error,
  errorInfo,
  showDetails,
  onReset,
}: {
  error: Error;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Empty className="m-5 rounded-lg border font-sans">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="text-destructive">
          <AlertCircle />
        </EmptyMedia>
        <EmptyTitle className="text-lg">Something went wrong</EmptyTitle>
        <EmptyDescription>
          An error occurred while rendering this part of the editor. Try again, or reload the
          document if the problem persists.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {showDetails && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide details' : 'Show details'}
            </Button>
            {expanded && (
              <pre className="max-h-[200px] w-full max-w-[600px] overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-left font-mono text-xs text-muted-foreground">
                <strong>Error:</strong> {error.message}
                {errorInfo && (
                  <>
                    {'\n\n'}
                    <strong>Component stack:</strong>
                    {errorInfo.componentStack}
                  </>
                )}
              </pre>
            )}
          </>
        )}
        <Button size="sm" onClick={onReset}>
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  );
}
