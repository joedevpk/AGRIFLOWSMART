/*
# AgriFlow RDC — Panier, checkout, commandes, paiement, livraison (Passe 5)

## Contexte
Avant cette migration, une commande était créée par le navigateur en 3 appels
indépendants (insert `orders`, insert `order_status_history`, insert
`notifications`), avec le `total_amount` calculé côté client, sans contrôle du stock,
et n'importe quel participant pouvait modifier le statut d'une commande par un simple
appel REST. Cette migration déplace la logique critique dans des fonctions
PostgreSQL transactionnelles (RPC) : le serveur devient la source de vérité pour
le prix, le stock, le total, le producteur et les statuts.

Aucun DROP de table ni de donnée. Les commandes existantes sont conservées et
complétées (numéro de commande, lignes de commande, paiement, livraison).

## Modèle de données
- `orders` (EXISTANT, réutilisé) : + `order_number`, `checkout_id` (clé d'idempotence),
  `subtotal`, `delivery_fee`. `product_id` et `quantity` deviennent NULLABLES : une
  commande peut désormais contenir plusieurs produits (détail dans `order_items`).
  `orders.product_id` passe en `ON DELETE SET NULL` : supprimer un produit ne supprime
  plus l'historique des commandes (avant : `ON DELETE CASCADE`, perte de commandes).
- `order_items` (NOUVEAU) : lignes de commande avec instantané du nom, de l'image et du
  PRIX AU MOMENT DE L'ACHAT.
- `payments` (NOUVEAU) : un enregistrement par tentative de paiement (méthode,
  fournisseur, référence, `is_demo`).
- `deliveries` (EXISTANT, réutilisé) : statuts alignés sur ceux des commandes
  (pending, preparing, ready, in_delivery, delivered, cancelled) + destinataire,
  téléphone, adresse, ville, commune, date de livraison réelle.
- Trois notions distinctes, jamais mélangées : `orders.status` (commande),
  `orders.payment_status` / `payments.status` (paiement), `deliveries.status` (livraison).

## RPC (SECURITY DEFINER, exécutées avec les droits du propriétaire)
1. `create_order_from_cart(checkout_id, items, delivery, payment_method, expected_total)`
   Vérifie l'utilisateur, les produits, le stock (verrou de ligne), recalcule les
   prix et le total depuis `products`, crée UNE commande PAR PRODUCTEUR (avec ses
   lignes), décrémente le stock, crée paiement + livraison + historique +
   notification producteur. Tout ou rien : toute erreur annule l'ensemble.
   Idempotente : rejouer le même `checkout_id` renvoie les commandes déjà créées.
2. `transition_order_status(order_id, new_status, note)` — transitions contrôlées par
   rôle, historique, statut de livraison synchronisé, restitution du stock et
   remboursement démo en cas d'annulation, notification de l'autre partie.
3. `confirm_cash_payment(order_id)` — le producteur confirme l'encaissement d'un
   paiement à la livraison après livraison.
4. `apply_provider_payment_event(...)` — réservée à `service_role` : point d'entrée
   destiné au futur webhook d'un vrai prestataire de paiement.

## RLS
Les écritures directes sur `orders`, `order_status_history`, `deliveries` sont
supprimées pour les utilisateurs (seules les RPC écrivent). Lecture : acheteur et
producteur concernés, admin (inchangé). `order_items` / `payments` : lecture par les
participants uniquement. `notifications` : insertion uniquement pour soi-même (les
notifications entre utilisateurs sont créées par les RPC).

## Paiement
AUCUN prestataire réel n'est connecté. Mobile Money et carte sont des
paiements de DÉMONSTRATION (`payments.is_demo = true`, `payment_status = 'demo_paid'`).
Le paiement à la livraison reste `pending` jusqu'à confirmation par le producteur.
*/

-- ============================================================
-- 0. UTILITAIRES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1001;
GRANT USAGE ON SEQUENCE order_number_seq TO authenticated;

-- Supprime les contraintes CHECK d'une table dont la définition mentionne une colonne
-- (indépendant du nom auto-généré de la contrainte).
CREATE OR REPLACE FUNCTION _drop_check_constraints(p_table regclass, p_column text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = p_table
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ ('\m' || p_column || '\M')
      AND (p_column <> 'status' OR pg_get_constraintdef(oid) !~ 'payment_status')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, c.conname);
  END LOOP;
END;
$fn$;

-- ============================================================
-- 1. ORDERS : nouvelles colonnes et contraintes
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0;

UPDATE orders o
SET order_number = 'AF-' || lpad(nextval('order_number_seq')::text, 6, '0')
FROM (SELECT id FROM orders WHERE order_number IS NULL ORDER BY created_at, id) s
WHERE o.id = s.id;

UPDATE orders SET subtotal = total_amount WHERE subtotal IS NULL;

ALTER TABLE orders ALTER COLUMN order_number SET DEFAULT ('AF-' || lpad(nextval('order_number_seq')::text, 6, '0'));
ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;
ALTER TABLE orders ALTER COLUMN subtotal SET DEFAULT 0;
ALTER TABLE orders ALTER COLUMN subtotal SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_order_number ON orders(order_number);
-- Idempotence : une seule commande par (acheteur, checkout, producteur).
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_checkout_producer
  ON orders(buyer_id, checkout_id, producer_id) WHERE checkout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_checkout ON orders(buyer_id, checkout_id);

-- Une commande peut contenir plusieurs produits : le détail vit dans order_items.
ALTER TABLE orders ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN product_id DROP NOT NULL;

-- Supprimer un produit ne doit plus supprimer les commandes (avant : CASCADE).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_product_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- Vocabulaire de paiement : on ajoute « refunded » aux valeurs existantes.
SELECT _drop_check_constraints('orders'::regclass, 'payment_status');
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'demo_paid', 'paid', 'failed', 'refunded'));

-- Cohérence financière (NOT VALID : appliquée aux écritures futures, sans bloquer
-- la migration si d'anciennes données étaient incohérentes).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_amounts_check;
ALTER TABLE orders ADD CONSTRAINT orders_amounts_check
  CHECK (subtotal >= 0 AND delivery_fee >= 0 AND total_amount >= 0 AND total_amount = subtotal + delivery_fee) NOT VALID;

-- Le stock ne peut jamais devenir négatif (NOT VALID : n'analyse pas l'existant).
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_quantity_nonneg;
ALTER TABLE products ADD CONSTRAINT products_quantity_nonneg CHECK (quantity >= 0) NOT VALID;

-- ============================================================
-- 2. ORDER_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  producer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_image text,
  unit text NOT NULL DEFAULT 'kg',
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  quantity numeric NOT NULL CHECK (quantity > 0),
  subtotal numeric NOT NULL CHECK (subtotal >= 0),
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_participant_read" ON order_items;
CREATE POLICY "order_items_participant_read" ON order_items FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "order_items_admin_all" ON order_items;
CREATE POLICY "order_items_admin_all" ON order_items FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- Reprise des commandes existantes : le prix historique = total / quantité.
INSERT INTO order_items (order_id, product_id, producer_id, product_name, product_image, unit, unit_price, quantity, subtotal, currency)
SELECT o.id, o.product_id, o.producer_id, COALESCE(p.name, 'Produit'), p.images[1], o.unit,
       CASE WHEN o.quantity > 0 THEN round(o.total_amount / o.quantity, 4) ELSE COALESCE(p.price, 0) END,
       o.quantity, o.total_amount, o.currency
FROM orders o
LEFT JOIN products p ON p.id = o.product_id
WHERE o.quantity IS NOT NULL AND o.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id);

-- ============================================================
-- 3. DELIVERIES : statuts alignés sur les commandes + coordonnées
-- ============================================================
SELECT _drop_check_constraints('deliveries'::regclass, 'status');

UPDATE deliveries SET status = CASE status
  WHEN 'pickup' THEN 'ready'
  WHEN 'in_transit' THEN 'in_delivery'
  WHEN 'failed' THEN 'cancelled'
  ELSE status END;

ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('pending', 'preparing', 'ready', 'in_delivery', 'delivered', 'cancelled'));

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS recipient_phone text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS commune text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Une livraison par commande (permet l'embed « to-one » côté PostgREST).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM deliveries GROUP BY order_id HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_deliveries_order ON deliveries(order_id);
  END IF;
END
$do$;

-- Reprise : une livraison pour chaque commande existante qui n'en a pas.
INSERT INTO deliveries (order_id, status, address, city)
SELECT o.id,
       CASE o.status
         WHEN 'pending' THEN 'pending' WHEN 'confirmed' THEN 'pending'
         WHEN 'preparing' THEN 'preparing' WHEN 'ready' THEN 'ready'
         WHEN 'in_delivery' THEN 'in_delivery'
         WHEN 'delivered' THEN 'delivered' WHEN 'completed' THEN 'delivered'
         ELSE 'cancelled' END,
       o.delivery_address, o.delivery_city
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = o.id);

-- ============================================================
-- 4. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL CHECK (method IN ('mobile_money', 'card', 'cash_on_delivery')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'demo_paid', 'paid', 'failed', 'refunded')),
  provider text NOT NULL DEFAULT 'demo',
  provider_reference text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_participant_read" ON payments;
CREATE POLICY "payments_participant_read" ON payments FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.producer_id = auth.uid())
  );

DROP POLICY IF EXISTS "payments_admin_all" ON payments;
CREATE POLICY "payments_admin_all" ON payments FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Reprise : un enregistrement de paiement pour chaque commande existante.
INSERT INTO payments (order_id, user_id, amount, currency, method, status, provider, is_demo)
SELECT o.id, o.buyer_id, o.total_amount, o.currency,
       COALESCE(o.payment_method, 'cash_on_delivery'), o.payment_status,
       CASE WHEN o.payment_status = 'demo_paid' THEN 'demo'
            WHEN COALESCE(o.payment_method, 'cash_on_delivery') = 'cash_on_delivery' THEN 'cash'
            ELSE 'manual' END,
       o.payment_status = 'demo_paid'
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id);

-- ============================================================
-- 5. TRIGGERS DE PROTECTION (défense en profondeur)
-- ============================================================
-- Les RPC de ce fichier posent `app.order_rpc = 'on'` (local à la transaction) ;
-- un client REST ne peut pas positionner ce paramètre.

CREATE OR REPLACE FUNCTION protect_order_core_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF is_admin() OR current_setting('app.order_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.producer_id IS DISTINCT FROM OLD.producer_id THEN
    RAISE EXCEPTION 'Réassignation de commande non autorisée';
  END IF;
  -- product_id peut passer à NULL (ON DELETE SET NULL à la suppression d'un produit)
  IF NEW.product_id IS DISTINCT FROM OLD.product_id AND NEW.product_id IS NOT NULL THEN
    RAISE EXCEPTION 'Réassignation de commande non autorisée';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION protect_order_financial_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF is_admin() OR current_setting('app.order_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee THEN
    RAISE EXCEPTION 'Modification du montant de la commande non autorisée';
  END IF;
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'Modification de la devise de la commande non autorisée';
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
    RAISE EXCEPTION 'Modification du paiement non autorisée';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION protect_order_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (is_admin() OR current_setting('app.order_rpc', true) = 'on') THEN
    RAISE EXCEPTION 'Changement de statut non autorisé : utiliser transition_order_status';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_order_status ON orders;
CREATE TRIGGER trg_protect_order_status
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION protect_order_status();

-- ============================================================
-- 6. RLS : les écritures passent uniquement par les RPC
-- ============================================================
DROP POLICY IF EXISTS "orders_buyer_insert" ON orders;
DROP POLICY IF EXISTS "orders_participant_update" ON orders;
DROP POLICY IF EXISTS "history_participant_insert" ON order_status_history;
DROP POLICY IF EXISTS "delivery_participant_insert" ON deliveries;
DROP POLICY IF EXISTS "delivery_participant_update" ON deliveries;

-- Notifications : chacun n'insère que pour soi. Les notifications destinées à
-- l'autre partie d'une commande sont créées par les RPC (SECURITY DEFINER).
DROP POLICY IF EXISTS "notif_insert" ON notifications;
DROP POLICY IF EXISTS "notif_owner_insert" ON notifications;
CREATE POLICY "notif_insert" ON notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 7. FONCTIONS INTERNES (non exposées aux clients)
-- ============================================================
CREATE OR REPLACE FUNCTION _order_error(p_code text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('ok', false, 'code', p_code) || COALESCE(p_extra, '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION _checkout_result(p_buyer uuid, p_checkout uuid, p_replayed boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'replayed', p_replayed,
    'checkout_id', p_checkout,
    'currency', (SELECT o.currency FROM orders o WHERE o.buyer_id = p_buyer AND o.checkout_id = p_checkout ORDER BY o.created_at LIMIT 1),
    'total_amount', COALESCE((SELECT sum(o.total_amount) FROM orders o WHERE o.buyer_id = p_buyer AND o.checkout_id = p_checkout), 0),
    'orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'producer_id', o.producer_id,
        'total_amount', o.total_amount,
        'currency', o.currency,
        'status', o.status,
        'payment_status', o.payment_status
      ) ORDER BY o.created_at, o.order_number)
      FROM orders o WHERE o.buyer_id = p_buyer AND o.checkout_id = p_checkout
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION order_transition_allowed(p_role text, p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (p_role IN ('producer', 'admin') AND (p_from, p_to) IN (
      ('pending', 'confirmed'), ('pending', 'cancelled'),
      ('confirmed', 'preparing'), ('confirmed', 'cancelled'),
      ('preparing', 'ready'), ('preparing', 'cancelled'),
      ('ready', 'in_delivery'),
      ('in_delivery', 'delivered'),
      ('delivered', 'completed')
    ))
    OR (p_role IN ('buyer', 'admin') AND (p_from, p_to) IN (
      ('pending', 'cancelled'),
      ('delivered', 'completed')
    ))
    OR (p_role = 'admin' AND p_to = 'cancelled' AND p_from IN ('ready', 'in_delivery'));
$$;

-- ============================================================
-- 8. RPC create_order_from_cart
-- ============================================================
CREATE OR REPLACE FUNCTION create_order_from_cart(
  p_checkout_id uuid,
  p_items jsonb,
  p_delivery jsonb,
  p_payment_method text,
  p_expected_total numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_elem jsonb;
  v_req jsonb;
  v_ids uuid[];
  v_issues jsonb;
  v_errors jsonb := '{}'::jsonb;
  v_name text;
  v_phone text;
  v_digits text;
  v_address text;
  v_city text;
  v_commune text;
  v_instructions text;
  v_currency_count integer;
  v_currency text;
  v_grand_total numeric;
  v_group record;
  v_first record;
  v_order_id uuid;
  v_order_number text;
  v_delivery_fee numeric;
  v_total numeric;
  v_is_demo boolean;
  v_pay_status text;
  v_first_name text;
  v_body text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN _order_error('NOT_AUTHENTICATED');
  END IF;

  -- ---- Validation de la requête (aucune écriture avant la fin de cette section)
  IF p_checkout_id IS NULL THEN
    RETURN _order_error('INVALID_REQUEST');
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('mobile_money', 'card', 'cash_on_delivery') THEN
    RETURN _order_error('INVALID_PAYMENT_METHOD');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN _order_error('EMPTY_CART');
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RETURN _order_error('CART_TOO_LARGE');
  END IF;

  FOR v_elem IN SELECT e FROM jsonb_array_elements(p_items) AS e LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RETURN _order_error('INVALID_ITEMS');
    END IF;
    IF COALESCE(v_elem ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN _order_error('INVALID_ITEMS');
    END IF;
    IF COALESCE(v_elem ->> 'quantity', '') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' THEN
      RETURN _order_error('INVALID_ITEMS');
    END IF;
    IF (v_elem ->> 'quantity')::numeric <= 0 THEN
      RETURN _order_error('INVALID_ITEMS');
    END IF;
  END LOOP;

  IF p_delivery IS NULL OR jsonb_typeof(p_delivery) <> 'object' THEN
    RETURN _order_error('INVALID_DELIVERY', jsonb_build_object('fields', jsonb_build_object('address', 'Indiquez l''adresse de livraison.')));
  END IF;

  v_name := btrim(COALESCE(p_delivery ->> 'recipient_name', ''));
  v_phone := btrim(COALESCE(p_delivery ->> 'recipient_phone', ''));
  v_address := btrim(COALESCE(p_delivery ->> 'address', ''));
  v_city := btrim(COALESCE(p_delivery ->> 'city', ''));
  v_commune := NULLIF(btrim(COALESCE(p_delivery ->> 'commune', '')), '');
  v_instructions := NULLIF(btrim(COALESCE(p_delivery ->> 'instructions', '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    v_errors := v_errors || jsonb_build_object('recipient_name', 'Indiquez le nom du destinataire.');
  END IF;
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  IF v_phone !~ '^\+?[0-9][0-9 ().-]*$' OR char_length(v_digits) NOT BETWEEN 9 AND 15 THEN
    v_errors := v_errors || jsonb_build_object('recipient_phone', 'Indiquez un numéro de téléphone valide.');
  END IF;
  IF char_length(v_address) < 3 OR char_length(v_address) > 300 THEN
    v_errors := v_errors || jsonb_build_object('address', 'Indiquez l''adresse de livraison.');
  END IF;
  IF char_length(v_city) < 2 OR char_length(v_city) > 100 THEN
    v_errors := v_errors || jsonb_build_object('city', 'Indiquez la ville de livraison.');
  END IF;
  IF v_commune IS NOT NULL AND char_length(v_commune) > 100 THEN
    v_errors := v_errors || jsonb_build_object('commune', 'La commune est trop longue.');
  END IF;
  IF v_instructions IS NOT NULL AND char_length(v_instructions) > 500 THEN
    v_errors := v_errors || jsonb_build_object('instructions', 'Les instructions sont trop longues (500 caractères maximum).');
  END IF;
  IF v_errors <> '{}'::jsonb THEN
    RETURN _order_error('INVALID_DELIVERY', jsonb_build_object('fields', v_errors));
  END IF;

  -- ---- Idempotence : un même checkout_id ne crée jamais deux fois les commandes.
  -- Le verrou consultatif sérialise les double-clics / doubles requêtes.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_checkout_id::text, 0));

  IF EXISTS (SELECT 1 FROM orders WHERE buyer_id = v_uid AND checkout_id = p_checkout_id) THEN
    RETURN _checkout_result(v_uid, p_checkout_id, true);
  END IF;

  -- ---- Regroupe les doublons de produits puis verrouille les produits (ordre stable)
  SELECT jsonb_agg(jsonb_build_object('product_id', t.product_id, 'quantity', t.qty)),
         array_agg(t.product_id)
  INTO v_req, v_ids
  FROM (
    SELECT (e ->> 'product_id')::uuid AS product_id, sum((e ->> 'quantity')::numeric) AS qty
    FROM jsonb_array_elements(p_items) AS e
    GROUP BY 1
  ) t;

  PERFORM 1 FROM products WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  -- ---- Revalidation serveur : existence, statut, stock, prix, propriétaire
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', r.product_id,
    'name', p.name,
    'reason', CASE
      WHEN p.id IS NULL THEN 'removed'
      WHEN p.user_id = v_uid THEN 'own_product'
      WHEN p.status <> 'available' THEN 'unavailable'
      WHEN p.price <= 0 THEN 'price_missing'
      ELSE 'insufficient_stock' END,
    'available', COALESCE(GREATEST(p.quantity, 0), 0),
    'requested', r.quantity
  ))
  INTO v_issues
  FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
  LEFT JOIN products p ON p.id = r.product_id
  WHERE p.id IS NULL
     OR p.user_id = v_uid
     OR p.status <> 'available'
     OR p.price <= 0
     OR p.quantity < r.quantity;

  IF v_issues IS NOT NULL THEN
    RETURN _order_error('CART_INVALID', jsonb_build_object('issues', v_issues));
  END IF;

  SELECT count(DISTINCT currency), min(currency) INTO v_currency_count, v_currency
  FROM products WHERE id = ANY (v_ids);
  IF v_currency_count > 1 THEN
    RETURN _order_error('MIXED_CURRENCY');
  END IF;

  -- ---- Total recalculé depuis les prix ACTUELS de la base
  SELECT COALESCE(sum(round(p.price * r.quantity, 2)), 0) INTO v_grand_total
  FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
  JOIN products p ON p.id = r.product_id;

  -- Frais de livraison : aucun service de livraison n'est branché, donc 0 (« à confirmer »).
  IF p_expected_total IS NOT NULL AND round(p_expected_total, 2) <> round(v_grand_total, 2) THEN
    RETURN _order_error('PRICE_CHANGED', jsonb_build_object('server_total', v_grand_total, 'currency', v_currency));
  END IF;

  -- ---- Écritures (transaction unique : tout ou rien)
  PERFORM set_config('app.order_rpc', 'on', true);

  v_is_demo := p_payment_method IN ('mobile_money', 'card');
  v_pay_status := CASE WHEN v_is_demo THEN 'demo_paid' ELSE 'pending' END;

  FOR v_group IN
    SELECT p.user_id AS producer_id,
           count(*) AS n_items,
           sum(round(p.price * r.quantity, 2)) AS subtotal
    FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
    JOIN products p ON p.id = r.product_id
    GROUP BY p.user_id
    ORDER BY p.user_id
  LOOP
    v_delivery_fee := 0;
    v_total := v_group.subtotal + v_delivery_fee;

    SELECT p.id AS product_id, p.unit AS unit, r.quantity AS quantity
    INTO v_first
    FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
    JOIN products p ON p.id = r.product_id
    WHERE p.user_id = v_group.producer_id
    ORDER BY p.id
    LIMIT 1;

    INSERT INTO orders (
      buyer_id, product_id, producer_id, quantity, unit,
      subtotal, delivery_fee, total_amount, currency,
      status, payment_method, payment_status,
      delivery_address, delivery_city, notes, checkout_id
    ) VALUES (
      v_uid,
      CASE WHEN v_group.n_items = 1 THEN v_first.product_id ELSE NULL END,
      v_group.producer_id,
      CASE WHEN v_group.n_items = 1 THEN v_first.quantity ELSE NULL END,
      CASE WHEN v_group.n_items = 1 THEN v_first.unit ELSE 'kg' END,
      v_group.subtotal, v_delivery_fee, v_total, v_currency,
      'pending', p_payment_method, v_pay_status,
      v_address, v_city, v_instructions, p_checkout_id
    )
    RETURNING id, order_number INTO v_order_id, v_order_number;

    INSERT INTO order_items (order_id, product_id, producer_id, product_name, product_image, unit, unit_price, quantity, subtotal, currency)
    SELECT v_order_id, p.id, p.user_id, p.name, p.images[1], p.unit, p.price, r.quantity,
           round(p.price * r.quantity, 2), p.currency
    FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
    JOIN products p ON p.id = r.product_id
    WHERE p.user_id = v_group.producer_id;

    INSERT INTO deliveries (order_id, status, recipient_name, recipient_phone, address, city, commune, notes)
    VALUES (v_order_id, 'pending', v_name, v_phone, v_address, v_city, v_commune, v_instructions);

    INSERT INTO payments (order_id, user_id, amount, currency, method, status, provider, provider_reference, is_demo)
    VALUES (
      v_order_id, v_uid, v_total, v_currency, p_payment_method, v_pay_status,
      CASE WHEN v_is_demo THEN 'demo' ELSE 'cash' END,
      CASE WHEN v_is_demo THEN 'DEMO-' || v_order_number ELSE NULL END,
      v_is_demo
    );

    INSERT INTO order_status_history (order_id, status, changed_by, note)
    VALUES (v_order_id, 'pending', v_uid, 'Commande créée par l''acheteur');

    SELECT product_name INTO v_first_name FROM order_items WHERE order_id = v_order_id ORDER BY product_name LIMIT 1;
    v_body := v_order_number || ' — ' || v_first_name
      || CASE WHEN v_group.n_items > 1 THEN ' et ' || (v_group.n_items - 1)::text || ' autre(s) produit(s)' ELSE '' END
      || ' — ' || trim_scale(v_total)::text || ' ' || v_currency
      || CASE WHEN v_is_demo THEN ' (paiement de démonstration)' ELSE ' (paiement à la livraison)' END;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (v_group.producer_id, 'new_order', 'Nouvelle commande reçue', v_body, '/orders/' || v_order_id::text);
  END LOOP;

  -- Décrément du stock (les lignes sont verrouillées et déjà validées)
  UPDATE products p
  SET quantity = p.quantity - r.quantity,
      status = CASE WHEN p.quantity - r.quantity <= 0 THEN 'sold_out' ELSE p.status END
  FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
  WHERE p.id = r.product_id;

  RETURN _checkout_result(v_uid, p_checkout_id, false);
END;
$$;

-- ============================================================
-- 9. RPC transition_order_status
-- ============================================================
CREATE OR REPLACE FUNCTION transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order orders%ROWTYPE;
  v_role text;
  v_recipients uuid[];
  v_title text;
  v_delivery_status text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN _order_error('NOT_AUTHENTICATED');
  END IF;
  IF p_new_status IS NULL OR p_new_status NOT IN ('pending', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'completed', 'cancelled') THEN
    RETURN _order_error('INVALID_STATUS');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;

  IF v_uid = v_order.producer_id THEN
    v_role := 'producer';
  ELSIF v_uid = v_order.buyer_id THEN
    v_role := 'buyer';
  ELSIF is_admin() THEN
    v_role := 'admin';
  ELSE
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;

  IF NOT order_transition_allowed(v_role, v_order.status, p_new_status) THEN
    RETURN _order_error('INVALID_TRANSITION', jsonb_build_object('from', v_order.status, 'to', p_new_status));
  END IF;

  -- Un paiement mobile money / carte doit être réglé avant confirmation du producteur.
  IF p_new_status = 'confirmed'
     AND v_order.payment_method IN ('mobile_money', 'card')
     AND v_order.payment_status NOT IN ('demo_paid', 'paid') THEN
    RETURN _order_error('PAYMENT_REQUIRED');
  END IF;

  PERFORM set_config('app.order_rpc', 'on', true);

  UPDATE orders SET status = p_new_status WHERE id = p_order_id;

  v_delivery_status := CASE p_new_status
    WHEN 'pending' THEN 'pending'
    WHEN 'confirmed' THEN 'pending'
    WHEN 'preparing' THEN 'preparing'
    WHEN 'ready' THEN 'ready'
    WHEN 'in_delivery' THEN 'in_delivery'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'completed' THEN 'delivered'
    ELSE 'cancelled' END;

  UPDATE deliveries
  SET status = v_delivery_status,
      delivered_at = CASE WHEN v_delivery_status = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END
  WHERE order_id = p_order_id;

  IF p_new_status = 'cancelled' THEN
    -- Le stock réservé à la création est restitué (le produit peut avoir été supprimé : product_id NULL).
    UPDATE products p
    SET quantity = p.quantity + i.quantity,
        status = CASE WHEN p.status = 'sold_out' THEN 'available' ELSE p.status END
    FROM order_items i
    WHERE i.order_id = p_order_id AND i.product_id = p.id;

    -- Un paiement de démonstration est « remboursé » ; un vrai paiement doit être remboursé
    -- par le prestataire (non géré ici : le statut reste inchangé pour ne pas mentir).
    UPDATE payments SET status = 'refunded' WHERE order_id = p_order_id AND status = 'demo_paid';
    UPDATE orders SET payment_status = 'refunded' WHERE id = p_order_id AND payment_status = 'demo_paid';
  END IF;

  INSERT INTO order_status_history (order_id, status, changed_by, note)
  VALUES (p_order_id, p_new_status, v_uid, NULLIF(btrim(COALESCE(p_note, '')), ''));

  v_title := CASE p_new_status
    WHEN 'confirmed' THEN 'Commande confirmée'
    WHEN 'preparing' THEN 'Commande en préparation'
    WHEN 'ready' THEN 'Commande prête'
    WHEN 'in_delivery' THEN 'Commande en livraison'
    WHEN 'delivered' THEN 'Commande livrée'
    WHEN 'completed' THEN 'Commande terminée'
    WHEN 'cancelled' THEN 'Commande annulée'
    ELSE 'Commande mise à jour' END;

  v_recipients := CASE v_role
    WHEN 'buyer' THEN ARRAY[v_order.producer_id]
    WHEN 'producer' THEN ARRAY[v_order.buyer_id]
    ELSE ARRAY[v_order.buyer_id, v_order.producer_id] END;

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT u, 'order_' || p_new_status, v_title, 'Commande ' || v_order.order_number, '/orders/' || p_order_id::text
  FROM unnest(v_recipients) AS u;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
END;
$$;

-- ============================================================
-- 10. RPC confirm_cash_payment (paiement à la livraison)
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_cash_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN _order_error('NOT_AUTHENTICATED');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR (v_order.producer_id <> v_uid AND NOT is_admin()) THEN
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;
  IF v_order.payment_method IS DISTINCT FROM 'cash_on_delivery' OR v_order.payment_status <> 'pending' THEN
    RETURN _order_error('INVALID_PAYMENT_STATE');
  END IF;
  IF v_order.status NOT IN ('delivered', 'completed') THEN
    RETURN _order_error('ORDER_NOT_DELIVERED');
  END IF;

  PERFORM set_config('app.order_rpc', 'on', true);

  UPDATE orders SET payment_status = 'paid' WHERE id = p_order_id;
  UPDATE payments SET status = 'paid'
  WHERE order_id = p_order_id AND method = 'cash_on_delivery' AND status = 'pending';

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (v_order.buyer_id, 'payment_confirmed', 'Paiement confirmé',
          'Le producteur a confirmé la réception du paiement de la commande ' || v_order.order_number,
          '/orders/' || p_order_id::text);

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
END;
$$;

-- ============================================================
-- 11. RPC apply_provider_payment_event (futur webhook — service_role uniquement)
-- ============================================================
-- Architecture cible : Checkout → Payment Service → Provider → Webhook (Edge Function
-- avec clé service_role) → apply_provider_payment_event → mise à jour de la commande.
-- Aucun secret prestataire n'est jamais exposé au navigateur.
CREATE OR REPLACE FUNCTION apply_provider_payment_event(
  p_order_id uuid,
  p_provider text,
  p_reference text,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_payment_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN _order_error('FORBIDDEN');
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('paid', 'failed', 'refunded') THEN
    RETURN _order_error('INVALID_STATUS');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;

  PERFORM set_config('app.order_rpc', 'on', true);

  SELECT id INTO v_payment_id FROM payments WHERE order_id = p_order_id ORDER BY created_at DESC LIMIT 1;
  IF v_payment_id IS NULL THEN
    INSERT INTO payments (order_id, user_id, amount, currency, method, status, provider, provider_reference, is_demo)
    VALUES (p_order_id, v_order.buyer_id, v_order.total_amount, v_order.currency,
            COALESCE(v_order.payment_method, 'mobile_money'), p_status, p_provider, p_reference, false);
  ELSE
    UPDATE payments
    SET status = p_status, provider = p_provider, provider_reference = p_reference, is_demo = false
    WHERE id = v_payment_id;
  END IF;

  UPDATE orders SET payment_status = p_status WHERE id = p_order_id;

  IF p_status = 'paid' THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT u, 'payment_confirmed', 'Paiement confirmé', 'Commande ' || v_order.order_number, '/orders/' || p_order_id::text
    FROM unnest(ARRAY[v_order.buyer_id, v_order.producer_id]) AS u;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 12. DROITS D'EXÉCUTION
-- ============================================================
-- Sur Supabase, les droits par défaut donnent EXECUTE à anon / authenticated en direct :
-- REVOKE ... FROM PUBLIC ne suffit pas, on retire explicitement chaque rôle.
REVOKE ALL ON FUNCTION _order_error(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _checkout_result(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _drop_check_constraints(regclass, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION create_order_from_cart(uuid, jsonb, jsonb, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_order_from_cart(uuid, jsonb, jsonb, text, numeric) TO authenticated;

REVOKE ALL ON FUNCTION transition_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transition_order_status(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION confirm_cash_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION confirm_cash_payment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION apply_provider_payment_event(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_provider_payment_event(uuid, text, text, text) TO service_role;
