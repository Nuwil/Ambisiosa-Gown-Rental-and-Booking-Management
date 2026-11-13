import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, HOME } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import { PageSpinner } from './components/ui/Feedback.jsx';
import { LoginPage, RegisterPage } from './features/auth/AuthPages.jsx';
import { AdminDashboard, OwnerDashboard, RenterDashboard } from './features/shared/Dashboards.jsx';
import LandingPage from './landing/LandingPage.jsx';
import StaffPage from './features/owner/StaffPage.jsx';
import SettingsPage from './features/shared/SettingsPage.jsx';
import CustomersPage from './features/owner/CustomersPage.jsx';
import CustomerProfilePage from './features/owner/CustomerProfilePage.jsx';
import OwnerTransactionsPage from './features/owner/TransactionsPage.jsx';
import InventoryPage from './features/owner/InventoryPage.jsx';
import BrowsePage from './features/renter/BrowsePage.jsx';
import CartPage from './features/cart/CartPage.jsx';
import ItemDetailPage from './features/renter/ItemDetailPage.jsx';
import OversightPage from './features/admin/OversightPage.jsx';
import AdminSettingsPage from './features/admin/AdminSettingsPage.jsx';

// Charts (recharts) are the heaviest dependency, so the analytics page is split into its own chunk.
const AnalyticsPage = lazy(() => import('./features/shared/AnalyticsPage.jsx'));

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  return <Navigate to={user ? HOME[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<LandingPage />} />

        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="/admin" element={<AppLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="oversight" element={<OversightPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>

        {/* The shop workspace: the owner and their staff. Analytics and staff management are owner-only. */}
        <Route element={<ProtectedRoute roles={['owner', 'staff']} />}>
          <Route path="/owner" element={<AppLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<OwnerDashboard />} />
            <Route element={<ProtectedRoute roles={['owner', 'staff']} permission="customers" />}>
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id" element={<CustomerProfilePage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['owner', 'staff']} permission="transactions" />}>
              <Route path="transactions" element={<OwnerTransactionsPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['owner', 'staff']} permission="inventory" />}>
              <Route path="inventory" element={<InventoryPage />} />
            </Route>
            <Route path="settings" element={<SettingsPage />} />
            <Route element={<ProtectedRoute roles={['owner']} />}>
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="staff" element={<StaffPage />} />
            </Route>
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['renter']} />}>
          <Route path="/renter" element={<AppLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<RenterDashboard />} />
            <Route path="items" element={<BrowsePage />} />
            <Route path="items/:id" element={<ItemDetailPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Suspense>
  );
}
