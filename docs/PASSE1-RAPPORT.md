# PASSE 1 — Modèle économique et moteur de commissions d'AgriFlow RDC

**Décision : VALIDATION CONDITIONNELLE.** Le moteur est implémenté, testé et sûr par défaut (aucun taux actif tant qu'il n'est pas approuvé),
mais il n'est **pas** prêt à produire de la commission réelle tant que les décisions commerciales du §5 ne sont pas prises et que les
étapes manuelles du §9 (migration en préproduction, test sandbox CinetPay) ne sont pas faites.

Légende : **Validé** (vérifié par un test exécuté) · **À corriger** (défaut ou travail restant identifié) · **À vérifier manuellement** (non vérifiable dans cet environnement).

## 1. État initial constaté (audit avant modification)

| Constat | Classement |
|---|---|
| Idempotence du webhook (`payment_events`, index unique), contrôle montant/devise, refus d'un paiement `paid` régressant, montant envoyé à CinetPay = `payments.amount` calculé en base : **déjà solides**, réutilisés sans modification de logique | Validé |
| Commission calculée **à la confirmation du paiement** avec `payment_settings` *courant* → un changement de taux entre commande et paiement modifiait le montant (historique non figé) | Corrigé |
| **Taux de repli silencieux à 5 %** (`COALESCE(commission_value, 5)`) et ligne `payment_settings` insérée avec `commission_value = 5` par défaut — interdit par le cahier des charges | Corrigé (plus utilisé) |
| Assiette = `payments.amount` (**total, livraison incluse**) ; `seller_amount = total − commission` | Corrigé (assiette = produits) |
| `protect_order_financial_fields` ne protégeait **ni `platform_fee`, ni `seller_amount`, ni `settlement_status`** contre une écriture directe d'un participant | Corrigé |
| Tout remboursement `completed`, même partiel, marquait paiement **et** commande « refunded » ; `request_refund` demandait toujours 100 % du paiement | Corrigé |
| Aucun écran d'administration des commissions, aucun journal d'audit financier | Créé |
| `delivery_fee` est toujours 0 dans `create_order_from_cart` (livraison non tarifée) ; aucun frais de paiement n'est récupéré de CinetPay | Constat (non modifié) |
| Une commande = un producteur (panier multi-producteurs → une commande par producteur, `checkout_id` commun) | Constat |

## 2. Fichiers créés / modifiés

- modifié `src/App.tsx`
- modifié `src/components/layout/dashboard-nav.tsx`
- modifié `src/lib/columns.ts`
- créé `src/lib/commission.test.ts`
- créé `src/lib/commission.ts`
- modifié `src/lib/faq.ts`
- modifié `src/pages/HowItWorksPage.tsx`
- créé `src/pages/admin/AdminCommissionsPage.tsx`
- modifié `src/pages/dashboard/ProducerSalesPage.tsx`
- modifié `src/pages/legal/TermsPage.tsx`
- modifié `src/types/index.ts`
- créé `supabase/migrations/20261009090000_commission_engine.sql`
- modifié `supabase/tests/30_concurrency.sh`
- créé `supabase/tests/50_commission_engine.sql`

## 3. Migration SQL

`supabase/migrations/20261009090000_commission_engine.sql` — additive, rejouable sur base vierge, aucune donnée supprimée, aucune migration antérieure modifiée.
- Tables : `commission_rules` (versionnées : brouillon → approuvée → retirée), `financial_events` (journal comptable), `financial_audit_log` (audit). Les deux journaux sont **en ajout seul** (UPDATE/DELETE/TRUNCATE interdits par trigger).
- Colonnes `orders` : `commission_status`, `commission_rule_id`, `commission_rate_bps`, `commission_base`, `commission_refund_policy`, `commission_computed_at`, `refunded_amount`, `commission_reversed` (`platform_fee`, `seller_amount`, `settlement_status` **réutilisés**, pas de doublon).
- Fonctions : `_commission_amount`, `_active_commission_rule`, triggers d'instantané (BEFORE INSERT) et de garde (`protect_commission_fields`), RPC admin `admin_create_commission_rule` / `admin_approve_commission_rule` / `admin_retire_commission_rule` / `admin_commission_overview`, trigger `refunds_financial_ledger`.
- Vue `order_financials` (`security_invoker`, respecte la RLS ; commission masquée à l'acheteur).
- Redéfinitions ciblées : `payment_apply_result` (seul le bloc de calcul remplacé, texte généré depuis la fonction réelle), `request_refund`, `admin_process_refund`.
- Commandes déjà payées avant la migration → `commission_status = 'legacy'` (montants jamais recalculés) ; les autres → `not_configured`.
- `payment_settings.commission_value/type` : marquées **obsolètes** par commentaire SQL (non supprimées).

## 4. Formule exacte

```
assiette           = montant des PRODUITS de la commande (hors livraison, hors frais de paiement)
commission         = arrondi_au_centième( assiette × taux_pb ÷ 10 000 )      -- demi vers le haut
producer_net       = assiette − commission                                   -- livraison non incluse
buyer_total        = produits + livraison                                    -- la commission n'est PAS ajoutée à l'acheteur
```
- Taux en **points de base entiers** (100 pb = 1 %), 0 à 10 000. Arithmétique `numeric` exacte (SQL) / `BigInt` (TypeScript) : aucun flottant.
- Figée à la création de la commande (règle, taux, assiette, politique de remboursement). Un changement de taux n'affecte que les commandes suivantes.
- Sans règle approuvée : commission 0, `seller_amount` NULL, règlement `on_hold` ; **le paiement de l'acheteur n'est pas bloqué**.
- Devise : 2 décimales pour toutes les devises (cohérent avec l'existant `round(…, 2)`).
- Remboursement (politique figée sur la commande) : `proportional` → `commission_reversed = round(commission × min(remboursé, assiette) ÷ assiette, 2)` ; `keep_all` → 0 ; **non décidée → NULL (à arbitrer, rien n'est deviné)**. `producer_net_after_refund = net − (min(remboursé, assiette) − commission_reversed)`.

## 5. Décisions commerciales encore à valider (rien n'a été inventé)

| Décision | État |
|---|---|
| **Taux de commission** | Aucun taux actif. À créer puis approuver dans `/admin/commissions` avec référence de validation |
| Assiette = produits seulement (livraison exclue) | Implémenté comme valeur par défaut du cahier des charges — **à confirmer** |
| Politique de commission en cas de remboursement (`proportional` / `keep_all`) | Non décidée (NULL) — à choisir par règle |
| Livraison : à qui revient `delivery_fee` quand il sera tarifié (producteur, livreur, plateforme) ; exclue du net aujourd'hui | À décider |
| Frais de paiement CinetPay : à la charge de qui ; non récupérés actuellement (`payment_fee` volontairement absent) | À décider + vérifier si l'API les fournit |
| Commandes créées **avant** l'approbation du premier taux et payées après : restent `on_hold` sans commission. Faut-il une action d'application a posteriori ? | À décider (aucun outil fourni, volontairement) |
| Principe des quatre yeux (créateur ≠ approbateur) | Non imposé aujourd'hui — recommandé |
| Règles par catégorie / producteur, frais fixes | Architecture prévue (`scope`, `fixed_fee`), **verrouillées** (CHECK) tant que non validées |
| Versement automatique aux producteurs | Non implémenté (pas d'infrastructure ni d'accords) ; versement reste manuel |

## 6. Contrôles de sécurité et RLS

| Contrôle | Résultat |
|---|---|
| Un acheteur / un producteur / `anon` ne peut ni créer, ni approuver, ni retirer une règle (RPC refusée) ; INSERT direct sur `commission_rules` refusé | Validé (SQL V2) |
| Acheteur et producteur ne lisent ni `commission_rules`, ni `financial_events`, ni `financial_audit_log` ; l'admin lit tout | Validé (V2, V9) |
| Personne — **même un admin** — ne peut réécrire directement `platform_fee`, `seller_amount`, `settlement_status`, taux, assiette, règle figée | Validé (V6) |
| Valeurs financières envoyées par le client à l'insertion d'une commande écrasées par le serveur | Validé (V4) |
| Journaux en ajout seul (UPDATE, DELETE, TRUNCATE refusés) ; création/approbation/retrait audités avec auteur et référence de validation | Validé (V7) |
| Isolation : un tiers et un autre producteur ne voient aucune commande ; l'acheteur ne voit pas la commission dans la vue ; le producteur voit la sienne | Validé (V9) |
| Antidatage de la date d'effet, double approbation, référence obligatoire, motif de retrait obligatoire, taux hors bornes | Validé (V2, V3, V5) |
| Aucun secret ajouté ; aucune variable `VITE_*` nouvelle ; RLS jamais désactivée | Validé (revue du diff) |
| **L'acheteur peut encore lire `orders.platform_fee` / `seller_amount` par `select` direct** (RLS = niveau ligne ; `ORDER_COLUMNS` les sélectionne pour tous les participants). La vue les masque, pas la table | **À corriger** (restreindre par colonnes ou ne servir que la vue) |
| `admin_update_payment_settings` accepte encore `commission_*` (sans effet depuis la passe 1) : source de confusion | **À corriger** (retirer après validation) |
| Edge Functions : **non modifiées** (typecheck uniquement). Aucune ne calcule de commission | Validé (revue) |

## 7. Tests réellement exécutés (derniers résultats)

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm run typecheck:edge` | 0 erreur |
| `npm run lint` | 0 erreur, 0 avertissement |
| `npm test` (Vitest) | **14 fichiers, 130 tests passés** (dont 26 nouveaux : `src/lib/commission.test.ts`) |
| `bash supabase/tests/run-all.sh` (PostgreSQL 16, 14 migrations sur base vierge) | **5 fichiers SQL passés** : suites existantes + `50_commission_engine.sql` (V0–V10, assertions réelles) |
| Test de mutation (arrondi dégradé en troncature) | La suite **échoue** comme attendu → les tests détectent une régression |
| `npm run build` | OK |
| Écran `/admin/commissions` en Chromium réel (données simulées), 320 / 390 / 768 / 1280 px | 0 débordement, 0 erreur JS, détail de calcul affiché |

Couverture demandée : pourcentage, arrondis/limites, quantités invalides (rejet par le RPC existant), prix modifié (`PRICE_CHANGED` existant), absence de taux validé (V1), autorisations (V2), RLS (V6, V9), rejeu de notification de paiement (V1, V3 + test de concurrence existant mis à jour), remboursement total/partiel/échoué (V8), historique figé (V5), séparation commission/livraison (V3, V4), total serveur = montant transmis (V3 ; `payment-initiate` envoie `payments.amount`).

Un test existant (`30_concurrency.sh`, « commission calculée une seule fois ») encodait l'ancien comportement (5 % au paiement) : il a été **remplacé par des assertions équivalentes du nouveau contrat** (commission_status `not_configured`, un seul événement `payment_confirmed`), pas supprimé.

## 8. Problèmes rencontrés et corrections

- Garde-fou financier incomplet et remboursements partiels incorrects (voir §1) : corrigés dans la migration.
- Mes premiers tests utilisaient un contexte JWT simulé resté sur l'acheteur après une commande ; corrigé (le test refusait à juste titre les appels admin).
- **Limite connue** : `_request_refund_for_cancelled_order` (annulation d'une commande déjà payée) demande 100 % du paiement ; correct tant qu'aucun remboursement partiel n'a eu lieu avant l'annulation. Non modifié.

## 9. Étapes manuelles

1. **Sauvegarder** la base de production, puis appliquer la migration d'abord en **préproduction** (`supabase db push`). Ne pas déployer en production sans cette étape.
2. Vérifier qu'au moins un compte a `profiles.role = 'admin'` (accès `/admin/commissions`).
3. Après décision commerciale : créer le brouillon, l'approuver avec une référence de validation (aucun taux n'est actif avant).
4. **Test sandbox CinetPay** de bout en bout (paiement accepté, rejeu du webhook, montant/devise) : non réalisé ici (aucun secret ni sandbox).
5. Aucune nouvelle variable d'environnement ; ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` / `CINETPAY_SECRET_KEY` côté client.
6. Décider du sort des colonnes obsolètes `payment_settings.commission_*` (suppression par migration ultérieure).

## 10. Risques résiduels et éléments non vérifiés

- Aucun appel réel à CinetPay ; la logique de paiement est testée au niveau base de données uniquement (comme les passes précédentes).
- Interface testée avec des réponses Supabase **simulées** ; le câblage UI → RPC est typé et les RPC sont testées en SQL, mais pas d'intégration UI ↔ vraie base.
- Pas de remboursement partiel via l'interface (ni RPC) : seul le cumul est géré côté base ; la saisie d'un partiel passe aujourd'hui par un INSERT administrateur.
- `delivery_fee` est toujours 0 en production : la séparation livraison/commission est testée par insertion directe, pas par un vrai parcours de commande avec livraison payante.
- Environnement de test PostgreSQL 16 ; la vue `security_invoker` requiert PostgreSQL ≥ 15 (Supabase actuel : conforme, **à vérifier** sur votre projet).
- Rôle `cooperative` et parcours multi-livreurs non exercés spécifiquement.
- Exposition de `platform_fee` à l'acheteur par `select` direct (voir §6).

**Décision finale : validation conditionnelle.**
