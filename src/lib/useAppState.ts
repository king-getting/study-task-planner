// 全局状态 Hook：加载后端状态 + 刷新
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { AppState } from './types';

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setState(await api.getState());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 定时轮询：其他设备（手机/平板）上的操作最多 30 秒后自动同步到本页面
  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { state, refresh, error };
}
