import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional label so logs identify which boundary tripped. */
  scope?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors below it and shows a recoverable fallback
 * instead of a blank white screen. Wrap the router (and any risky subtree).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep this as the single reporting seam — swap in Sentry/etc. here.
    console.error(
      `[ErrorBoundary${this.props.scope ? `:${this.props.scope}` : ""}]`,
      error,
      info.componentStack,
    );
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunkError =
      /Loading chunk|dynamically imported module|Failed to fetch/i.test(
        error.message,
      );

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">
            {isChunkError ? "Update available" : "Something went wrong"}
          </h1>

          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            {isChunkError
              ? "A newer version of the app has been deployed. Reload to get the latest files."
              : "An unexpected error occurred. You can retry, or head back to the dashboard."}
          </p>

          {import.meta.env.DEV && (
            <pre className="text-left text-[11px] bg-secondary rounded-xl p-3 mb-6 overflow-auto max-h-40 text-muted-foreground">
              {error.message}
            </pre>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={
                isChunkError ? () => window.location.reload() : this.reset
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-4 h-4" />
              {isChunkError ? "Reload" : "Try again"}
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
