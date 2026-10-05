# Passe 23 — Producteur inactif : confirmation des commandes

## Principe
Aucune nouvelle machine à états. Les statuts `orders.status`, `payment_status`, `deliveries.status` sont ceux d'avant.
Une commande « en attente de confirmation du producteur » est une commande `pending` dont `confirmation_deadline` est renseignée.
Une commande non confirmée à temps devient `cancelled` avec `cancel_reason = 'confirmation_expired'`.

| Moment | Ce que fait le serveur |
|---|---|
| Création (paiement à la livraison) | `confirmation_deadline = now() + délai` (trigger `orders_before_insert_confirmation`) ; notification « nouvelle commande » enrichie (produit, quantité, montant, acheteur, échéance) ; événements `order_created`, `producer_notified` |
| Création (Mobile Money / carte) | Pas d'échéance tant que le paiement n'est pas confirmé (le producteur ne peut pas confirmer une commande impayée) |
| Paiement confirmé (webhook) | `payment_apply_result` : l'échéance démarre, notification `order_to_confirm`, événement `payment_confirmed`. **La commande n'est plus confirmée automatiquement.** |
| Délai 1 (`reminder_after_hours`) | Rappel (`order_reminder`) — une seule fois (clé `reminder:<order>`) |
| Délai 2 (`échéance − last_reminder_before_hours`) | Dernier rappel (`order_last_reminder`) — une seule fois |
| Échéance dépassée | Annulation `confirmation_expired`, stock remis en vente, paiement non encaissé annulé, acheteur + producteur notifiés, événements `confirmation_expired`, `buyer_notified`, `alternative_offered` (si des alternatives existent) |
| Paiement déjà `paid` à l'expiration / au refus / à l'annulation | `payment_status` reste `paid`. Une ligne `refunds.status = 'requested'` est créée (une seule par paiement). **Rien n'est « remboursé » avant `admin_process_refund(..., 'completed')`** |

Valeurs initiales : délai 24 h, 1er rappel après 8 h, dernier rappel 4 h avant l'échéance → T0, T+8 h, T+20 h, T+24 h.
Modifiables par l'admin (Administration → « Délais de confirmation ») ou `select admin_update_order_confirmation_settings(...)`.

## Mise en service
1. Appliquer la migration `20260930090000_producer_availability_order_confirmation.sql` (idempotente).
2. **Planifier la tâche serveur** (au moins une des deux) :
   - *pg_cron* : la migration planifie `agriflow-order-confirmation` toutes les 10 min **si l'extension est disponible** (sinon un NOTICE le signale) ;
   - *Edge Function* : `supabase functions deploy order-confirmation-cron --no-verify-jwt`, secrets `CRON_SECRET` (obligatoire — la fonction refuse tout appel sans lui), puis planification toutes les 10 min (Dashboard → Schedule, ou pg_cron + pg_net, exemple en tête de `index.ts`).
   Les deux peuvent tourner ensemble : la tâche est idempotente.
3. **E-mail (optionnel)** : secrets `RESEND_API_KEY`, `EMAIL_FROM` (adresse expéditeur validée chez Resend), `SITE_URL`. Sans eux le canal e-mail est ignoré et la réponse de la fonction indique `email: "not_configured"`. L'envoi n'a lieu que via l'Edge Function (délai = période du cron).
4. **SMS / push** : aucun fournisseur intégré — ignorés. La table `notification_deliveries` est prête (canal, fournisseur, statut, `sent_at`, `failure_reason`).

## Sécurité
- Le front n'écrit ni échéance, ni statut, ni remboursement : tout passe par les RPC existantes (`transition_order_status`) ou par des fonctions `SECURITY DEFINER` non exposées (`_notify`, `_log_order_event`, `_order_confirmation_maintenance`… : EXECUTE retiré à `anon`/`authenticated`).
- `last_seen_at` : écrit uniquement par `touch_last_seen()` (≤ 1 écriture / 2 min serveur ; le client en fait ≤ 1 / 5 min), non lisible par colonne ; `get_producer_presence()` ne renvoie que des producteurs/coopératives.
- Création de commande refusée côté base (`PRODUCER_UNAVAILABLE`) si le producteur a désactivé les commandes, même si le front est contourné.
- `order_events` : lecture réservée à l'acheteur, au producteur de la commande et aux admins ; aucune écriture client.

## Limites connues
- Un producteur qui confirme après l'échéance mais avant le prochain passage de la tâche est accepté (délai de grâce ≤ période du cron).
- Les notifications écrites par la base (titre/corps) sont en français ; l'interface (bannières, timeline, dashboard, admin, notifications – libellés) utilise l'i18n. Lingála / Kikongo / Tshiluba : français (voir `TRADUCTIONS-A-VALIDER.md`).
- Le remboursement chez le prestataire reste une action admin (fonction `payment-refund` existante) : la passe 23 crée la demande, elle ne déclenche pas d'appel prestataire automatique.
- Les commandes `pending` déjà existantes (COD ou payées) reçoivent un délai complet à partir de la migration ; les commandes en ligne impayées n'expirent pas.
