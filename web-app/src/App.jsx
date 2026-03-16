import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import PageLoader from './components/ui/PageLoader';
import { Suspense, lazy } from 'react';

import MainLayout from './components/layout/MainLayout';
import PublicLayout from './components/layout/PublicLayout';

const LoginPage = lazy(() => import('./modules/auth/pages/LoginPage'));
const AdminDashboard = lazy(() => import('./modules/dashboard/pages/AdminDashboard'));
const InventoryList = lazy(() => import('./modules/inventory/pages/InventoryList'));
const POSTerminal = lazy(() => import('./modules/pos/pages/POSTerminal'));
const QuoteBuilder = lazy(() => import('./modules/quotation/pages/QuoteBuilder'));
const ServiceOrderList = lazy(() => import('./modules/services/pages/ServiceOrderList'));
const StockroomViewer = lazy(() => import('./modules/stockroom/pages/StockroomViewer'));
const SalesReport = lazy(() => import('./modules/reports/pages/SalesReport'));
const UserManagement = lazy(() => import('./modules/users/pages/UserManagement'));

const PublicHome = lazy(() => import('./modules/public/pages/PublicHome'));
const PublicCatalog = lazy(() => import('./modules/public/pages/PublicCatalog'));
const PublicEstimate = lazy(() => import('./modules/public/pages/PublicEstimate'));
const PublicAbout = lazy(() => import('./modules/public/pages/PublicAbout'));
const PublicServiceOrders = lazy(() => import('./modules/public/pages/PublicServiceOrders'));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <CartProvider>
            <ToastProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route element={<PublicLayout />}>
                    <Route path="/" element={<PublicHome />} />
                    <Route path="/catalog" element={<PublicCatalog />} />
                    <Route path="/estimate" element={<PublicEstimate />} />
                    <Route path="/service-orders" element={<PublicServiceOrders />} />
                    <Route path="/about" element={<PublicAbout />} />
                  </Route>

                  <Route path="/login" element={<LoginPage />} />

                  <Route element={<MainLayout />}>
                    <Route path="/dashboard" element={<AdminDashboard />} />
                    <Route path="/inventory" element={<InventoryList />} />
                    <Route path="/pos" element={<POSTerminal />} />
                    <Route path="/quotation" element={<QuoteBuilder />} />
                    <Route path="/services" element={<ServiceOrderList />} />
                    <Route path="/stockroom" element={<StockroomViewer />} />
                    <Route path="/reports" element={<SalesReport />} />
                    <Route path="/reports/sales" element={<SalesReport />} />
                    <Route path="/users" element={<UserManagement />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ToastProvider>
          </CartProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
