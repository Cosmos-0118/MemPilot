import { useCallback, useEffect, useState } from 'react';
import type { PopupStats } from '../../shared/types/stats';
import { isExtension, sendPopupMessage } from '../lib/messaging';
import { MOCK_STATS } from '../lib/mockStats';

export const usePopupStats = () => {
  const [stats, setStats] = useState<PopupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (isExtension()) {
      const result = await sendPopupMessage({ type: 'GET_STATS' });
      if (result) {
        setStats(result);
        setError(null);
      } else {
        setError('Could not reach MemPilot background. Try reopening the popup.');
      }
    } else {
      setStats(MOCK_STATS);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void fetchStats();
    }, 0);
    return () => window.clearTimeout(initial);
  }, [fetchStats]);

  useEffect(() => {
    if (!isExtension()) return;

    const interval = window.setInterval(() => {
      void fetchStats();
    }, 4000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchStats();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchStats]);

  const refresh = useCallback(async () => {
    await fetchStats();
  }, [fetchStats]);

  const applyStats = useCallback((next: PopupStats | null) => {
    if (next) setStats(next);
  }, []);

  return {
    stats,
    setStats,
    loading,
    setLoading,
    error,
    fetchStats,
    refresh,
    applyStats,
  };
};
