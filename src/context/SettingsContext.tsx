import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { StudioSettings } from '@/lib/types';

interface SettingsContextValue {
  settings: StudioSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (patch: Partial<StudioSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const fallbackSettings: StudioSettings = {
  id: 1,
  films_title: 'Bollywood Umang Films',
  films_subtitle: '(A Unit of Bollywood Umang Production) • Premium Photography & Cinematography Services',
  production_title: 'Bollywood Umang Production',
  production_subtitle: 'Video Mixing Lab & Post-Production Hub',
  address: 'Kamtaul, Darbhanga, Bihar',
  phone: '+91 9122441332',
  email: 'bollywoodumanginfo@gmail.com',
  films_insta: '@bollywoodumang_films',
  production_insta: '@bollywoodumang.production',
  bank_name: 'Bollywood Umang Production',
  bank_details: 'Cash / UPI / Bank Transfer',
  whatsapp_number: '+91 9122441332',
  alternate_phone: '',
  branch_address: '',
  upi_id: '',
  stamp_image_url: '',
  films_logo_url: '',
  production_logo_url: '',
  terms_conditions: '',
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const settingsRef = useRef<StudioSettings | null>(null);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('studio_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (data) {
      localStorage.setItem('studio_settings_cache', JSON.stringify(data));
      setSettings(data);
    } else {
      const cached = localStorage.getItem('studio_settings_cache');
      setSettings(cached ? JSON.parse(cached) : fallbackSettings);
    }
    setLoading(false);
  }, []);

  const update = useCallback(async (patch: Partial<StudioSettings>) => {
    const merged = { ...(settingsRef.current ?? fallbackSettings), ...patch };
    localStorage.setItem('studio_settings_cache', JSON.stringify(merged));
    setSettings(merged);
    settingsRef.current = merged;
    await supabase.from('studio_settings').update(patch).eq('id', 1);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ settings, loading, refresh, update }), [settings, loading, refresh, update]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
