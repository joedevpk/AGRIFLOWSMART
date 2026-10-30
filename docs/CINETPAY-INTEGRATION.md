# Intégration CinetPay — architecture, configuration, activation

**État : prêt à être activé, NON activé.** Le compte marchand n'est pas ouvert et aucune clé n'existe. Tant que les secrets sont absents ou que
`PAYMENTS_ONLINE_ENABLED` n'est pas `true`, **aucun paiement en ligne n'est proposé, créé ni simulé** : le checkout affiche « Le paiement en ligne n'est
pas encore activé » et propose le paiement à la livraison. Aucun appel réel à CinetPay n'a été réalisé pendant ce travail.

API retenue : **API de paiement CinetPay 1.0** (`https://api-checkout.cinetpay.com/v2/payment` et `/v2/payment/check`), documentation :
<https://docs.cinetpay.com/>. Pages consultées : initialisation, vérification, notification, HMAC, tableau des moyens/limites.

## 1. Ce qui existait (audité et réutilisé)

Adaptateur `_shared/cinetpay.ts`, fonctions `payment-initiate`, `payment-webhook`, `payment-verify`, `payment-refund`, cron de réconciliation, RPC `payment_*`
(idempotence par `payment_events`, contrôle montant/devise, machine d'états, bail d'initiation), RLS, page `/payment/result/:reference`. Le parcours démo
a été retiré dans une passe précédente (seuls des `demo_paid` historiques subsistent ; aucune fonction n'en crée — vérifié par test).

## 2. Défauts trouvés et corrigés

| Défaut | Gravité | Correction |
|---|---|---|
| **Signature HMAC incomplète** : la liste de champs omettait `cpm_designation` et `cpm_error_message`, présents dans la liste officielle. Toute notification authentique aurait été rejetée silencieusement (réponse 200, rien enregistré) ; seuls le polling de la page de retour et le cron auraient confirmé les paiements | Élevée | Liste complète ; test de régression avec signature calculée indépendamment (la mutation est détectée) |
| `Math.round(amount)` à l'initiation : un montant décimal (USD 99,99) aurait été facturé 100 puis refusé à la vérification (écart de montant) | Élevée | Plus d'arrondi : montant validé selon les règles du prestataire, sinon refus explicite `AMOUNT_NOT_SUPPORTED` |
| Règles de montant ignorées (multiple de 5 hors USD, bornes CDF 100–2 000 000) | Moyenne | `validateCinetpayAmount`, appliqué avant tout appel |
| Activation du paiement en ligne = simple réglage en base, sans lien avec les secrets : un moyen pouvait être proposé sans clés, et une tentative de paiement était créée avant l'erreur `CONFIG_MISSING` | Moyenne | Contrôle d'activation **avant** toute écriture ; fonction `payment-status` ; options non sélectionnables côté acheteur |
| Aucun en-tête `User-Agent` explicite (la doc signale une erreur d'API sans lui) | Faible | Ajouté |
| Corps de notification brut (signature, téléphone, identifiant marchand) stocké dans `payment_events.raw` | Faible | Minimisé (`redactNotification`) |
| Page de retour : pas d'état « erreur technique », `demo_paid` affiché comme « confirmé », `refunded` comme « en attente » | Moyenne | États `error`, `demo`, `refunded` ajoutés |

## 3. Architecture

```
Navigateur ── payment-status ──► état d'activation (sans configuration)
          ── payment-initiate ─► handlers.ts ─► registry.ts ─► PaymentProvider (cinetpayProvider.ts ─► cinetpay.ts)
          ── payment-verify ───►      │                                   │
CinetPay ──► payment-webhook ───►      └─► RPC payment_* (service_role) ◄──┘   (montant, devise, commande, idempotence)
```

- `supabase/functions/_shared/payments/types.ts` — interface `PaymentProvider` (init, vérification serveur, authenticité d'une notification, référence, règles de montant). Remboursement volontairement absent : aucune API documentée en 1.0.
- `cinetpayProvider.ts` — adaptateur séparé de la logique métier ; `registry.ts` — sélection par `PAYMENT_PROVIDER` (défaut `cinetpay` ; toute autre valeur désactive les paiements). **Aucun prestataire de simulation dans le code déployé** : les simulations n'existent que dans `src/test/`.
- `handlers.ts` — logique des quatre fonctions, dépendances injectées (testable sans réseau ni base). Les fichiers `payment-*/index.ts` sont de minces enveloppes.
- Le métier (commandes, commissions figées, statuts, idempotence) reste en base, dans les RPC existantes ; **aucune migration n'a été ajoutée** pour cette mission.

Invariants : le navigateur ne fournit jamais montant, devise, statut ni référence prestataire ; rien n'est payé sans vérification serveur auprès de CinetPay puis application par `payment_apply_result` (réservé à `service_role`) ; la commission n'est comptée qu'une fois (instantané à la commande, événement comptable unique) ; aucune conversion de devise.

## 4. États d'activation (`payment-status`)

| État | Cause | Effet |
|---|---|---|
| `not_configured` | un des trois secrets absent, vide ou factice (`xxx`, `changeme`, `test`…) | aucun moyen en ligne ; webhook et vérification répondent 503 (rejouables) |
| `disabled` | secrets présents, `PAYMENTS_ONLINE_ENABLED` ≠ `true` | aucun **nouveau** paiement ; les notifications de paiements déjà initiés restent traitées |
| `unsupported_provider` | `PAYMENT_PROVIDER` inconnu | aucun moyen en ligne |
| `enabled` | secrets présents **et** `PAYMENTS_ONLINE_ENABLED=true` | mobile money proposable ; carte seulement avec `CINETPAY_CARD_ENABLED=true` |

La production n'est **jamais** activée implicitement. Retour arrière immédiat : `PAYMENTS_ONLINE_ENABLED=false`.

## 5. Variables d'environnement (secrets Supabase uniquement)

| Variable | Rôle |
|---|---|
| `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET_KEY` | identifiants marchands (à obtenir de CinetPay) |
| `CINETPAY_BASE_URL` | défaut `https://api-checkout.cinetpay.com` |
| `PAYMENTS_ONLINE_ENABLED` | `true` pour activer ; défaut désactivé |
| `CINETPAY_CARD_ENABLED` | opt-in distinct de la carte (voir §9) |
| `PAYMENT_PROVIDER` | défaut `cinetpay` |
| `FRONTEND_URL` | URL publique du site (retour de paiement et CORS) |

Jamais dans le code client, dans Git, dans `render.yaml` ni dans une variable `VITE_*`. Les journaux ne contiennent que des **noms** de secrets manquants, jamais leurs valeurs.

## 6. Configuration Supabase

1. Projet de **préproduction** d'abord. `supabase db push` (migrations existantes, aucune nouvelle ici).
2. `supabase secrets set` des variables ci-dessus (laisser `PAYMENTS_ONLINE_ENABLED=false` au départ).
3. Déployer les fonctions : `payment-status`, `payment-initiate`, `payment-webhook`, `payment-verify`, `payment-refund`, `order-confirmation-cron` (`supabase/config.toml` : JWT désactivé uniquement pour `payment-webhook` et le cron).
4. Dans l'administration : vérifier que `enabled_methods` et `method_currencies` ne contiennent que ce que CinetPay a confirmé pour votre compte.

## 7. URLs à déclarer

| Rôle | URL |
|---|---|
| Notification (`notify_url`, envoyée à chaque initiation) | `https://<projet>.supabase.co/functions/v1/payment-webhook` (HTTPS public ; doit répondre 200 au GET de contrôle) |
| Retour (`return_url`) | `https://<votre-domaine>/payment/result/<internal_reference>` (construite par le serveur) |

## 8. Procédure de test

**Sans compte (disponible maintenant)** : `npm test` (adaptateur, signature, activation, règles de montant, gestionnaires, états de page), `npm run typecheck:edge`, `bash supabase/tests/run-all.sh` (sécurité des paiements, idempotence, commissions). Toutes les données de test sont marquées `SIMULATED` et ne peuvent pas atteindre la production.

**Avec un compte activé (préproduction uniquement)** :
1. Secrets réels, `PAYMENTS_ONLINE_ENABLED=true` en préproduction. `payment-status` doit répondre `enabled`.
2. Paiement du montant minimum autorisé (CDF : 100) avec un vrai numéro de test. Vérifier : tentative `pending` → `processing` → `paid`, un seul `payment_confirmed` dans `financial_events`, notification au producteur.
3. Rejouer la notification (même corps) : aucun doublon. Falsifier le `x-token` : rejet sans écriture.
4. Refuser/annuler un paiement : états `failed`/`cancelled`, message correct sur la page de retour.
5. Couper le réseau pendant la vérification : état « erreur technique temporaire », pas de statut inventé.

## 9. Passage en production

1. Obtenir de CinetPay, **par écrit** : version d'API associée à votre compte, devises et moyens activés (CDF ? USD ? mobile money par opérateur), plafonds, moyens à exclure.
2. Définir la règle d'arrondi des montants (voir §10) ; valider le taux de commission (passe 1) — sans règle approuvée, les paiements sont acceptés mais le règlement reste `on_hold`.
3. Sauvegarde de la base ; secrets de production ; déploiement des fonctions ; **puis seulement** `PAYMENTS_ONLINE_ENABLED=true`.
4. Premier paiement réel de faible montant par un administrateur, avec autorisation explicite.

**Contrôles après activation** : page Finance → Rapprochement (aucune divergence `error`) ; `payment_events` sans `AMOUNT_MISMATCH`/`CURRENCY_MISMATCH` ; aucun paiement `processing` de plus de 2 h ; webhooks reçus (journaux Edge) ; commission et événements comptables uniques ; surveillance des paiements bloqués pendant 7 jours.

## 10. Limites et points à confirmer auprès de CinetPay

- **Génération d'API** : la documentation 1.0 est utilisée. CinetPay propose aussi un SDK/une plateforme plus récents (nouvelle API, jetons) ; **confirmer quelle API est associée à votre compte**. Un compte créé sur la nouvelle plateforme pourrait exiger une autre intégration.
- **Montants** : CDF entier, multiple de 5, 100 à 2 000 000 par paiement (documentation) ; USD entier uniquement par prudence (décimales non documentées). **Un total de commande non conforme est refusé en ligne** (paiement à la livraison proposé) : une règle d'arrondi des prix ou des totaux est à décider — non inventée ici.
- **Devises et moyens** : disponibilité de CDF et de chaque opérateur dépendante du compte ; carte Visa/Mastercard **en CDF non confirmée** → désactivée par défaut. La carte exige en plus des champs client (adresse, ville, pays, état, code postal) non envoyés aujourd'hui.
- **Remboursements** : aucune API documentée pour la 1.0 → circuit manuel (`payment-refund` + administration), jamais marqué réussi sans traitement confirmé.
- **Reversements aux producteurs** : non implémentés ; CinetPay ne répartit pas l'argent automatiquement.
- **Frais du prestataire** : non récupérés (affichés « non suivis »).
- **Réglage `cinetpay_environment`** (« sandbox » par défaut en base) : informatif, sans effet sur le code ; l'URL de l'API ne change pas. Ne pas s'y fier pour savoir si l'on est en production.
- **Adresses IP / réémission des notifications** : comportement exact de rejeu de CinetPay non vérifié ; le traitement est idempotent quel que soit le nombre d'envois.
