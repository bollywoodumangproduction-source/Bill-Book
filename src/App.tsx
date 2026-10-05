import { useEffect, useRef, useState } from 'react';
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
import { EquipmentRentals } from '@/pages/EquipmentRentals';
import { Payments } from '@/pages/Payments';
import { DairyBook } from '@/pages/DairyBook';
import { PublicInvoice } from '@/pages/PublicInvoice';
import { ClientLogin } from '@/pages/ClientLogin';
import { ClientDashboard } from '@/pages/ClientDashboard';
import { ClientLandingPage, PartnerLandingPage } from '@/pages/LandingPages';
import { PartnerLogin } from '@/pages/PartnerLogin';
import { PartnerDashboard, getPartnerSession } from '@/pages/PartnerDashboard';
import { AdminLogin, setAdminSession } from '@/pages/AdminLogin';
import { getClientSession } from '@/pages/ClientLogin';
import { MusicSelection, PublicMusicSelection } from '@/pages/MusicSelection';
import { TeaserPreview, PublicTeaserPreview } from '@/pages/TeaserPreview';
import { InvitationHub, PublicInvitationHub } from '@/pages/InvitationHub';
import { PhotoSelection } from '@/pages/PhotoSelection';
import { PublicPhotoSelection } from '@/pages/PublicPhotoSelection';
import type { PageKey } from '@/lib/types';
import { useAppBackGuard } from '@/lib/useAppBackGuard';
import { supabase } from '@/lib/supabase';

function AdminApp() {
  const [page, setPage] = useState<PageKey>('dashboard');
  const pageHistory = useRef<PageKey[]>([]);
  const currentPage = useRef<PageKey>('dashboard');

  const navigatePage = (nextPage: PageKey) => {
    if (nextPage === currentPage.current) return;
    pageHistory.current.push(currentPage.current);
    currentPage.current = nextPage;
    setPage(nextPage);
  };

  const goBack = () => {
    const previousPage = pageHistory.current.pop();
    if (!previousPage) return;
    currentPage.current = previousPage;
    setPage(previousPage);
  };
  const guardedGoBack = useAppBackGuard(goBack);

  return (
    <Layout current={page} onNavigate={navigatePage} onBack={guardedGoBack}>
      <ErrorBoundary>
        <DesktopPage page={page} onNavigate={navigatePage} />
      </ErrorBoundary>
    </Layout>
  );
}

function DesktopPage({ page, onNavigate }: { page: PageKey; onNavigate: (page: PageKey) => void }) {
  if (page === 'lab') return <LabOrders />;
  if (page === 'rentals') return <EquipmentRentals />;
  if (page === 'bookings') return <Bookings />;
  if (page === 'dairy') return <DairyBook />;
  if (page === 'promo') return <PromoManagement />;
  if (page === 'music') return <MusicSelection />;
  if (page === 'teaser') return <TeaserPreview />;
  if (page === 'invitation') return <InvitationHub />;
  if (page === 'photo-selection') return <PhotoSelection />;
  if (page === 'partners') return <Ledger key="partners" mode="partners" />;
  if (page === 'ledger') return <Ledger key="ledger" mode="ledger" />;
  if (page === 'payments') return <Payments />;

  return (
    <div className="mx-auto my-6 flex min-h-[85vh] w-full max-w-6xl flex-col overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/30 p-4 sm:p-6 lg:p-8">
      {page === 'settings' && <SettingsPage />}
      {page === 'dashboard' && <Dashboard onNavigate={onNavigate} />}
    </div>
  );
}

function AdminGuard() {
  const location = useLocation();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      const allowed = data.user?.app_metadata?.role === 'admin';
      if (active) {
        setAuthorized(allowed);
        if (allowed) setAdminSession();
        else sessionStorage.removeItem('bup_admin_session');
      }
    };
    void check();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const allowed = session?.user.app_metadata?.role === 'admin';
      if (active) {
        setAuthorized(allowed);
        if (allowed) setAdminSession();
        else sessionStorage.removeItem('bup_admin_session');
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Checking admin session…</div>;
  if (!authorized) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }
  return <AdminApp />;
}

function ClientGuard() {
  const location = useLocation();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const check = async () => {
      const [{ data: { user } }, localSession] = await Promise.all([supabase.auth.getUser(), Promise.resolve(getClientSession())]);
      const role = user?.app_metadata?.role;
      const allowed = !!localSession && user?.app_metadata?.portal_record_id === localSession.id
        && (role === 'client_booking' || role === 'client_lab');
      if (active) setAuthorized(allowed);
    };
    void check();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const localSession = getClientSession();
      const role = session?.user.app_metadata?.role;
      const allowed = !!localSession && session?.user.app_metadata?.portal_record_id === localSession.id
        && (role === 'client_booking' || role === 'client_lab');
      if (active) setAuthorized(allowed);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Checking client session…</div>;
  if (!authorized) {
    return <Navigate to="/client/login" replace state={{ from: location }} />;
  }
  return <ClientDashboard />;
}

function PartnerGuard() {
  const location = useLocation();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const check = async () => {
      const [{ data: { user } }, localPartner] = await Promise.all([supabase.auth.getUser(), Promise.resolve(getPartnerSession())]);
      const allowed = !!localPartner && user?.app_metadata?.role === 'partner'
        && user.app_metadata?.portal_record_id === localPartner.id;
      if (active) setAuthorized(allowed);
    };
    void check();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const localPartner = getPartnerSession();
      const allowed = !!localPartner && session?.user.app_metadata?.role === 'partner'
        && session.user.app_metadata?.portal_record_id === localPartner.id;
      if (active) setAuthorized(allowed);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Checking partner session…</div>;
  if (!authorized) {
    return <Navigate to="/partner/login" replace state={{ from: location }} />;
  }
  return <PartnerDashboard />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SyncProvider>
          <SettingsProvider>
            <RefreshProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<AdminGuard />} />
                  <Route path="/admin" element={<AdminGuard />} />
                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route path="/client" element={<ClientLandingPage />} />
                  <Route path="/client/login" element={<ClientLogin />} />
                  <Route path="/client-login" element={<Navigate to="/client/login" replace />} />
                  <Route path="/client/dashboard" element={<ClientGuard />} />
                  <Route path="/partner" element={<PartnerLandingPage />} />
                  <Route path="/partner/login" element={<PartnerLogin />} />
                  <Route path="/partner/dashboard" element={<PartnerGuard />} />
                  <Route path="/music-selection" element={<PublicMusicSelection />} />
                  <Route path="/teaser-preview" element={<PublicTeaserPreview />} />
                  <Route path="/invitation-hub" element={<PublicInvitationHub />} />
                  <Route path="/photo-selection" element={<PhotoSelection />} />
                  <Route path="/select/:sessionId" element={<PublicPhotoSelection />} />
                  <Route path="/view/:bookingId" element={<PublicInvoice />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </RefreshProvider>
          </SettingsProvider>
        </SyncProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
