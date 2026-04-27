import { useState } from 'react';
import { useAutoUpdate } from '../hooks/useAutoUpdate';
import { useStore } from '../store';

/** Inline banner that appears when an update is downloading or ready to
 *  install. Hidden when nothing is happening; the full surface lives in
 *  Settings → Updates. */
export function UpdateBanner() {
  const { info, installNow } = useAutoUpdate();
  const openSettings = useStore((s) => s.openSettings);
  const [confirming, setConfirming] = useState(false);

  if (!info) return null;
  const state = info.state;
  if (state.kind !== 'downloading' && state.kind !== 'downloaded') return null;

  const hasActiveSessions = (() => {
    const tabs = useStore.getState().tabs;
    return Object.values(tabs).some((t) => t.status === 'running');
  })();

  const onInstall = async () => {
    if (hasActiveSessions && !confirming) {
      setConfirming(true);
      return;
    }
    await installNow();
  };

  return (
    <div className="update-banner" role="status">
      {state.kind === 'downloading' ? (
        <span>
          Downloading update {state.version} ({state.percent}%)…
        </span>
      ) : (
        <>
          <span>
            Update {state.version} is ready.{' '}
            {confirming
              ? 'Restart now? This will close all running terminal sessions.'
              : 'It will install when you quit, or restart now.'}
          </span>
          <div className="update-banner-actions">
            <button onClick={() => void onInstall()}>
              {confirming ? 'Restart and update' : 'Restart and update'}
            </button>
            {confirming ? (
              <button onClick={() => setConfirming(false)}>Cancel</button>
            ) : (
              <button onClick={() => openSettings('updates')}>Details</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
