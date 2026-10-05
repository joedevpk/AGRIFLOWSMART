import { AlertTriangle } from 'lucide-react';

/**
 * Affichée à la place de l'application quand la configuration publique est incomplète.
 * Volontairement autonome (aucun contexte, aucun appel réseau) et sans détail technique : les noms de variables
 * en cause sont uniquement journalisés (voir `main.tsx`), jamais affichés, et aucune valeur n'est jamais lue ici.
 */
export function ConfigErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-8 text-center shadow-card">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-charcoal">Configuration de l&apos;application incomplète.</h1>
        <p className="mt-2 text-sm text-charcoal/75">
          AgriFlow RDC ne peut pas démarrer pour le moment. Réessayez dans quelques minutes ; si le problème persiste, contactez l&apos;équipe technique.
        </p>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
          Réessayer
        </button>
      </div>
    </main>
  );
}
