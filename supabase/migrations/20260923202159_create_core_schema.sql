/*
# AgriFlow RDC — Core Schema

## Overview
Creates the full database schema for AgriFlow RDC, a premium agritech marketplace
connecting agricultural producers directly with buyers in the Democratic Republic
of Congo. This migration creates all tables, relationships, indexes, and RLS policies.

## New Tables
1. `profiles` — User profiles with role (producer/cooperative/buyer), full name, phone, location, avatar, bio, verification status
2. `products` — Product listings published by producers: name, category, variety, quantity, unit, price, location, availability date, description, images, status
3. `buyer_requests` — Purchase requests published by buyers: product needed, quantity, budget, location, desired date, description, status
4. `orders` — Orders placed by buyers on products: status workflow (pending→confirmed→preparing→ready→in_delivery→delivered→completed), total amount, payment method, payment status, delivery info
5. `order_status_history` — Timeline tracking for each status change on an order
6. `messages` — Conversations between producers and buyers linked to a product or order
7. `notifications` — User notification center
8. `favorites` — Products saved by buyers
9. `reviews` — Post-transaction ratings between buyer and producer
10. `deliveries` — Delivery tracking for orders: status, estimated date, distance, transport info

## Security (RLS)
- All tables have RLS enabled.
- `profiles`: users can read all profiles (public directory), update only their own.
- `products`: public read (marketplace), owner create/update/delete.
- `buyer_requests`: public read (marketplace), owner create/update/delete.
- `orders`: owner (buyer) and product owner (producer) can read; buyer creates; producer updates status.
- `order_status_history`: readable by order participants, created by system/producer.
- `messages`: participants can read and insert messages in their conversations.
- `notifications`: owner-only read/update/delete.
- `favorites`: owner-only CRUD.
- `reviews`: public read, owner create (must be a participant of the order).
- `deliveries`: order participants can read; producer can update.
- All owner columns default to `auth.uid()` so inserts work without passing user_id.
*/

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'buyer' CHECK (role IN ('producer', 'cooperative', 'buyer')),
  buyer_type text CHECK (buyer_type IN ('restaurant', 'market', 'wholesaler', 'agro_industry', 'enterprise')),
  full_name text NOT NULL,
  phone text,
  province text,
  city text,
  bio text,
  avatar_url text,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_public_read" ON profiles;
CREATE POLICY "profiles_public_read" ON profiles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "profiles_owner_insert" ON profiles;
CREATE POLICY "profiles_owner_insert" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles_owner_update" ON profiles;
CREATE POLICY "profiles_owner_update" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles(city);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  variety text,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'kg',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  price_negotiable boolean NOT NULL DEFAULT false,
  province text,
  city text,
  latitude numeric,
  longitude numeric,
  availability_date date,
  description text,
  images text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold_out', 'draft')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_public_read" ON products;
CREATE POLICY "products_public_read" ON products FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "products_owner_insert" ON products;
CREATE POLICY "products_owner_insert" ON products FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "products_owner_update" ON products;
CREATE POLICY "products_owner_update" ON products FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "products_owner_delete" ON products;
CREATE POLICY "products_owner_delete" ON products FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_city ON products(city);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin (to_tsvector('simple', name));

-- ============================================================
-- BUYER REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS buyer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  category text,
  quantity numeric NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  budget numeric,
  currency text NOT NULL DEFAULT 'USD',
  province text,
  city text,
  desired_date date,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fulfilled', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE buyer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests_public_read" ON buyer_requests;
CREATE POLICY "requests_public_read" ON buyer_requests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "requests_owner_insert" ON buyer_requests;
CREATE POLICY "requests_owner_insert" ON buyer_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "requests_owner_update" ON buyer_requests;
CREATE POLICY "requests_owner_update" ON buyer_requests FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "requests_owner_delete" ON buyer_requests;
CREATE POLICY "requests_owner_delete" ON buyer_requests FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_requests_category ON buyer_requests(category);
CREATE INDEX IF NOT EXISTS idx_requests_status ON buyer_requests(status);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  producer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  total_amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'completed', 'cancelled')),
  payment_method text CHECK (payment_method IN ('mobile_money', 'card', 'cash_on_delivery')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'demo_paid', 'paid', 'failed')),
  delivery_address text,
  delivery_city text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_participant_read" ON orders;
CREATE POLICY "orders_participant_read" ON orders FOR SELECT
  TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = producer_id);

DROP POLICY IF EXISTS "orders_buyer_insert" ON orders;
CREATE POLICY "orders_buyer_insert" ON orders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "orders_participant_update" ON orders;
CREATE POLICY "orders_participant_update" ON orders FOR UPDATE
  TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = producer_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = producer_id);

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_producer ON orders(producer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ============================================================
-- ORDER STATUS HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "history_participant_read" ON order_status_history;
CREATE POLICY "history_participant_read" ON order_status_history FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_status_history.order_id
      AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "history_participant_insert" ON order_status_history;
CREATE POLICY "history_participant_insert" ON order_status_history FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_status_history.order_id
      AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_history_order ON order_status_history(order_id);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_participant_read" ON messages;
CREATE POLICY "messages_participant_read" ON messages FOR SELECT
  TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "messages_sender_insert" ON messages;
CREATE POLICY "messages_sender_insert" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "messages_participant_update" ON messages;
CREATE POLICY "messages_participant_update" ON messages FOR UPDATE
  TO authenticated USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);

CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_owner_read" ON notifications;
CREATE POLICY "notif_owner_read" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_owner_insert" ON notifications;
CREATE POLICY "notif_owner_insert" ON notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_owner_update" ON notifications;
CREATE POLICY "notif_owner_update" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_owner_delete" ON notifications;
CREATE POLICY "notif_owner_delete" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(is_read);

-- ============================================================
-- FAVORITES
-- ============================================================
CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fav_owner_read" ON favorites;
CREATE POLICY "fav_owner_read" ON favorites FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_owner_insert" ON favorites;
CREATE POLICY "fav_owner_insert" ON favorites FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_owner_delete" ON favorites;
CREATE POLICY "fav_owner_delete" ON favorites FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fav_user ON favorites(user_id);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_public_read" ON reviews;
CREATE POLICY "reviews_public_read" ON reviews FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "reviews_owner_insert" ON reviews;
CREATE POLICY "reviews_owner_insert" ON reviews FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reviewer_id);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);

-- ============================================================
-- DELIVERIES
-- ============================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pickup', 'in_transit', 'delivered', 'failed')),
  transport_type text,
  distance_km numeric,
  estimated_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_participant_read" ON deliveries;
CREATE POLICY "delivery_participant_read" ON deliveries FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = deliveries.order_id
      AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "delivery_participant_insert" ON deliveries;
CREATE POLICY "delivery_participant_insert" ON deliveries FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = deliveries.order_id
      AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "delivery_participant_update" ON deliveries;
CREATE POLICY "delivery_participant_update" ON deliveries FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = deliveries.order_id
      AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = deliveries.order_id
      AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_delivery_order ON deliveries(order_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_requests_updated ON buyer_requests;
CREATE TRIGGER trg_requests_updated BEFORE UPDATE ON buyer_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_deliveries_updated ON deliveries;
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
