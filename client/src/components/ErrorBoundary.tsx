import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw, ArrowLeft, Bug } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Optional context label for error reporting (e.g. "Results page") */
  context?: string;
  /** Optional fallback override */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

/**
 * ErrorBoundary — catches React render errors and shows a friendly recovery UI.
 *
 * Usage:
 *   <ErrorBoundary context="Results page">
 *     <Results />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.setState({ componentStack: info.componentStack });
    // Log to console with context for easier debugging
    const ctx = this.props.context ?? "Unknown";
    console.error(`[ErrorBoundary][${ctx}] Render error:`, error, info.componentStack);
  }

  handleReload = () => window.location.reload();
  handleGoHome = () => { window.location.href = "/"; };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const isDev = import.meta.env.DEV;
    const errorMessage = this.state.error?.message ?? "Nieznany błąd";

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-6">
          {/* Icon + heading */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Coś poszło nie tak</h1>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Wystąpił nieoczekiwany błąd podczas renderowania tej strony.
                Twoje dane są bezpieczne — spróbuj odświeżyć lub wróć do strony głównej.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={this.handleReload} className="flex-1 gap-2" variant="default">
              <RefreshCw className="w-4 h-4" />
              Odśwież stronę
            </Button>
            <Button onClick={this.handleGoHome} className="flex-1 gap-2" variant="outline">
              <ArrowLeft className="w-4 h-4" />
              Wróć do strony głównej
            </Button>
          </div>

          {/* Dev-only error details */}
          {isDev && (
            <details className="rounded-lg border border-border bg-muted/30 p-4 text-xs">
              <summary className={cn(
                "flex items-center gap-2 cursor-pointer font-medium",
                "text-muted-foreground hover:text-foreground select-none"
              )}>
                <Bug className="w-3.5 h-3.5" />
                Szczegóły błędu (tylko dev)
              </summary>
              <div className="mt-3 space-y-2">
                <div>
                  <span className="font-semibold text-destructive">Error: </span>
                  <span className="text-foreground font-mono">{errorMessage}</span>
                </div>
                {this.state.componentStack && (
                  <pre className="overflow-auto max-h-48 text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {this.state.componentStack}
                  </pre>
                )}
              </div>
            </details>
          )}

          {/* Support hint */}
          <p className="text-center text-xs text-muted-foreground">
            Jeśli problem się powtarza, skontaktuj się z nami podając kod błędu:{" "}
            <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">
              {errorMessage.slice(0, 40)}
            </code>
          </p>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
