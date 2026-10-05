/**
 * Listes de colonnes Supabase explicites (remplacent `select('*')`) : charge réseau et PostgreSQL réduites,
 * et une colonne ajoutée plus tard à une table n'est jamais exposée au client par accident.
 * Les colonnes reflètent le schéma des migrations ; une colonne inexistante ferait échouer la requête (à tester).
 */
const PRODUCER_JOIN = 'profiles!products_user_id_fkey(full_name, city, province, avatar_url, is_verified, role, is_available_for_orders, availability_until)';

/** Liste / carte produit : sans description, coordonnées ni updated_at (inutiles dans une grille). */
export const PRODUCT_LIST_COLUMNS = 'id, user_id, name, category, variety, quantity, unit, price, currency, price_negotiable, province, city, availability_date, images, status, created_at';
/** Fiche produit et formulaire d'édition. */
export const PRODUCT_DETAIL_COLUMNS = `${PRODUCT_LIST_COLUMNS}, description, latitude, longitude, updated_at`;
export const PRODUCT_LIST_WITH_PRODUCER = `${PRODUCT_LIST_COLUMNS}, ${PRODUCER_JOIN}`;
export const PRODUCT_DETAIL_WITH_PRODUCER = `${PRODUCT_DETAIL_COLUMNS}, ${PRODUCER_JOIN}`;

export const BUYER_REQUEST_COLUMNS = 'id, user_id, product_name, category, quantity, unit, budget, currency, province, city, desired_date, description, status, created_at, updated_at';
export const PLOT_COLUMNS = 'id, user_id, name, zone_id, locality, latitude, longitude, area_value, area_unit, current_crop, planned_crop, start_date, status, water_access, soil_type, soil_ph, planned_quantity, planned_unit, notes, version, created_at, updated_at';
export const PLOT_NOTE_COLUMNS = 'id, user_id, plot_id, body, created_at';
export const CROP_TIP_COLUMNS = 'id, crop_id, title, body, is_active, created_by, created_at, updated_at';
export const NOTIFICATION_COLUMNS = 'id, user_id, type, title, body, link, is_read, created_at';
export const ORDER_HISTORY_COLUMNS = 'id, order_id, status, changed_by, note, created_at';
/** Écran de résultat de paiement : jamais `metadata`, `checkout_url`, téléphone ni identifiants fournisseur. */
export const PAYMENT_RESULT_COLUMNS = 'id, order_id, status, amount, currency, method, internal_reference, failure_reason, created_at';
/** Administration : colonnes réellement affichées dans les tableaux. */
export const ADMIN_PRODUCT_COLUMNS = 'id, user_id, name, category, quantity, unit, price, currency, status, province, city, created_at, updated_at';
export const ADMIN_ORDER_COLUMNS = 'id, order_number, buyer_id, producer_id, product_id, quantity, unit, total_amount, currency, status, payment_method, payment_status, created_at, updated_at';
export const ADMIN_PROFILE_COLUMNS = 'id, user_id, role, buyer_type, full_name, province, city, bio, avatar_url, is_verified, created_at, updated_at';

const ORDER_COLUMNS = 'id, order_number, checkout_id, buyer_id, producer_id, product_id, quantity, unit, subtotal, delivery_fee, platform_fee, seller_amount, total_amount, currency, status, payment_method, payment_status, settlement_status, delivery_address, delivery_city, notes, confirmation_deadline, confirmed_at, expired_at, cancel_reason, created_at, updated_at';
const ORDER_ITEM_COLUMNS = 'id, order_id, product_id, producer_id, product_name, product_image, unit, unit_price, quantity, subtotal, currency, created_at';
const DELIVERY_COLUMNS = 'id, order_id, status, transport_type, distance_km, estimated_date, notes, recipient_name, recipient_phone, address, city, commune, delivered_at, created_at, updated_at';
/** Paiements d'une commande : jamais `metadata` ni `idempotency_key` (techniques, inutiles à l'écran). */
const ORDER_PAYMENT_COLUMNS = 'id, order_id, user_id, amount, currency, method, status, provider, provider_reference, is_demo, internal_reference, provider_transaction_id, provider_status, checkout_url, failure_reason, phone_number, operator, paid_at, failed_at, cancelled_at, refunded_at, created_at, updated_at';
const REFUND_COLUMNS = 'id, order_id, payment_id, amount, currency, status, created_at, updated_at';
/** Commande + relations réellement affichées (articles, livraison, paiements, remboursements). */
export const ORDER_WITH_DETAILS = `${ORDER_COLUMNS}, order_items(${ORDER_ITEM_COLUMNS}), delivery:deliveries(${DELIVERY_COLUMNS}), payments(${ORDER_PAYMENT_COLUMNS}), refunds(${REFUND_COLUMNS})`;
export const MESSAGE_WITH_PARTIES = 'id, sender_id, receiver_id, product_id, order_id, content, read_at, created_at, sender:profiles!messages_sender_id_fkey(full_name, avatar_url, role, city), receiver:profiles!messages_receiver_id_fkey(full_name, avatar_url, role, city)';
