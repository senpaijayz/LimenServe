import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import PublicLayout from './components/layout/PublicLayout';
import PageLoader from './components/ui/PageLoader';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ThemeProvider } from './context/ThemeContext';

const LoginPage = lazy(() => import('./modules/auth/pages/LoginPage'));
const AdminDashboard = lazy(() => import('./modules/dashboard/pages/AdminDashboard'));
const InventoryList = lazy(() => import('./modules/inventory/pages/InventoryList'));
const POSTerminal = lazy(() => import('./modules/pos/pages/POSTerminal'));
const QuoteBuilder = lazy(() => import('./modules/quotation/pages/QuoteBuilder'));
const ServiceOrderList = lazy(() => import('./modules/services/pages/ServiceOrderList'));
const StockroomV2 = lazy(() => import('./modules/stockroom/pages/StockroomV2'));
const SalesReport = lazy(() => import('./modules/reports/pages/SalesReport'));
const UserManagement = lazy(() => import('./modules/users/pages/UserManagement'));

const PublicHome = lazy(() => import('./modules/public/pages/PublicHome'));
const PublicCatalog = lazy(() => import('./modules/public/pages/PublicCatalog'));
const PublicEstimate = lazy(() => import('./modules/public/pages/PublicEstimate'));
const PublicAbout = lazy(() => import('./modules/public/pages/PublicAbout'));
const PublicServiceOrders = lazy(() => import('./modules/public/pages/PublicServiceOrders'));

function WorkspaceRouteFallback({ title = 'Loading workspace' }) {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="overflow-hidden rounded-2xl border border-primary-200 bg-white p-6 shadow-sm">
        <div className="h-4 w-40 rounded-full bg-primary-200" />
        <div className="mt-4 h-10 w-72 rounded-2xl bg-primary-100" />
        <div className="mt-3 h-4 w-96 max-w-full rounded-full bg-primary-100" />
        <p className="mt-6 text-sm font-medium text-primary-500">{title}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 rounded-2xl border border-primary-200 bg-white shadow-sm" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="h-80 rounded-2xl border border-primary-200 bg-white shadow-sm" />
        <div className="h-80 rounded-2xl border border-primary-200 bg-white shadow-sm" />
      </div>
    </div>
  );
}

function renderRoute(Component, fallback) {
  return (
    <Suspense fallback={fallback}>
      <Component />
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <CartProvider>
            <ToastProvider>
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route path="/" element={renderRoute(PublicHome, <PageLoader />)} />
                  <Route path="/catalog" element={renderRoute(PublicCatalog, <PageLoader />)} />
                  <Route path="/estimate" element={renderRoute(PublicEstimate, <PageLoader />)} />
                  <Route path="/service-orders" element={renderRoute(PublicServiceOrders, <PageLoader />)} />
                  <Route path="/about" element={renderRoute(PublicAbout, <PageLoader />)} />
                </Route>

                <Route path="/login" element={renderRoute(LoginPage, <PageLoader />)} />

                <Route element={<MainLayout />}>
                  <Route path="/dashboard" element={renderRoute(AdminDashboard, <WorkspaceRouteFallback title="Loading dashboard" />)} />
                  <Route path="/inventory" element={renderRoute(InventoryList, <WorkspaceRouteFallback title="Loading inventory" />)} />
                  <Route path="/pos" element={renderRoute(POSTerminal, <WorkspaceRouteFallback title="Loading point of sale" />)} />
                  <Route path="/quotation" element={renderRoute(QuoteBuilder, <WorkspaceRouteFallback title="Loading quotation builder" />)} />
                  <Route path="/services" element={renderRoute(ServiceOrderList, <WorkspaceRouteFallback title="Loading service orders" />)} />
                  <Route path="/stockroom" element={renderRoute(StockroomV2, <WorkspaceRouteFallback title="Loading 3D Stockroom V2" />)} />
                  <Route path="/reports" element={renderRoute(SalesReport, <WorkspaceRouteFallback title="Loading reports" />)} />
                  <Route path="/reports/sales" element={renderRoute(SalesReport, <WorkspaceRouteFallback title="Loading reports" />)} />
                  <Route path="/users" element={renderRoute(UserManagement, <WorkspaceRouteFallback title="Loading user management" />)} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ToastProvider>
          </CartProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
