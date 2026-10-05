import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, Home } from 'lucide-react';
import { reportError } from '@/lib/logger';

interface Props {
  children: ReactNode;
  /** Quand cette valeur change (ex. nouvelle route), l'erreur est effacée et l'enfant est rendu de nouveau. */
  resetKey?: string;
}
interface State { failed: boolean }

/**
 * Error Boundary global. En cas d'exception de rendu : page de récupération claire, sans stack trace ni secret.
 * Le détail technique (message + pile des composants) est uniquement journalisé via le logger (masqué des secrets).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError('ErrorBoundary', error, { fn: 'render', componentStack: info.componentStack?.split('\n').slice(0, 6).join(' | ') });
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div role="alert" className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-card">
          <h1 className="text-xl font-bold text-charcoal">Une erreur inattendue est survenue.</h1>
          <p className="mt-2 text-sm text-charcoal/75">Vos données n&apos;ont pas été perdues. Vous pouvez réessayer ou revenir à l&apos;accueil.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={() => this.setState({ failed: false })} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Réessayer
            </button>
            <button type="button" onClick={() => window.location.assign('/')} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-5 text-sm font-semibold text-charcoal hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
              <Home className="h-4 w-4" aria-hidden="true" /> Retour à l&apos;accueil
            </button>
          </div>
        </div>
      </main>
    );
  }
}
