# Tests de charge (k6) — NON EXÉCUTÉS dans le dépôt livré

k6 n'était pas installé et aucun environnement de staging n'était disponible lors de la passe 24 : **aucun résultat de charge n'existe**.
Ne jamais écrire « test de charge réussi » avant d'avoir lancé ces scénarios sur un staging avec les seuils respectés.

**Règle absolue : jamais sur la production.** Chaque scénario refuse de démarrer sans `K6_CONFIRM_NOT_PRODUCTION=yes` et refuse un hôte listé
dans `K6_FORBIDDEN_HOSTS`. Le plan Supabase gratuit/limité peut être saturé ou bloqué par une charge forte : monter par paliers.

```bash
export K6_SUPABASE_URL=https://<staging>.supabase.co K6_SUPABASE_ANON_KEY=<anon staging> K6_CONFIRM_NOT_PRODUCTION=yes \
       K6_FORBIDDEN_HOSTS=<ref-production>.supabase.co
k6 run tests/load/marketplace.js                 # lecture : liste paginée, recherche, fiche produit
k6 run tests/load/edge-functions.js              # comportement défensif des Edge Functions (aucun paiement réel)
K6_USER_EMAIL=... K6_USER_PASSWORD=... k6 run tests/load/login.js
K6_ALLOW_WRITES=yes K6_USER_EMAIL=... K6_USER_PASSWORD=... K6_PRODUCT_ID=<uuid> k6 run tests/load/checkout.js   # ÉCRIT des commandes
```
Seuils par défaut : < 1 % d'erreurs, p95 < 800 ms (lecture). À relever dans `docs/PRODUCTION-CHECKLIST.md` après un vrai passage.
