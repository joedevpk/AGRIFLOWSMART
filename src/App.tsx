import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { NativeBridge } from '@/components/system/NativeBridge';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/auth-context';
import { CartProvider } from '@/contexts/CartContext';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SyncProvider } from '@/contexts/SyncContext';
import { ToastContainer, LoadingState } from '@/components/ui';
import { BottomNav } from '@/components/layout/BottomNav';
import { hasBottomNav } from '@/lib/bottom-nav';
import { ScrollManager } from '@/components/system/ScrollManager';
import { LandingPage } from '@/pages/LandingPage';
import { MarketplacePage } from '@/pages/MarketplacePage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
import { HowItWorksPage } from '@/pages/HowItWorksPage';
import { AboutPage } from '@/pages/AboutPage';
import { ProducersPage } from '@/pages/ProducersPage';
import { BuyersPage } from '@/pages/BuyersPage';
import { ProducerProfilePage } from '@/pages/ProducerProfilePage';
import { AgriMatchPage } from '@/pages/AgriMatchPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ProducerProductsPage } from '@/pages/dashboard/ProducerProductsPage';
import { PublishProductPage } from '@/pages/dashboard/PublishProductPage';
import { ProducerOrdersPage } from '@/pages/dashboard/ProducerOrdersPage';
import { ProducerRequestsPage } from '@/pages/dashboard/ProducerRequestsPage';
import { BuyerRequestsPage } from '@/pages/dashboard/BuyerRequestsPage';
import { BuyerOrdersPage } from '@/pages/dashboard/BuyerOrdersPage';
import { BuyerSuppliersPage } from '@/pages/dashboard/BuyerSuppliersPage';
import { OrderDetailPage } from '@/pages/OrderDetailPage';
import { CartPage } from '@/pages/CartPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { CheckoutConfirmationPage } from '@/pages/CheckoutConfirmationPage';
import { PaymentResultPage } from '@/pages/PaymentResultPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { DeliveriesPage } from '@/pages/DeliveriesPage';
import { AdminPage } from '@/pages/AdminPage';
import { AdminCommissionsPage } from '@/pages/admin/AdminCommissionsPage';
import { AdminFinancePage } from '@/pages/admin/AdminFinancePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProducerSalesPage } from '@/pages/dashboard/ProducerSalesPage';
import { CooperativesPage } from '@/pages/institutional/CooperativesPage';
import { EnterprisesPage } from '@/pages/institutional/EnterprisesPage';
import { HelpPage } from '@/pages/institutional/HelpPage';
import { ContactPage } from '@/pages/institutional/ContactPage';
import { useLastSeen } from '@/hooks/useLastSeen';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { setLogUser } from '@/lib/logger';
import { ConsentManager } from '@/components/consent/ConsentManager';

// Pages de confiance (textes longs) : chargées à la demande, hors du bundle initial.
const PrivacyPage = lazy(() => import('@/pages/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('@/pages/legal/TermsPage').then((m) => ({ default: m.TermsPage })));
const CookiesPage = lazy(() => import('@/pages/legal/CookiesPage').then((m) => ({ default: m.CookiesPage })));
const RefundPage = lazy(() => import('@/pages/legal/RefundPage').then((m) => ({ default: m.RefundPage })));
const TrustCenterPage = lazy(() => import('@/pages/legal/TrustCenterPage').then((m) => ({ default: m.TrustCenterPage })));

// Modules Agri : chargés à la demande pour ne pas alourdir le démarrage (connexions faibles).
const AgriGuidePage = lazy(() => import('@/pages/agri/AgriGuidePage').then((m) => ({ default: m.AgriGuidePage })));
const CropGuidePage = lazy(() => import('@/pages/agri/CropGuidePage').then((m) => ({ default: m.CropGuidePage })));
const CalendarPage = lazy(() => import('@/pages/agri/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const PlotsPage = lazy(() => import('@/pages/agri/PlotsPage').then((m) => ({ default: m.PlotsPage })));
const PlotDetailPage = lazy(() => import('@/pages/agri/PlotDetailPage').then((m) => ({ default: m.PlotDetailPage })));

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Pages réservées à ceux qui vendent (producteurs, coopératives) : un acheteur y est redirigé.
// Confort d'UX uniquement — la publication d'offres est aussi limitée côté base (RLS).
function SellerRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return null;
  if (profile.role === 'buyer') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Le contrôle du rôle ici est un confort d'UX : la protection réelle des
// données admin est assurée par les policies RLS (is_admin()) côté Supabase,
// pas par cette vérification frontend.
function AdminRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return null;
  if (profile.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/marketplace/:id" element={<ProductDetailPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
      <Route path="/checkout/confirmation/:checkoutId" element={<ProtectedRoute><CheckoutConfirmationPage /></ProtectedRoute>} />
      <Route path="/payment/result/:reference" element={<ProtectedRoute><PaymentResultPage /></ProtectedRoute>} />
      <Route path="/comment-ca-marche" element={<HowItWorksPage />} />
      <Route path="/a-propos" element={<AboutPage />} />
      <Route path="/how-it-works" element={<Navigate to="/comment-ca-marche" replace />} />
      <Route path="/cooperatives" element={<CooperativesPage />} />
      <Route path="/entreprises" element={<EnterprisesPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/confiance" element={<TrustCenterPage />} />
      <Route path="/confidentialite" element={<PrivacyPage />} />
      <Route path="/conditions" element={<TermsPage />} />
      <Route path="/cookies" element={<CookiesPage />} />
      <Route path="/remboursement" element={<RefundPage />} />
      <Route path="/agriguide" element={<AgriGuidePage />} />
      <Route path="/agriguide/:cropId" element={<CropGuidePage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/producers" element={<ProducersPage />} />
      <Route path="/producer/:id" element={<ProducerProfilePage />} />
      <Route path="/buyers" element={<BuyersPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/producer/products" element={<SellerRoute><ProducerProductsPage /></SellerRoute>} />
      <Route path="/producer/products/new" element={<SellerRoute><PublishProductPage /></SellerRoute>} />
      <Route path="/producer/products/:id/edit" element={<SellerRoute><PublishProductPage /></SellerRoute>} />
      <Route path="/plots" element={<SellerRoute><PlotsPage /></SellerRoute>} />
      <Route path="/plots/:id" element={<SellerRoute><PlotDetailPage /></SellerRoute>} />
      <Route path="/producer/orders" element={<SellerRoute><ProducerOrdersPage /></SellerRoute>} />
      <Route path="/producer/sales" element={<SellerRoute><ProducerSalesPage /></SellerRoute>} />
      <Route path="/producer/requests" element={<SellerRoute><ProducerRequestsPage /></SellerRoute>} />
      <Route path="/buyer/requests" element={<ProtectedRoute><BuyerRequestsPage /></ProtectedRoute>} />
      <Route path="/agrimatch/:requestId" element={<ProtectedRoute><AgriMatchPage /></ProtectedRoute>} />
      <Route path="/buyer/orders" element={<ProtectedRoute><BuyerOrdersPage /></ProtectedRoute>} />
      <Route path="/buyer/suppliers" element={<ProtectedRoute><BuyerSuppliersPage /></ProtectedRoute>} />
      <Route path="/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
      <Route path="/favorites" element={<ProtectedRoute><FavoritesPage /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
      <Route path="/deliveries" element={<ProtectedRoute><DeliveriesPage /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="/admin/commissions" element={<AdminRoute><AdminCommissionsPage /></AdminRoute>} />
      <Route path="/admin/finance" element={<AdminRoute><AdminFinancePage /></AdminRoute>} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function AppShell() {
  const location = useLocation();
  const { user } = useAuth();
  useLastSeen();
  useEffect(() => { setLogUser(user?.id ?? null); }, [user?.id]);
  const showBottomNav = hasBottomNav(location.pathname);

  return (
    <div className={showBottomNav ? 'pb-nav' : undefined}>
      {/* Placé en premier dans le DOM : la bannière est atteinte dès la première tabulation au clavier. */}
      <ConsentManager />
      {/* Défilement central : haut de page à chaque nouvelle route, restauration sur Précédent/Suivant, ancres. */}
      <ScrollManager />
      <NativeBridge />
      {/* resetKey : une nouvelle route efface l'erreur affichée par la page précédente. */}
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<LoadingState />}>
          <AppRoutes />
        </Suspense>
      </ErrorBoundary>
      {showBottomNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <SyncProvider>
            <CartProvider>
              <BrowserRouter>
                <FavoritesProvider>
                  <AppShell />
                  <ToastContainer />
                </FavoritesProvider>
              </BrowserRouter>
            </CartProvider>
          </SyncProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
