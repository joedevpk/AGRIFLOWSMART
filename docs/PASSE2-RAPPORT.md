# PASSE 2 — Dashboard financier et administration

**Décision : VALIDATION CONDITIONNELLE.** Le dashboard, le rapprochement, l'export et le journal des actions sont implémentés et testés sur des données générées par les vraies fonctions de l'application. Non vérifié : comportement sur un volume de production réel, et plusieurs décisions de gouvernance ouvertes (§5).

Légende : **Validé** (vérifié par un test exécuté) · **À corriger** · **À vérifier manuellement**.

## 1. Audit initial

| Constat | Classement |
|---|---|
| Un seul rôle privilégié existe : `admin` (pas de super-administrateur). Aucun rôle n'a été ajouté | Constat |
| Sources officielles : `orders` (+ instantané commission, passe 1), `payments`, `payment_events`, `refunds`, `financial_events`, `order_items`/`products` (catégorie) | Validé |
| Changement de rôle, vérification de compte, statut et suppression de produit par `UPDATE`/`DELETE` direct d'un admin : **aucun motif, aucune trace**, auto-rétrogradation et retrait du dernier admin possibles | Corrigé (§3) |
| Paiements `demo_paid` présents en base : doivent être exclus de l'encaissé | Corrigé |
| `settled` n'est jamais écrit : aucun reversement n'existe | Constat → affiché « non disponible » |
| Incidents, catégories gérables, paramètres économiques : pas d'entité « incident » ; catégories = constantes du code ; paramètres de commission = passe 1 | Constat (non créé) |

## 2. Fichiers créés / modifiés

- modifié `src/App.tsx`
- créé `src/components/admin/finance/FinanceChart.tsx`
- créé `src/components/admin/finance/FinanceJournal.tsx`
- créé `src/components/admin/finance/FinanceOverview.tsx`
- créé `src/components/admin/finance/FinanceReconciliation.tsx`
- créé `src/components/admin/finance/FinanceTransactions.tsx`
- modifié `src/components/layout/dashboard-nav.tsx`
- créé `src/lib/finance.test.ts`
- créé `src/lib/finance.ts`
- modifié `src/pages/AdminPage.tsx`
- créé `src/pages/admin/AdminFinancePage.tsx`
- créé `supabase/migrations/20261010090000_finance_dashboard.sql`
- créé `supabase/tests/60_finance_dashboard.sql`

## 3. Migration `20261010090000_finance_dashboard.sql` (additive)

- **Agrégations côté serveur**, réservées à `is_admin()`, `STABLE`, `SECURITY DEFINER` à `search_path` figé, `statement_timeout` : `admin_finance_summary`, `admin_finance_timeseries` (jour/semaine/mois, zéro-rempli, heure de Kinshasa), `admin_finance_breakdown` (catégorie, vendeur, type de clientèle ; 20 lignes), `admin_transactions_search` (filtres, pagination plafonnée à 100, jokers `LIKE` neutralisés), `admin_transaction_detail` (sans téléphone ni charge brute du prestataire), `admin_reconciliation_report` (**lecture seule**), `admin_transactions_export` (5 000 lignes max, **journalisé** : filtres et nombre de lignes, jamais le contenu).
- **Index** : `orders(created_at)`, `orders(payment_status, created_at)`, `payments(paid_at)`, `payments(created_at)`, `refunds` (complétés, ouverts), `financial_events(occurred_at)`.
- **Journal des actions admin** `admin_action_log` (ajout seul : UPDATE/DELETE/TRUNCATE refusés ; lecture admin uniquement).
- **Rôles stricts** : `admin_set_user_role` (motif obligatoire, pas d'auto-modification, dernier admin protégé, rôle valide). Le changement de rôle **direct est désormais refusé, même à un admin** (trigger `prevent_privilege_escalation` renforcé). Écran `AdminPage` basculé sur cette RPC avec saisie du motif.
- **Traçabilité** par trigger : changement de rôle, de vérification, de statut d'offre et suppression d'offre par un admin (les actions d'un producteur sur sa propre offre ne sont pas tracées comme actions admin).
- Aucune donnée existante modifiée ; aucune transaction fictive ; aucune écriture directe de montant.

Interface : `/admin/finance` (Synthèse, Transactions, Rapprochement, Journal) ; graphiques en SVG sans dépendance, avec tableau de données accessible ; tableaux à défilement interne ; états de chargement, d'erreur et vides.

## 4. Définitions

Voir `docs/FINANCE-DEFINITIONS.md` (volume ≠ encaissé ≠ commission ≠ bénéfice). Les ventes ne sont jamais présentées comme un revenu de la plateforme ; reversements, bénéfice net et frais de paiement sont affichés « non disponibles » avec la raison.

## 5. Décisions et points ouverts

| Point | Classement |
|---|---|
| Aucun super-administrateur : **tout admin peut promouvoir un autre admin** (avec motif, journalisé). Recommandé : validation à deux personnes ou rôle dédié | À décider |
| Fuseau unique **Kinshasa (UTC+1)** ; la RDC compte aussi UTC+2 (ex. Lubumbashi) : jours/mois de ces zones sont décalés d'une heure | À décider |
| Vérification de compte et statut d'offre par admin : tracés mais **sans motif obligatoire** | À décider |
| Gestion des incidents : aucun modèle de données n'existe | Non implémenté |
| Catégories : constantes dans le code, non administrables | Non implémenté |
| Commandes « legacy » incluses dans la commission acquise avec l'ancien calcul | Documenté |
| Pagination du journal : deux sources fusionnées par page → l'ordre entre pages est approximatif | À corriger (mineur) |
| Un administrateur peut toujours modifier directement `is_verified`, produits et conseils agricoles par l'API (tracé, non bloqué) | Constat |

## 6. Sécurité

| Contrôle | Résultat |
|---|---|
| Acheteur, producteur et `anon` refusés sur les 8 fonctions admin ; journal admin illisible hors admin | Validé (SQL F7) |
| Rôle : motif, auto-modification, rôle invalide, même rôle, UPDATE direct par un admin refusés ; journal : auteur, motif, avant/après | Validé (F8) |
| Journaux en ajout seul ; export journalisé sans contenu ; export sans noms d'utilisateurs ni téléphones | Validé (F5, F8, TS) |
| Rapprochement : détecte 8 types de divergences injectées, **ne modifie aucune ligne** (empreintes avant/après identiques) | Validé (F6) |
| Fonctions de lecture `STABLE`, export `VOLATILE`, `search_path` figé | Validé (F9) |
| Injection de formules CSV neutralisée ; BOM UTF-8 ; échappement | Validé (Vitest) |
| Aucun secret ajouté ; RLS jamais désactivée | Validé (revue du diff) |

## 7. Tests réellement exécutés

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` / `typecheck:edge` / `lint` | 0 erreur |
| `npm test` (Vitest) | **15 fichiers, 143 tests passés** (13 nouveaux : `src/lib/finance.test.ts`) |
| `bash supabase/tests/run-all.sh` (PostgreSQL 16, 15 migrations sur base vierge) | **6 fichiers SQL passés**, dont `60_finance_dashboard.sql` (F1–F9) |
| Test de mutation (retrait de l'exclusion des paiements démo) | La suite échoue comme attendu. **Un premier essai n'avait pas détecté la mutation** : le test a été renforcé (démo daté dans la période) |
| `npm run build` | OK |
| Page `/admin/finance`, 4 onglets, 320/390/768/1280 px, Chromium réel (données simulées) | 0 débordement, 0 erreur JS |

Couverture : calculs et périodes (bornes incluse/exclue, fuseau, mois/semaine/jour, période invalide ou > 800 jours), permissions, export, pagination (plafond 100, pages au-delà), états financiers (en attente, échoué, remboursé, démo), accès non autorisés.

## 8. Problèmes rencontrés

- Rapprochement initial conçu avec table temporaire dans une fonction `STABLE` : réécrit en une seule requête à CTE (lecture seule réelle).
- Types `NULL` dans l'`UNION ALL` du rapprochement : typage explicite ajouté.
- Règle `payment_stale` affinée : un paiement `pending` jamais ouvert chez le prestataire n'est pas une divergence ; seul `processing` > 2 h est signalé.

## 9. Étapes manuelles

1. Sauvegarde, puis migration en **préproduction** (`supabase db push`) ; ne pas déployer en production sans cette étape.
2. Vérifier les performances sur le volume réel (`EXPLAIN ANALYZE` des 3 agrégations sur 12 mois) ; ajuster la période maximale si nécessaire.
3. Décider des points du §5 (super-administrateur, fuseau, motifs).
4. Test sandbox CinetPay de bout en bout (paiement, rejeu du webhook) : non réalisé ici.

## 10. Risques résiduels et éléments non vérifiés

- Aucun test sur un volume de production ; seuls l'existence des index et la volatilité des fonctions sont vérifiées.
- Interface testée avec des réponses simulées ; le câblage UI ↔ RPC est typé et chaque RPC est testée en SQL, sans test d'intégration UI ↔ base.
- Données de test créées via les RPC réelles puis **datées** par mise à jour directe (triggers désactivés) pour tester périodes et fuseau.
- Pas de test de composants React ni de lecteur d'écran réel (structure ARIA, tableaux de secours et zones tactiles de 44 px mis en place).
- Aucun reversement, aucun bénéfice net, aucun frais de paiement : affichés « non disponibles ».

**Décision finale : validation conditionnelle.**
