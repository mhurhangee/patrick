/**
 * Default editor state displays — the loading, empty-placeholder, and
 * parse-error screens DocxEditor falls back to when there's no document yet,
 * none loaded, or one that failed to parse.
 */

import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import type React from 'react';

export function DefaultLoadingIndicator(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 font-sans text-muted-foreground">
      <Loader2 className="size-9 animate-spin text-primary" />
      <div className="text-sm">Loading document…</div>
    </div>
  );
}

export function DefaultPlaceholder(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center font-sans text-muted-foreground">
      <FileText className="size-16" strokeWidth={1.5} />
      <div className="mt-4">No document loaded</div>
    </div>
  );
}

export function ParseError({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center p-5 text-center font-sans">
      <AlertCircle className="size-12 text-destructive" />
      <h3 className="mt-4 mb-2 font-medium text-destructive">Failed to load document</h3>
      <p className="max-w-[400px] text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
