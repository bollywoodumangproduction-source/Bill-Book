import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
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
import { AdminPasswordRecovery } from '@/pages/AdminPasswordRecovery';
import { getClientSession } from '@/pages/ClientLogin';
import { MusicSelection, PublicMusicSelection } from '@/pages/MusicSelection';
import { TeaserPreview, PublicTeaserPreview } from '@/pages/TeaserPreview';
import { InvitationHub, PublicInvitationHub } from '@/pages/InvitationHub';
import { PhotoSelection } from '@/pages/PhotoSelection';
import { PublicPhotoSelection } from '@/pages/PublicPhotoSelection';
import type { PageKey } from '@/lib/types';
import { useAppBackGuard } from '@/lib/useAppBackGuard';
import { supabase } from '@/lib/supabase';

const PWA_TARGET_ROUTE_KEY = 'pwa_target_route';
const LEGACY_PORTAL_PATH_KEY = 'bup_pwa_last_portal_path';

function restorablePortalPath(pathname: string, search: string): string | null {
  const isPortalPath = pathname === '/client' || pathname === '/client/login'
    || pathname === '/client/dashboard' || pathname === '/client-login'
    || pathname === '/partner' || pathname === '/partner/login' || pathname === '/partner/dashboard'
    || pathname === '/music-selection' || pathname === '/teaser-preview'
    || pathname === '/invitation-hub' || /^\/(select|view)\/[a-z\d-]+$/i.test(pathname);
  return isPortalPath ? `${pathname}${search}` : null;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function PwaInstallBanner() {
  const location = useLocation();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const isPortalRoute = restorablePortalPath(location.pathname, location.search) !== null;

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setStandalone(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (!isPortalRoute || standalone || !installPrompt) return null;
  return (
    <aside className="fixed inset-x-3 bottom-4 z-[200] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-slate-900/95 px-4 py-3 text-white shadow-2xl backdrop-blur">
      <p className="text-sm">Install Bollywood Umang for quick access.</p>
      <button onClick={() => void install()} className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">Install App Now</button>
    </aside>
  );
}

function RememberPortalPath() {
  const location = useLocation();
  useEffect(() => {
    const portalPath = restorablePortalPath(location.pathname, location.search);
    if (portalPath) localStorage.setItem(PWA_TARGET_ROUTE_KEY, portalPath);
  }, [location.pathname, location.search]);
  return null;
}

function PortalSelection() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-lg font-black text-slate-950">BU</div>
          <h1 className="mt-4 text-xl font-bold">Bollywood Umang</h1>
          <p className="mt-1 text-sm text-slate-400">Choose your portal to continue</p>
        </div>
        <div className="space-y-3">
          <Link to="/client/login" className="block rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-center text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20">Client Login</Link>
          <Link to="/partner/login" className="block rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-center text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20">Lab Partner Login</Link>
        </div>
      </div>
    </main>
  );
}

function AppLaunchRoute() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const resolveTarget = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      const role = user?.app_metadata?.role;
      let next: string;

      if (role === 'admin') {
        next = '/admin';
      } else if (role === 'partner') {
        const partner = getPartnerSession();
        next = partner && user?.app_metadata?.portal_record_id === partner.id ? '/partner/dashboard' : '/partner/login';
      } else if (role === 'client_booking' || role === 'client_lab') {
        const client = getClientSession();
        next = client && user?.app_metadata?.portal_record_id === client.id ? '/client/dashboard' : '/client/login';
      } else {
        const lastPortalPath = localStorage.getItem(PWA_TARGET_ROUTE_KEY)
          ?? localStorage.getItem(LEGACY_PORTAL_PATH_KEY);
        let validLastPath: string | null = null;
        if (lastPortalPath) {
          try {
            const savedUrl = new URL(lastPortalPath, window.location.origin);
            if (savedUrl.origin === window.location.origin) {
              validLastPath = restorablePortalPath(savedUrl.pathname, savedUrl.search);
            }
          } catch {
            localStorage.removeItem(PWA_TARGET_ROUTE_KEY);
            localStorage.removeItem(LEGACY_PORTAL_PATH_KEY);
          }
        }
        if (validLastPath) localStorage.setItem(PWA_TARGET_ROUTE_KEY, validLastPath);
        next = validLastPath ?? '/portal';
      }
      if (active) setTarget(next);
    };
    void resolveTarget();
    return () => { active = false; };
  }, []);

  if (!target) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Checking your portal…</div>;
  if (target === '/portal') return <PortalSelection />;
  return <Navigate to={target} replace />;
}

function AdminApp() {
  const [page, setPage] = useState<PageKey>('dashboard');
  const [openLabOrderId, setOpenLabOrderId] = useState<string | null>(null);
  const pageHistory = useRef<PageKey[]>([]);
  const currentPage = useRef<PageKey>('dashboard');

  const navigatePage = (nextPage: PageKey) => {
    if (nextPage === currentPage.current) return;
    pageHistory.current.push(currentPage.current);
    currentPage.current = nextPage;
    setPage(nextPage);
  };

  const openLabOrder = (orderId: string) => {
    setOpenLabOrderId(orderId);
    navigatePage('lab');
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
        <DesktopPage
          page={page}
          onNavigate={navigatePage}
          openLabOrderId={openLabOrderId}
          onLabOrderOpened={() => setOpenLabOrderId(null)}
          onOpenLabOrder={openLabOrder}
        />
      </ErrorBoundary>
    </Layout>
  );
}

function DesktopPage({ page, onNavigate, openLabOrderId, onLabOrderOpened, onOpenLabOrder }: {
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  openLabOrderId: string | null;
  onLabOrderOpened: () => void;
  onOpenLabOrder: (orderId: string) => void;
}) {
  if (page === 'lab') return <LabOrders openOrderId={openLabOrderId} onOrderOpened={onLabOrderOpened} />;
  if (page === 'rentals') return <EquipmentRentals />;
  if (page === 'bookings') return <Bookings />;
  if (page === 'dairy') return <DairyBook />;
  if (page === 'promo') return <PromoManagement />;
  if (page === 'music') return <MusicSelection />;
  if (page === 'teaser') return <TeaserPreview />;
  if (page === 'invitation') return <InvitationHub />;
  if (page === 'photo-selection') return <PhotoSelection />;
  if (page === 'partners') return <Ledger key="partners" mode="partners" />;
  if (page === 'ledger') return <Ledger key="ledger" mode="ledger" onOpenLabOrder={onOpenLabOrder} />;
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
                <RememberPortalPath />
                <PwaInstallBanner />
                <Routes>
                  <Route path="/" element={<AppLaunchRoute />} />
                  <Route path="/launch" element={<AppLaunchRoute />} />
                  <Route path="/portal" element={<PortalSelection />} />
                  <Route path="/admin" element={<AdminGuard />} />
                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route path="/admin/reset-password" element={<AdminPasswordRecovery />} />
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
