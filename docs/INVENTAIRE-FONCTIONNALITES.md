# Inventaire des fonctionnalités (généré depuis le code)

Routes déclarées : **53** · pages (.tsx) : **51** · services : **11** · fonctions Edge : **6** · migrations SQL : **15**

Généré par `node scripts/inventory.mjs`. « Accès » = gardes de route déclarées dans `src/App.tsx` (la sécurité réelle repose aussi sur la RLS Supabase).

## Public et découverte (23)

| Route | Page | Accès |
|---|---|---|
| `/` | LandingPage | public |
| `/marketplace` | MarketplacePage | public |
| `/marketplace/:id` | ProductDetailPage | public |
| `/cart` | CartPage | public |
| `/comment-ca-marche` | HowItWorksPage | public |
| `/a-propos` | AboutPage | public |
| `/how-it-works` | — | public |
| `/cooperatives` | CooperativesPage | public |
| `/entreprises` | EnterprisesPage | public |
| `/help` | HelpPage | public |
| `/contact` | ContactPage | public |
| `/confiance` | TrustCenterPage | public |
| `/confidentialite` | PrivacyPage | public |
| `/conditions` | TermsPage | public |
| `/cookies` | CookiesPage | public |
| `/remboursement` | RefundPage | public |
| `/agriguide` | AgriGuidePage | public |
| `/agriguide/:cropId` | CropGuidePage | public |
| `/calendar` | CalendarPage | public |
| `/producers` | ProducersPage | public |
| `/producer/:id` | ProducerProfilePage | public |
| `/buyers` | BuyersPage | public |
| `*` | NotFoundPage | public |

## Authentification (4)

| Route | Page | Accès |
|---|---|---|
| `/login` | LoginPage | public |
| `/register` | RegisterPage | public |
| `/forgot-password` | ForgotPasswordPage | public |
| `/reset-password` | ResetPasswordPage | public |

## Espace connecté (acheteur / producteur / commun) (23)

| Route | Page | Accès |
|---|---|---|
| `/checkout` | CheckoutPage | ProtectedRoute |
| `/checkout/confirmation/:checkoutId` | CheckoutConfirmationPage | ProtectedRoute |
| `/payment/result/:reference` | PaymentResultPage | ProtectedRoute |
| `/dashboard` | DashboardPage | ProtectedRoute |
| `/producer/products` | ProducerProductsPage | SellerRoute |
| `/producer/products/new` | PublishProductPage | SellerRoute |
| `/producer/products/:id/edit` | PublishProductPage | SellerRoute |
| `/plots` | PlotsPage | SellerRoute |
| `/plots/:id` | PlotDetailPage | SellerRoute |
| `/producer/orders` | ProducerOrdersPage | SellerRoute |
| `/producer/sales` | ProducerSalesPage | SellerRoute |
| `/producer/requests` | ProducerRequestsPage | SellerRoute |
| `/buyer/requests` | BuyerRequestsPage | ProtectedRoute |
| `/agrimatch/:requestId` | AgriMatchPage | ProtectedRoute |
| `/buyer/orders` | BuyerOrdersPage | ProtectedRoute |
| `/buyer/suppliers` | BuyerSuppliersPage | ProtectedRoute |
| `/orders/:id` | OrderDetailPage | ProtectedRoute |
| `/favorites` | FavoritesPage | ProtectedRoute |
| `/messages` | MessagesPage | ProtectedRoute |
| `/notifications` | NotificationsPage | ProtectedRoute |
| `/profile` | ProfilePage | ProtectedRoute |
| `/payments` | PaymentsPage | ProtectedRoute |
| `/deliveries` | DeliveriesPage | ProtectedRoute |

## Administration (3)

| Route | Page | Accès |
|---|---|---|
| `/admin` | AdminPage | AdminRoute |
| `/admin/commissions` | AdminCommissionsPage | AdminRoute |
| `/admin/finance` | AdminFinancePage | AdminRoute |

## Fonctions serveur (Supabase Edge Functions)

- `order-confirmation-cron`
- `payment-initiate`
- `payment-refund`
- `payment-status`
- `payment-verify`
- `payment-webhook`

## Services applicatifs (`src/services`)

- `agriService.ts`
- `availabilityService.ts`
- `cartService.ts`
- `confirmationService.ts`
- `deliveryService.ts`
- `favoritesService.ts`
- `notificationService.ts`
- `orderService.ts`
- `paymentService.ts`
- `privacyService.ts`
- `serviceResult.ts`

