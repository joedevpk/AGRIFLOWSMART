// Déclarations minimales de l'API Deno utilisée par les Edge Functions, pour les vérifier avec `tsc` sans installer Deno
// (`npm run typecheck:edge`). Ce n'est PAS un remplacement du runtime : les fonctions s'exécutent sous Deno chez Supabase.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
