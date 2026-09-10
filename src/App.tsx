import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SettingsProvider } from '@/context/SettingsContext';
import { ToastProvider } from '@/context/ToastContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { SyncProvider } from '@/context/SyncContext';
import { RefreshProvider } from '@/context/RefreshContext';
import { Layout } from '@/components/Layout';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SettingsPage } from '@/pages/Settings';
import { PromoManagement } from '@/pages/PromoManagement';
import { Dashboard } from '@/pages/Dashboard';
import { Bookings } from '@/pages/Bookings';
import { LabOrders } from '@/pages/StudioWork';
import { Ledger } from '@/pages/Photographers';
import { Payments } from '@/pages/Payments';
import { PublicInvoice } from '@/pages/PublicInvoice';
import { ClientLogin } from '@/pages/ClientLogin';
import { ClientDashboard } from '@/pages/ClientDashboard';
import { PartnerDashboard } from '@/pages/PartnerDashboard';
import { AdminLogin, getAdminSession } from '@/pages/AdminLogin';
import { getClientSession } from '@/pages/ClientLogin';
import { MusicSelection, PublicMusicSelection } from '@/pages/MusicSelection';
import { TeaserPreview, PublicTeaserPreview } from '@/pages/TeaserPreview';
import { InvitationHub, PublicInvitationHub } from '@/pages/InvitationHub';
import type { PageKey } from '@/lib/types';

function AdminApp() {
  const [page, setPage] = useState<PageKey>('dashboard');

  return (
    <Layout current={page} onNavigate={setPage}>
      <ErrorBoundary>
        <DesktopPage page={page} onNavigate={setPage} />
      </ErrorBoundary>
    </Layout>
  );
}

function DesktopPage({ page, onNavigate }: { page: PageKey; onNavigate: (page: PageKey) => void }) {
  return (
    <div className="mx-auto my-6 flex min-h-[85vh] w-full max-w-6xl flex-col overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/30 p-4 sm:p-6 lg:p-8">
      {page === 'bookings' && <Bookings />}
      {page === 'lab' && <LabOrders />}
      {page === 'ledger' && <Ledger />}
      {page === 'payments' && <Payments />}
      {page === 'promo' && <PromoManagement />}
      {page === 'music' && <MusicSelection />}
      {page === 'teaser' && <TeaserPreview />}
      {page === 'invitation' && <InvitationHub />}
      {page === 'settings' && <SettingsPage />}
      {page === 'dashboard' && <Dashboard onNavigate={onNavigate} />}
    </div>
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
                  <Route path="/music-selection" element={<PublicMusicSelection />} />
                  <Route path="/teaser-preview" element={<PublicTeaserPreview />} />
                  <Route path="/invitation-hub" element={<PublicInvitationHub />} />
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
