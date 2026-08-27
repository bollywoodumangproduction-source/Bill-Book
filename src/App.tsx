import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SettingsProvider } from '@/context/SettingsContext';
import { ToastProvider } from '@/context/ToastContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { SyncProvider } from '@/context/SyncContext';
import { RefreshProvider } from '@/context/RefreshContext';
import { Layout } from '@/components/Layout';
import { SettingsPage } from '@/pages/Settings';
import { PublicInvoice } from '@/pages/PublicInvoice';
import { ClientLogin } from '@/pages/ClientLogin';
import { ClientDashboard } from '@/pages/ClientDashboard';
import { PartnerDashboard } from '@/pages/PartnerDashboard';
import { AdminLogin, getAdminSession } from '@/pages/AdminLogin';
import { getClientSession } from '@/pages/ClientLogin';
import type { PageKey } from '@/lib/types';
import { DesktopWindowManager, MobilePage } from '@/components/DesktopWindowManager';

function AdminApp() {
  const [page, setPage] = useState<PageKey>('dashboard');

  return (
    <Layout current={page} onNavigate={setPage}>
      <div className="hidden md:block"><DesktopWindowManager currentPage={page} onNavigate={setPage} /></div>
      <div className="md:hidden">{page === 'settings' ? <SettingsPage /> : <MobilePage page={page} onNavigate={setPage} />}</div>
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
                  <Route path="/partner/dashboard" element={<PartnerDashboard />} />
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
