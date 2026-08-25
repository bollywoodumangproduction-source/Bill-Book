import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SettingsProvider } from '@/context/SettingsContext';
import { ToastProvider } from '@/context/ToastContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { SyncProvider } from '@/context/SyncContext';
import { RefreshProvider } from '@/context/RefreshContext';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Bookings } from '@/pages/Bookings';
import { LabOrders } from '@/pages/StudioWork';
import { Ledger } from '@/pages/Photographers';
import { Payments } from '@/pages/Payments';
import { SettingsPage } from '@/pages/Settings';
import { PublicInvoice } from '@/pages/PublicInvoice';
import { ClientLogin } from '@/pages/ClientLogin';
import { ClientDashboard } from '@/pages/ClientDashboard';
import { AdminLogin, getAdminSession } from '@/pages/AdminLogin';
import { getClientSession } from '@/pages/ClientLogin';
import type { PageKey } from '@/lib/types';

function AdminApp() {
  const [page, setPage] = useState<PageKey>('dashboard');

  return (
    <Layout current={page} onNavigate={setPage}>
      {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
      {page === 'bookings' && <Bookings />}
      {page === 'lab' && <LabOrders />}
      {page === 'ledger' && <Ledger />}
      {page === 'payments' && <Payments />}
      {page === 'settings' && <SettingsPage />}
    </Layout>
  );
}

function AdminGuard() {
  const location = useLocation();
  if (!getAdminSession()) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }
  return <AdminApp />;
}

function ClientGuard() {
  const location = useLocation();
  if (!getClientSession()) {
    return <Navigate to="/client-login" replace state={{ from: location }} />;
  }
  return <ClientDashboard />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SyncProvider>
          <RefreshProvider>
            <SettingsProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<AdminGuard />} />
                  <Route path="/admin" element={<AdminGuard />} />
                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route path="/client-login" element={<ClientLogin />} />
                  <Route path="/client/dashboard" element={<ClientGuard />} />
                  <Route path="/view/:bookingId" element={<PublicInvoice />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </SettingsProvider>
          </RefreshProvider>
        </SyncProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
