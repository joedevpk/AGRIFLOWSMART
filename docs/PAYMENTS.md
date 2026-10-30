# Paiement AgriFlow RDC — CinetPay (production)

Ce document décrit l'architecture de paiement réelle mise en place à la
Passe 16. Elle remplace intégralement l'ancien chemin « démonstration »
(`payments.is_demo`, `payment_status = 'demo_paid'`), conservé uniquement pour
l'historique des commandes créées avant cette passe.

## 1. Principe général

Aucune donnée financière n'est décidée par le navigateur :

```
FRONTEND (React)
   │  checkout (revalidé par create_order_from_cart)
   ▼
SUPABASE (Postgres, RLS)          — commande créée, payment_status = 'pending'
   │
   │  "Payer maintenant"
   ▼
EDGE FUNCTION payment-initiate    — relit le montant/devise EN BASE, jamais depuis le client
   │
   ▼
CINETPAY  (/v2/payment)           — retourne une URL de paiement hébergée
   │
   ▼
FRONTEND redirige le navigateur vers cette URL (CinetPay, hors de l'app)
   │
   │  l'acheteur autorise le paiement sur son téléphone / sa carte
   ▼
CINETPAY
   │  notify_url (webhook)                     return_url
   ▼                                              ▼
EDGE FUNCTION payment-webhook              /payment/result/:reference
   │  vérifie HMAC, rappelle /v2/payment/check     │  interroge le backend,
   │  (jamais confiance au seul body du webhook)   │  n'affirme jamais seul
   ▼                                                ▼
RPC payment_apply_result (service_role)     EDGE FUNCTION payment-verify
   │  idempotente, vérifie montant/devise/commande, ne régresse jamais un paiement `paid`
   ▼
payments.status = 'paid' → orders.payment_status = 'paid' → orders.status = 'confirmed'
```

Le frontend ne peut **jamais** écrire `payments.status` ou
`orders.payment_status` directement (RLS : aucune policy UPDATE pour un
utilisateur non-admin sur ces colonnes ; triggers `protect_order_financial_fields`
en défense supplémentaire). Seules les fonctions `SECURITY DEFINER` listées
ci-dessous, appelées avec la clé `service_role` depuis les Edge Functions,
peuvent faire passer un paiement à `paid`.

## 2. Fournisseur : CinetPay

Intégré selon la documentation officielle (`docs.cinetpay.com/api/1.0-fr/checkout/*`,
consultée pour cette implémentation) :

| Étape | Endpoint | Utilisé par |
|---|---|---|
| Initialisation | `POST /v2/payment` | Edge Function `payment-initiate` |
| Vérification (source de vérité) | `POST /v2/payment/check` | Edge Functions `payment-webhook`, `payment-verify` |
| Notification | `notify_url` fournie à l'initialisation, appelée par CinetPay | Edge Function `payment-webhook` |

**Moyens de paiement en RDC** : dépendent entièrement du compte marchand
CinetPay (Orange Money, Airtel Money, M-Pesa via `channels: MOBILE_MONEY` ;
carte via `channels: CREDIT_CARD`, selon disponibilité). Aucun moyen n'est
supposé disponible côté code — voir `payment_settings` (§6).

**Devises** : la table `payment_settings.method_currencies` définit, pour
chaque moyen, les devises acceptées. Par défaut : Mobile Money en `CDF`
uniquement, aucune devise activée pour la carte (à activer après validation
du compte marchand). **Aucune conversion CDF ↔ USD n'est effectuée** : chaque
produit garde sa devise d'origine, et le paiement en ligne n'est proposé que
si la devise de la commande est explicitement activée pour ce moyen.

### HMAC du webhook

CinetPay signe chaque notification dans l'en-tête `x-token` :
`HMAC-SHA256(secret_key, cpm_site_id + cpm_trans_id + cpm_trans_date + cpm_amount + cpm_currency + signature + payment_method + cel_phone_num + cpm_phone_prefixe + cpm_language + cpm_version + cpm_payment_config + cpm_page_action + cpm_custom)`.
`payment-webhook` rejette silencieusement (HTTP 200, sans traitement) toute
notification dont le token ne correspond pas — voir
`supabase/functions/_shared/cinetpay.ts`.

Même après vérification du HMAC, le webhook **ne fait jamais confiance au
montant/statut du body** : il rappelle systématiquement `/v2/payment/check`
avant d'appliquer quoi que ce soit (conforme à la documentation CinetPay, qui
l'exige explicitement).

## 3. Variables d'environnement

### Frontend (`.env`, voir `.env.example`)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
Aucun secret de paiement ici — impossible par construction (clé anon = RLS).

### Edge Functions (secrets Supabase, voir `supabase/functions/.env.example`)
```
CINETPAY_API_KEY=
CINETPAY_SITE_ID=
CINETPAY_SECRET_KEY=
CINETPAY_BASE_URL=https://api-checkout.cinetpay.com
FRONTEND_URL=https://votre-domaine.example
PAYMENTS_ONLINE_ENABLED=false   # activation explicite (voir docs/CINETPAY-INTEGRATION.md)
```
À définir avec :
```bash
supabase secrets set --env-file supabase/functions/.env
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sont fournies
automatiquement par Supabase en production.

## 4. Compte marchand CinetPay — ce qu'il reste à faire

Cette implémentation est prête à recevoir de vraies clés, mais **rien n'est
fonctionnel tant que** :

1. Un compte marchand CinetPay est créé et validé (`app-new.cinetpay.com`).
2. Les moyens de paiement réellement disponibles pour ce compte (Orange
   Money, Airtel Money, M-Pesa, carte) sont confirmés par CinetPay pour la
   RDC et pour vos devises (`CDF`, éventuellement `USD`).
3. `CINETPAY_API_KEY` / `CINETPAY_SITE_ID` / `CINETPAY_SECRET_KEY` sont
   récupérées depuis le menu **Intégrations** du back-office CinetPay et
   configurées comme secrets Supabase (jamais dans Git).
4. La `notify_url` (`https://<votre-projet>.supabase.co/functions/v1/payment-webhook`)
   est joignable publiquement (déploiement des Edge Functions effectué :
   `supabase functions deploy payment-webhook`, etc.).
5. `payment_settings.enabled_methods` / `method_currencies` sont mis à jour
   via `admin_update_payment_settings` (aujourd'hui : seul `cash_on_delivery`
   est activé par défaut — voir §6).
6. Un paiement de test réel (petit montant, ou compte de test fourni par
   CinetPay si disponible) a été effectué de bout en bout.

Tant que ces points ne sont pas cochés, **ne pas** activer Mobile Money/carte
dans `payment_settings` en production : l'UI n'affichera alors que le
paiement à la livraison, ce qui est le comportement sûr par défaut.

## 5. Tables

### `payments` (existante, étendue)
| Colonne | Rôle |
|---|---|
| `internal_reference` | Référence AgriFlow unique (`AGF-PAY-YYYYMMDD-XXXXXXXX`), envoyée à CinetPay comme `transaction_id`. |
| `provider_transaction_id` | `payment_token` CinetPay (distinct de la référence interne). |
| `status` | `pending → processing → paid \| failed \| cancelled \| expired`, puis `refunded`. `demo_paid` conservé pour l'historique uniquement. |
| `checkout_url` | URL de paiement hébergée CinetPay (`payment_url`). |
| `provider_status` | Dernier statut brut CinetPay (`ACCEPTED`, `REFUSED`, `WAITING_FOR_CUSTOMER`, …). |
| `failure_reason`, `paid_at`, `failed_at`, `cancelled_at`, `refunded_at` | Traçabilité par statut. |
| `metadata` | jsonb libre (aucune donnée sensible — pas de PIN, pas de numéro de carte). |

### `orders` (existante, étendue)
`platform_fee`, `seller_amount`, `settlement_status` (`pending` / `on_hold` /
`settled`) — séparent explicitement le règlement producteur du statut de
paiement. **Un paiement `paid` ne signifie pas que l'argent est disponible
pour retrait par le producteur** : le payout réel (virement au producteur)
n'est pas implémenté dans cette passe — voir §8.

### `payment_events` (nouvelle)
Journal d'audit de chaque événement (`initiated` / `webhook` / `verify` /
`refund`), avec l'identifiant d'événement prestataire pour garantir
l'idempotence (`uq_payment_events_provider_event`). Lecture réservée aux
admins. Aucune donnée sensible journalisée (pas de secret, pas de PIN).

### `payment_settings` (nouvelle, un seul enregistrement)
Configuration admin : moyens activés, devises par moyen, type/valeur de
commission, environnement CinetPay. Lecture publique restreinte via la RPC
`get_payment_methods()` (n'expose ni la commission ni l'environnement).
Écriture réservée aux admins (`admin_update_payment_settings`).

### `refunds` (nouvelle)
Cycle manuel : `requested → processing → completed | failed`. **CinetPay
n'expose pas, au moment de cette implémentation, d'API de remboursement
automatique documentée pour le Mobile Money en RDC** — le remboursement est
donc un processus admin (virement/dépôt manuel au client), tracé ici. Si
CinetPay publie une telle API pour votre compte marchand, l'appel s'ajoute
dans `supabase/functions/payment-refund/index.ts` (le point d'entrée existe
déjà) sans changer le contrat frontend.

## 6. Edge Functions

| Fonction | Rôle | Secrets utilisés |
|---|---|---|
| `payment-initiate` | Authentifie l'acheteur, revalide la commande, ouvre/reprend une tentative de paiement (RPC `payment_initiate_begin`), appelle CinetPay, enregistre la réponse (RPC `payment_provider_attach`). | anon (auth utilisateur) + service_role + CinetPay |
| `payment-webhook` | Vérifie le HMAC, rappelle `/v2/payment/check`, applique le résultat (RPC `payment_apply_result`). Répond toujours HTTP 200. | service_role + CinetPay |
| `payment-verify` | Vérification active à la demande (page de retour, polling de secours borné). | anon (auth utilisateur) + service_role + CinetPay |
| `payment-refund` | Point d'entrée admin du cycle de remboursement manuel. | anon (auth utilisateur, vérifié admin côté RPC) |

Déploiement :
```bash
supabase functions deploy payment-initiate payment-webhook payment-verify payment-refund
```

## 7. Statuts

### Paiement (`payments.status` / `orders.payment_status`)
```
pending → processing → paid
                     → failed
                     → cancelled
                     → expired
paid → refunded
```
Correspondance avec les statuts bruts CinetPay (`/v2/payment/check`) :
`ACCEPTED → paid`, `REFUSED/FAILED → failed`, `CANCELLED → cancelled`,
`WAITING_FOR_CUSTOMER → processing` (statut intermédiaire, aucune décision
prise). Un paiement `WAITING_FOR_CUSTOMER` ne doit jamais être traité comme un
échec définitif — voir `payment_apply_result`.

### Commande (`orders.status`)
Inchangé : `pending → confirmed → preparing → ready → in_delivery → delivered → completed`,
`cancelled` depuis plusieurs états.

**Changement Passe 23.** Le paiement en ligne ne confirme PLUS la commande à la place du
producteur : `payment_apply_result` met `payment_status = paid`, démarre le délai de confirmation
(`orders.confirmation_deadline`) et notifie le producteur ; la commande reste `pending`
(« confirmation du producteur en attente ») jusqu'à ce que le producteur la confirme ou la refuse.
Faute de réponse avant l'échéance, `_order_confirmation_maintenance` l'annule (`cancel_reason =
confirmation_expired`) ; si le paiement était `paid`, une demande de remboursement `requested` est
créée — voir `docs/PASSE23-CONFIRMATION.md`. Pour le paiement à la livraison, le délai démarre à la
création de la commande.

## 8. Marketplace : commission et règlement producteur

`payment_settings.commission_type` / `commission_value` définissent la
commission plateforme (par défaut : 5 % — **à ajuster avant production**, ne
jamais laisser une valeur arbitraire non voulue). À la confirmation d'un
paiement : `orders.platform_fee` et `orders.seller_amount` sont calculés et
enregistrés, `settlement_status = 'pending'`.

**Ce qui N'EST PAS implémenté** : le virement réel au producteur (payout).
CinetPay ne propose pas nativement de *split payment* vers un compte
producteur tiers dans cette intégration ; l'argent transite entièrement vers
le compte marchand AgriFlow. Le règlement producteur (`settlement_status →
'settled'`) doit donc être un processus **séparé et manuel** (ou une future
intégration Transfert CinetPay / Mobile Money) tant qu'il n'est pas
explicitement implémenté et testé — ne jamais l'annoncer comme automatique
dans l'interface.

## 9. Idempotence et concurrence

- **Commande** : `create_order_from_cart` verrouille `checkout_id` (verrou
  consultatif Postgres) — rejouer la même requête ne crée jamais deux fois la
  commande (inchangé depuis la Passe 5).
- **Paiement** : `payment_initiate_begin` verrouille (`FOR UPDATE`) l'unique
  ligne `payments` de la commande. Un double-clic / une double requête réseau
  se sérialise sur ce verrou : la seconde requête voit la tentative déjà
  `processing` avec une `checkout_url` et la renvoie telle quelle, sans
  rappeler CinetPay.
- **Webhook** : `payment_apply_result` est idempotente par
  `(payment_id, event_type, provider_event_id, provider_status)`
  (`payment_events`). Un même webhook reçu plusieurs fois (CinetPay peut
  réessayer) ne modifie l'état qu'une seule fois.
- **Stock** : verrouillage `FOR UPDATE` des lignes `products` concernées à la
  création de la commande (inchangé) — deux achats concurrents ne peuvent
  jamais faire passer le stock sous zéro.

## 10. Gestion des erreurs (résumé)

| Cas | Comportement |
|---|---|
| API CinetPay indisponible à l'initiation | `payment-initiate` renvoie `PROVIDER_ERROR` (HTTP 502) ; la commande reste `pending`, réessayable. |
| Montant/devise renvoyés par CinetPay ≠ montant attendu | `payment_apply_result` renvoie `AMOUNT_MISMATCH`/`CURRENCY_MISMATCH`, **ne confirme rien**, journalise l'anomalie (`payment_events.result_code`). |
| Webhook dupliqué | Idempotent (§9) — traité une seule fois. |
| Webhook avant réponse HMAC valide | Rejeté silencieusement, HTTP 200 (pas de retraitement infini côté CinetPay), rien n'est modifié. |
| `WAITING_FOR_CUSTOMER` | Statut intermédiaire, pas un échec — le paiement reste `processing`. |
| Paiement déjà `paid` reçoit un nouvel événement | Ne régresse jamais (`ALREADY_PAID_NOOP`, journalisé). |
| Commande annulée avec paiement déjà `paid` | `transition_order_status` ne modifie jamais le paiement — un remboursement doit passer par `request_refund`/`admin_process_refund`. |
| Réseau lent / 4G | `payment-initiate` retourne une erreur explicite réessayable ; `PaymentResultPage` fait un polling borné (≤ 15 tentatives, 4 s d'intervalle) puis affiche « paiement toujours en attente », sans jamais boucler indéfiniment. |

## 11. Ce qui reste à faire avant une déclaration « production ready »

Cette implémentation fournit l'architecture complète et fonctionnelle. Elle
n'est **pas** utilisable avec de vrais clients tant que :

- [ ] Un compte marchand CinetPay réel est créé, validé, et ses moyens de
      paiement disponibles pour la RDC/CDF sont confirmés (§4).
- [ ] Les secrets CinetPay sont configurés dans Supabase (jamais dans Git).
- [ ] `payment_settings.enabled_methods` est mis à jour pour activer Mobile
      Money/carte (désactivé par défaut à l'installation de cette migration).
- [ ] La commission (`payment_settings.commission_value`) est fixée à la
      valeur métier réelle (5 % est une valeur par défaut arbitraire à
      ajuster).
- [ ] Un test de paiement réel de bout en bout (sandbox ou petit montant
      réel) a été effectué et le webhook confirmé comme joignable.
- [ ] Le processus de règlement producteur (§8) est défini et, si nécessaire,
      implémenté avant d'annoncer des ventes aux producteurs.
- [ ] `npm run typecheck && npm run lint && npm run build` ont été exécutés
      avec succès dans un environnement disposant d'un accès réseau à npm
      (non vérifiable depuis cet environnement de développement — voir
      `RAPPORT-PASSE16.md`).
- [ ] Tests manuels de la checklist (paiement réussi, refusé, en attente,
      double-clic, webhook dupliqué, montant modifié, devise incorrecte,
      rafraîchissement pendant paiement) effectués en sandbox CinetPay.
