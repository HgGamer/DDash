import { useCallback, useEffect, useState } from 'react';
import type { AutoUpdateInfo, AutoUpdateSettings } from '@shared/types';

export interface UseAutoUpdate {
  info: AutoUpdateInfo | null;
  settings: AutoUpdateSettings | null;
  check: () => Promise<void>;
  installNow: () => Promise<void>;
  setSettings: (patch: Partial<Omit<AutoUpdateSettings, 'version'>>) => Promise<void>;
}

export function useAutoUpdate(): UseAutoUpdate {
  const [info, setInfo] = useState<AutoUpdateInfo | null>(null);
  const [settings, setSettingsState] = useState<AutoUpdateSettings | null>(null);

  useEffect(() => {
    void (async () => {
      const [i, s] = await Promise.all([
        window.api.autoUpdate.getInfo(),
        window.api.autoUpdate.getSettings(),
      ]);
      setInfo(i);
      setSettingsState(s);
    })();
    const offInfo = window.api.autoUpdate.onInfoChanged(setInfo);
    const offSettings = window.api.autoUpdate.onSettingsChanged(setSettingsState);
    return () => {
      offInfo();
      offSettings();
    };
  }, []);

  const check = useCallback(async () => {
    const next = await window.api.autoUpdate.check();
    setInfo(next);
  }, []);

  const installNow = useCallback(async () => {
    await window.api.autoUpdate.installNow();
  }, []);

  const setSettings = useCallback(
    async (patch: Partial<Omit<AutoUpdateSettings, 'version'>>) => {
      const next = await window.api.autoUpdate.setSettings(patch);
      setSettingsState(next);
    },
    [],
  );

  return { info, settings, check, installNow, setSettings };
}
