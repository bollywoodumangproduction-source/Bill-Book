import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { BarChart3, Calculator, CalendarDays, ChevronUp, Clapperboard, GripVertical, LayoutDashboard, Minus, PanelLeft, Plus, SlidersHorizontal, Wallet, X } from 'lucide-react';
import { Dashboard } from '@/pages/Dashboard';
import { LabOrders } from '@/pages/StudioWork';
import { Ledger } from '@/pages/Photographers';
import { Payments } from '@/pages/Payments';
import { Bookings } from '@/pages/Bookings';
import { SettingsPage } from '@/pages/Settings';
import type { PageKey } from '@/lib/types';

type WindowId = 'bookings' | 'lab' | 'billing' | 'ledger' | 'pricing' | 'reports' | 'settings';
type WindowComponentProps = { onNavigate?: (page: PageKey) => void };
type WindowState = { id: WindowId; x: number; y: number; width: number; height: number; z: number; minimized: boolean; maximized: boolean; previous?: Pick<WindowState, 'x' | 'y' | 'width' | 'height'> };

const STORAGE_KEY = 'desktop-window-layout:v1';
const WINDOW_META: Record<WindowId, { title: string; icon: typeof Wallet }> = {
  bookings: { title: 'Bookings', icon: CalendarDays },
  lab: { title: 'New Lab Order', icon: Clapperboard },
  billing: { title: 'Master Billing', icon: Wallet },
  ledger: { title: 'Client Ledger', icon: PanelLeft },
  pricing: { title: 'Pricing Calculator', icon: Calculator },
  reports: { title: 'Reports', icon: BarChart3 },
  settings: { title: 'Settings', icon: SlidersHorizontal },
};

function initialWindows(): WindowState[] {
  const availableWidth = Math.max(800, window.innerWidth - 240 - 48);
  const width = Math.min(1280, Math.max(800, Math.floor(availableWidth * 0.9)));
  const height = Math.max(550, Math.floor(window.innerHeight * 0.85));
  const centeredX = Math.max(0, Math.floor((availableWidth - width) / 2));
  const centeredY = Math.max(0, Math.floor((window.innerHeight - height - 48) / 2));
  return [
    { id: 'bookings', x: centeredX, y: centeredY, width, height, z: 2, minimized: false, maximized: false },
    { id: 'lab', x: centeredX + 24, y: centeredY + 24, width, height, z: 1, minimized: true, maximized: false },
    { id: 'billing', x: centeredX + 48, y: centeredY + 48, width, height, z: 1, minimized: true, maximized: false },
    { id: 'ledger', x: centeredX + 72, y: centeredY + 72, width, height, z: 1, minimized: true, maximized: false },
    { id: 'pricing', x: centeredX + 96, y: centeredY + 96, width, height, z: 1, minimized: true, maximized: false },
    { id: 'reports', x: centeredX + 120, y: centeredY + 120, width, height, z: 1, minimized: true, maximized: false },
    { id: 'settings', x: centeredX + 144, y: centeredY + 144, width, height, z: 1, minimized: true, maximized: false },
  ];
}

function loadWindows(): WindowState[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const stored = JSON.parse(saved) as WindowState[];
      const byId = new Map(stored.map((item) => [item.id, item]));
      return initialWindows().map((item) => {
        const savedItem = byId.get(item.id);
        if (!savedItem || savedItem.width < 800 || savedItem.height < 550) return item;
        return savedItem;
      });
    }
  } catch { /* use defaults */ }
  return initialWindows();
}

function PricingCalculator() {
  const [quantity, setQuantity] = useState('1');
  const [rate, setRate] = useState('');
  const total = (Number(quantity) || 0) * (Number(rate) || 0);
  return <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><p className="text-sm text-slate-500 dark:text-slate-400">Quick price calculation</p><div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-500">Quantity<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label><label className="text-xs text-slate-500">Rate (₹)<input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label></div><div className="rounded-lg bg-amber-500/10 p-4"><p className="text-xs text-slate-500">Calculated Total</p><p className="text-2xl font-bold text-amber-500">₹{total.toLocaleString('en-IN')}</p></div></div>;
}

function Reports() {
  return <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-amber-500" /><h2 className="font-semibold text-slate-900 dark:text-white">Reports Overview</h2></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-slate-50 p-4 dark:bg-white/5"><p className="text-xs text-slate-500">Bookings</p><p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Live dashboard data</p></div><div className="rounded-lg bg-slate-50 p-4 dark:bg-white/5"><p className="text-xs text-slate-500">Collections</p><p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Live payment data</p></div></div><p className="text-xs text-slate-400">Open Dashboard or Payments for the complete operational detail.</p></div>;
}

function ResizeHandle({ direction, onPointerDown, onPointerMove, onPointerUp }: { direction: string; onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void; onPointerUp: () => void }) {
  const positions: Record<string, string> = { n: 'left-2 right-2 top-0 h-1 cursor-n-resize', s: 'bottom-0 left-2 right-2 h-1 cursor-s-resize', e: 'bottom-2 right-0 top-2 w-1 cursor-e-resize', w: 'bottom-2 left-0 top-2 w-1 cursor-w-resize', ne: 'right-0 top-0 h-2 w-2 cursor-ne-resize', nw: 'left-0 top-0 h-2 w-2 cursor-nw-resize', se: 'bottom-0 right-0 h-2 w-2 cursor-se-resize', sw: 'bottom-0 left-0 h-2 w-2 cursor-sw-resize' };
  return <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} className={`absolute z-20 ${positions[direction]}`} aria-label={`Resize window ${direction}`} />;
}

function DesktopWindow({ windowState, onFocus, onMinimize, onMaximize, onClose, onMove, onResize, children }: { windowState: WindowState; onFocus: () => void; onMinimize: () => void; onMaximize: () => void; onClose: () => void; onMove: (x: number, y: number) => void; onResize: (width: number, height: number, x?: number, y?: number) => void; children: ReactNode }) {
  const meta = WINDOW_META[windowState.id];
  const Icon = meta.icon;
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; width: number; height: number; x: number; y: number; direction: string } | null>(null);
  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => { if (windowState.maximized) return; onFocus(); dragRef.current = { startX: event.clientX, startY: event.clientY, x: windowState.x, y: windowState.y }; event.currentTarget.setPointerCapture(event.pointerId); };
  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => { if (!dragRef.current) return; const nextX = Math.max(0, Math.min(window.innerWidth - windowState.width - 260, dragRef.current.x + event.clientX - dragRef.current.startX)); const nextY = Math.max(0, Math.min(window.innerHeight - 96, dragRef.current.y + event.clientY - dragRef.current.startY)); onMove(nextX, nextY); };
  const handleDragEnd = () => { dragRef.current = null; };
  const handleResizeStart = (direction: string, event: ReactPointerEvent<HTMLDivElement>) => { onFocus(); resizeRef.current = { startX: event.clientX, startY: event.clientY, width: windowState.width, height: windowState.height, x: windowState.x, y: windowState.y, direction }; event.currentTarget.setPointerCapture(event.pointerId); };
  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => { if (!resizeRef.current) return; const resize = resizeRef.current; const dx = event.clientX - resize.startX; const dy = event.clientY - resize.startY; const width = Math.max(800, resize.width + (resize.direction.includes('w') ? -dx : resize.direction.includes('e') ? dx : 0)); const height = Math.max(550, resize.height + (resize.direction.includes('n') ? -dy : resize.direction.includes('s') ? dy : 0)); onResize(width, height, resize.direction.includes('w') ? resize.x + resize.width - width : undefined, resize.direction.includes('n') ? resize.y + resize.height - height : undefined); };
  const handleResizeEnd = () => { resizeRef.current = null; };
  const style = windowState.maximized ? { inset: 0, zIndex: 50 } : { left: windowState.x, top: windowState.y, width: windowState.width, height: windowState.height, zIndex: windowState.z };
  const hiddenClass = windowState.minimized ? 'pointer-events-none scale-95 opacity-0' : 'opacity-100';
  const stopDrag = (event: ReactPointerEvent<HTMLButtonElement>) => event.stopPropagation();
  return <section onPointerDown={onFocus} className={`absolute flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/30 transition-[opacity,transform] duration-150 will-change-transform will-change-[width,height] ${windowState.maximized ? 'rounded-none' : ''} ${hiddenClass}`} style={{ ...style, height: windowState.maximized ? 'calc(100vh - 48px)' : windowState.height, transform: 'translateZ(0)' }}><header onPointerDown={handleDragStart} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onPointerCancel={handleDragEnd} className="flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 text-sm text-slate-200 active:cursor-grabbing"><Icon className="h-4 w-4 text-amber-400" /><span className="min-w-0 flex-1 truncate font-medium">{meta.title}</span><button onPointerDown={stopDrag} onClick={onMinimize} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white" title="Minimize"><Minus className="h-4 w-4" /></button><button onPointerDown={stopDrag} onClick={onMaximize} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white" title="Maximize / Restore">{windowState.maximized ? <ChevronUp className="h-4 w-4" /> : <GripVertical className="h-4 w-4" />}</button><button onPointerDown={stopDrag} onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300" title="Close"><X className="h-4 w-4" /></button></header><div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>{!windowState.maximized && (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((direction) => <ResizeHandle key={direction} direction={direction} onPointerDown={(event) => handleResizeStart(direction, event)} onPointerMove={handleResizeMove} onPointerUp={handleResizeEnd} />))}</section>;
}

export function DesktopWindowManager({ currentPage, onNavigate }: { currentPage: PageKey; onNavigate: (page: PageKey) => void }) {
  const [windows, setWindows] = useState<WindowState[]>(loadWindows);
  const nextZ = useRef(Math.max(...loadWindows().map((item) => item.z), 1) + 1);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(windows)); }, [windows]);
  const openWindow = useCallback((id: WindowId) => { const z = nextZ.current++; setWindows((items) => { const existing = items.some((item) => item.id === id); return existing ? items.map((item) => item.id === id ? { ...item, minimized: false, z } : item) : [...items, { ...initialWindows().find((item) => item.id === id)!, minimized: false, z }]; }); }, []);
  const focus = useCallback((id: WindowId) => { const z = nextZ.current++; setWindows((items) => items.map((item) => item.id === id ? { ...item, z, minimized: false } : item)); }, []);
  useEffect(() => { const mapping: Partial<Record<PageKey, WindowId>> = { bookings: 'bookings', lab: 'lab', payments: 'billing', ledger: 'ledger', settings: 'settings' }; const id = mapping[currentPage]; if (id) openWindow(id); }, [currentPage, openWindow]);
  const closeWindow = (id: WindowId) => setWindows((items) => items.filter((item) => item.id !== id));
  const minimizeWindow = (id: WindowId) => setWindows((items) => items.map((item) => item.id === id ? { ...item, minimized: true } : item));
  const maximizeWindow = (id: WindowId) => setWindows((items) => items.map((item) => item.id === id ? item.maximized ? { ...item, maximized: false, ...(item.previous ?? {}) } : { ...item, maximized: true, previous: { x: item.x, y: item.y, width: item.width, height: item.height } } : item));
  const updateWindow = (id: WindowId, patch: Partial<WindowState>) => setWindows((items) => items.map((item) => item.id === id ? { ...item, ...patch, x: patch.x === undefined ? item.x : Math.max(0, patch.x), y: patch.y === undefined ? item.y : Math.max(0, patch.y) } : item));
  const content: Record<WindowId, ComponentType<WindowComponentProps>> = useMemo(() => ({ bookings: Bookings, lab: LabOrders, billing: Payments, ledger: Ledger, pricing: PricingCalculator, reports: Reports, settings: SettingsPage }), []);
  const focusedId = windows.filter((item) => !item.minimized).sort((a, b) => b.z - a.z)[0]?.id;
  return <div className="relative min-h-screen w-full overflow-hidden border border-slate-800 bg-[radial-gradient(circle_at_20%_0%,#1e293b_0%,#0f172a_40%,#020617_100%)]" style={{ contain: 'layout paint', transform: 'translateZ(0)' }}><div className="absolute inset-0 overflow-auto p-6"><Dashboard onNavigate={onNavigate} /></div><div className="relative z-10 flex h-12 items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-3"><LayoutDashboard className="h-4 w-4 text-amber-400" /><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Desktop Workspace</span><div className="ml-auto relative"><button onClick={() => setDesktopMenuOpen((open) => !open)} className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950"><Plus className="h-3.5 w-3.5" /> Open Module</button>{desktopMenuOpen && <div className="absolute right-0 top-9 z-[200] w-52 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">{(Object.keys(WINDOW_META) as WindowId[]).map((id) => <button key={id} onClick={() => { openWindow(id); setDesktopMenuOpen(false); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-slate-300 hover:bg-white/10"><span>{WINDOW_META[id].title}</span></button>)}</div>}</div></div><div className="absolute inset-x-0 bottom-12 top-12 z-20 overflow-hidden">{windows.map((item) => { const WindowContent = content[item.id]; return <DesktopWindow key={item.id} windowState={item} onFocus={() => focus(item.id)} onMinimize={() => minimizeWindow(item.id)} onMaximize={() => maximizeWindow(item.id)} onClose={() => closeWindow(item.id)} onMove={(x, y) => updateWindow(item.id, { x, y })} onResize={(width, height, x, y) => updateWindow(item.id, { width, height, ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }) })}><WindowContent onNavigate={onNavigate} /></DesktopWindow>; })}</div><footer className="absolute bottom-0 left-0 right-0 z-30 flex h-12 items-center gap-2 border-t border-slate-800 bg-slate-950/95 px-3 backdrop-blur-xl">{windows.map((item) => { const Icon = WINDOW_META[item.id].icon; return <button key={item.id} onClick={() => item.minimized ? openWindow(item.id) : item.id === focusedId ? minimizeWindow(item.id) : focus(item.id)} className={`flex max-w-48 items-center gap-2 rounded-lg border px-3 py-2 text-xs ${item.minimized ? 'border-slate-700 text-slate-400' : item.id === focusedId ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-slate-700 text-slate-300'}`}><Icon className="h-3.5 w-3.5" /><span className="truncate">{WINDOW_META[item.id].title}</span><span className={`h-1.5 w-1.5 rounded-full ${item.minimized ? 'bg-slate-600' : 'bg-emerald-400'}`} /></button>; })}<span className="ml-auto text-[11px] text-slate-500">GPU-optimized workspace · {windows.length} windows</span></footer></div>;
}

export function MobilePage({ page, onNavigate }: { page: PageKey; onNavigate: (page: PageKey) => void }) {
  return <>{page === 'dashboard' && <Dashboard onNavigate={onNavigate} />}{page === 'bookings' && <Bookings />}{page === 'lab' && <LabOrders />}{page === 'ledger' && <Ledger />}{page === 'payments' && <Payments />}</>;
}
