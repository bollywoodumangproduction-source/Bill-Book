import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSupabaseConfigurationError, supabase, supabaseConfigured } from '@/lib/supabase';
import type { StudioSettings } from '@/lib/types';

interface SettingsContextValue {
  settings: StudioSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (patch: Partial<StudioSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  loading: false,
  refresh: async () => {},
  update: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const settingsRef = useRef<StudioSettings | null>(null);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) {
      setSettings(null);
      setLoading(false);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const isAdmin = sessionData.session?.user.app_metadata?.role === 'admin';
    const settingsTable = isAdmin ? 'studio_settings' : 'public_studio_settings';
    const { data } = await supabase
      .from(settingsTable)
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (data) {
      setSettings(data);
    } else {
      setSettings(null);
    }
    setLoading(false);
  }, []);

  const update = useCallback(async (patch: Partial<StudioSettings>) => {
    const configError = getSupabaseConfigurationError();
    if (configError) throw new Error(configError);
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user.app_metadata?.role !== 'admin') throw new Error('Administrator sign-in is required to change studio settings.');
    const { data, error } = await supabase.from('studio_settings').update(patch).eq('id', 1).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Studio settings were not found in Supabase.');
    setSettings(data as StudioSettings);
    settingsRef.current = data as StudioSettings;
  }, []);

  useEffect(() => {
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Supabase warns against starting another Supabase request directly inside
      // this callback; defer the settings refresh until the auth event settles.
      queueMicrotask(() => { void refresh(); });
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo(() => ({ settings, loading, refresh, update }), [settings, loading, refresh, update]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
