/**
 * Catches a crash in one page (or the map) so the rest of the app keeps working, and offers a way
 * back. Keyed by the URL, so moving to another page clears the error.
 */
import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Shorter message for embedded areas such as the map. */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

class Boundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Page error:", error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // A failed lazy import usually means a new version was deployed (or the dev server rebuilt).
    const stale = /dynamically imported module|Importing a module script failed/i.test(error.message);
    return (
      <div role="alert" className="flex h-full min-h-48 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto size-7 text-warn" strokeWidth={1.5} aria-hidden />
          <p className="mt-2 font-medium">{stale ? "This part of the app was updated" : "Something on this page failed"}</p>
          {!this.props.compact ? (
            <p className="mt-1 text-sm text-muted">
              {stale ? "Reload to get the latest version." : "The rest of SafeRoute still works. Reload the page, or go to another page."}
            </p>
          ) : null}
          <Button className="mt-4" variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}

export function ErrorBoundary({ children, compact }: Props) {
  const { pathname } = useLocation();
  return (
    <Boundary key={pathname} compact={compact}>
      {children}
    </Boundary>
  );
}
