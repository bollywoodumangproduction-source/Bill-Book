import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';

interface RefreshState {
  refreshToken: number;
  triggerRefresh: () => void;
}

const RefreshContext = createContext<RefreshState | null>(null);

const CHANNEL_NAME = 'bumang_data_refresh';

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }

    if (channel) {
      channel.onmessage = (e: MessageEvent) => {
        if (e.data?.type === 'refresh') {
          setRefreshToken(e.data.token as number);
        }
      };
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'bumang_refresh_signal' && e.newValue) {
        setRefreshToken(Number(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const triggerRefresh = useCallback(() => {
    const token = Date.now();
    setRefreshToken(token);
    try {
      localStorage.setItem('bumang_refresh_signal', String(token));
    } catch {
      /* ignore */
    }
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: 'refresh', token });
      channel.close();
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<RefreshState>(() => ({ refreshToken, triggerRefresh }), [refreshToken, triggerRefresh]);

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh() {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error('useRefresh must be used within RefreshProvider');
  return ctx;
}
