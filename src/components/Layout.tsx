import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarPlus,
  Clapperboard,
  Camera,
  Settings,
  Menu,
  X,
  MoreHorizontal,
  Home,
  Sparkles,
  Sun,
  Moon,
  Wallet,
  LogOut,
  Megaphone,
  Music2,
  Video,
  Mail,
  Images,
  BookOpen,
  Users,
} from 'lucide-react';
import type { PageKey } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useTheme } from '@/context/ThemeContext';
import { SyncBadges } from '@/components/SyncBadges';
import { clearAdminSession } from '@/pages/AdminLogin';
import { isRightEdgeBackSwipe, type TouchStartPoint } from '@/lib/touchNavigation';

interface LayoutProps {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  onBack: () => void;
  children: ReactNode;
}

const desktopNav: { key: PageKey; label: string; icon: typeof Home }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'bookings', label: 'Bookings', icon: CalendarPlus },
  { key: 'lab', label: 'Lab Orders', icon: Clapperboard },
  { key: 'rentals', label: 'Equipment Rentals', icon: Camera },
  { key: 'partners', label: 'Partners', icon: Users },
  { key: 'ledger', label: 'Ledger', icon: Camera },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'dairy', label: 'Dairy Book', icon: BookOpen },
  { key: 'promo', label: 'Promo & Setup', icon: Megaphone },
  { key: 'music', label: 'Music Selection', icon: Music2 },
  { key: 'teaser', label: 'Teaser & Clearance', icon: Video },
  { key: 'invitation', label: 'Invitation Hub', icon: Mail },
  { key: 'photo-selection', label: 'Photo Selection', icon: Images },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const mobileNav: { key: PageKey; label: string; icon: typeof Home }[] = [
  { key: 'dashboard', label: 'Home', icon: Home },
  { key: 'bookings', label: 'Bookings', icon: CalendarPlus },
  { key: 'lab', label: 'Lab', icon: Clapperboard },
  { key: 'payments', label: 'Pay', icon: Wallet },
];

const moreNav: { key: PageKey; label: string; icon: typeof Home }[] = [
  { key: 'partners', label: 'Partners', icon: Users },
  { key: 'rentals', label: 'Equipment Rentals', icon: Camera },
  { key: 'ledger', label: 'Ledger', icon: Camera },
  { key: 'dairy', label: 'Dairy Book', icon: BookOpen },
  { key: 'promo', label: 'Promo & Setup', icon: Megaphone },
  { key: 'music', label: 'Music Selection', icon: Music2 },
  { key: 'teaser', label: 'Teaser & Clearance', icon: Video },
  { key: 'invitation', label: 'Invitation Hub', icon: Mail },
  { key: 'photo-selection', label: 'Photo Selection', icon: Images },
  { key: 'settings', label: 'Settings', icon: Settings },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-white/5"
      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {theme === 'dark' ? (
        <>
          <Sun className="h-4 w-4 text-amber-400" />
          <span className="hidden sm:inline">Light</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 text-slate-600" />
          <span className="hidden sm:inline">Dark</span>
        </>
      )}
    </button>
  );
}

export function Layout({ current, onNavigate, onBack, children }: LayoutProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const touchStartRef = useRef<TouchStartPoint | null>(null);
  const { settings } = useSettings();
  const navigate = useNavigate();
  const logout = () => {
    clearAdminSession();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop sidebar */}
      <aside className="no-print fixed left-0 top-0 z-50 hidden h-screen w-60 flex-col border-r border-slate-200 bg-white md:flex dark:border-white/10 dark:bg-slate-900/80">
        <div className="flex items-center gap-3 px-5 py-5">
          {settings?.films_logo_url ? (
            <img src={settings.films_logo_url} alt="logo" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
              <Sparkles className="h-5 w-5 text-slate-900" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">Bollywood Umang</p>
            <p className="truncate text-xs text-amber-600 dark:text-amber-400">Films & Production</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {desktopNav.map((item) => {
            const Icon = item.icon;
            const active = current === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-slate-500">{settings?.address ?? 'Kamtaul, Darbhanga'}</p>
            <ThemeToggle />
          </div>
          <SyncBadges />
          <button
            onClick={logout}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-500 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
          >
            <LogOut className="h-3.5 w-3.5" /> Admin Logout
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-2.5 backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-slate-900/95">
        <div className="flex min-w-0 items-center gap-1.5">
          {settings?.films_logo_url ? (
            <img src={settings.films_logo_url} alt="logo" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
              <Sparkles className="h-4 w-4 text-slate-900" />
            </div>
          )}
          <span className="whitespace-nowrap text-xs font-bold text-slate-900 dark:text-white">Bollywood Umang</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SyncBadges compact />
          <div className="[&_button]:h-9 [&_button]:w-9 [&_button]:justify-center [&_button]:px-0"><ThemeToggle /></div>
          <button
            onClick={logout}
            aria-label="Admin logout"
            title="Admin logout"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-500/20 text-rose-500 transition-colors hover:bg-rose-500/10 dark:text-rose-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main
        className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] pt-14 md:ml-60 md:pb-0 md:pt-0"
        onTouchStart={(event) => {
          if ((event.target as HTMLElement).closest('.no-print')) return;
          const touch = event.touches[0];
          touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start || (event.target as HTMLElement).closest('.no-print')) return;
          const touch = event.changedTouches[0];
          if (isRightEdgeBackSwipe(start, { x: touch.clientX, y: touch.clientY }, window.innerWidth)) onBack();
        }}
      >
        <div className={['lab', 'rentals', 'bookings', 'partners', 'dairy', 'promo', 'music', 'teaser', 'invitation', 'photo-selection', 'ledger', 'payments'].includes(current) ? 'w-full px-1 md:px-0' : 'w-full p-3 sm:p-6 lg:p-8'}>{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-slate-200 bg-white/95 px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-slate-900/95">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          const active = current === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 transition-colors ${
                active ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 transition-colors ${
            moreNav.some((n) => n.key === current) ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="no-print fixed inset-0 z-[60] md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/60" />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-slate-200 bg-white p-4 pb-8 animate-[slideUp_0.2s_ease-out] dark:border-white/10 dark:bg-slate-900">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            <div className="grid grid-cols-4 gap-3">
              {moreNav.map((item) => {
                const Icon = item.icon;
                const active = current === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      onNavigate(item.key);
                      setMoreOpen(false);
                    }}
                    className={`flex flex-col items-center gap-2 rounded-xl p-3 transition-colors ${
                      active
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
