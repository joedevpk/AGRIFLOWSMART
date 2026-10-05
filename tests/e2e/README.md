# Tests E2E (Playwright) — NON EXÉCUTÉS dans le dépôt livré

Aucun navigateur n'était disponible lors de la passe 24 : ces parcours sont **écrits mais jamais lancés**. Les sélecteurs (libellés de
boutons) sont déduits du code et peuvent demander des ajustements au premier vrai passage.

```bash
npm run build && npm run preview &                     # frontend de test sur http://localhost:4173
npx playwright install chromium                        # une fois
E2E_BASE_URL=http://localhost:4173 npm run test:e2e    # parcours en lecture seule (sans compte)
```

Parcours qui écrivent (publication, commande, statuts) : **staging uniquement**.
`E2E_ALLOW_WRITES=1`, `E2E_FORBIDDEN_HOSTS=<hôtes de production>` (le test refuse de s'y exécuter), comptes dédiés
`E2E_BUYER_EMAIL/PASSWORD`, `E2E_PRODUCER_EMAIL/PASSWORD`, `E2E_ADMIN_EMAIL/PASSWORD`.
Parcours « producteur absent » : en plus `E2E_ORDER_ID` (commande `pending` de staging dont `confirmation_deadline` a été mise dans le passé),
`E2E_SUPABASE_URL` et `E2E_SUPABASE_SERVICE_ROLE_KEY` **du staging** (secret CI uniquement, jamais dans le frontend).
Aucune donnée de test n'est présentée comme réelle : tout est créé dans le staging avec des comptes marqués test.
