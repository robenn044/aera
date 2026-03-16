import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCommandDefaults,
  normalizeChannel,
  sendRemoteCommand,
} from './remoteControl';
import './ControlPanel.css';

const KEY_COMMANDS = [
  { code: 'Digit1', label: '1', type: 'script-1', payload: {} },
  { code: 'Digit2', label: '2', type: 'script-2', payload: {} },
  { code: 'Digit3', label: '3', type: 'script-intro', payload: {} },
];

const KEY_MAP = KEY_COMMANDS.reduce((acc, entry) => {
  acc[entry.code] = entry;
  return acc;
}, {});

const getInitialChannel = () => {
  const defaults = getCommandDefaults();
  if (typeof window === 'undefined') {
    return defaults.channel;
  }
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('channel');
  const fromStorage = window.localStorage?.getItem('aera-control-channel');
  return normalizeChannel(fromQuery || fromStorage || defaults.channel);
};

const ControlPanel = () => {
  const defaults = useMemo(() => getCommandDefaults(), []);
  const [channel, setChannel] = useState(() => getInitialChannel());
  const [status, setStatus] = useState('Ready');
  const [lastSent, setLastSent] = useState(null);

  const send = useCallback(async (type, payload = {}, label) => {
    setStatus(`Sending ${label || type}...`);
    try {
      const res = await sendRemoteCommand({
        type,
        payload,
        channel,
        endpoint: defaults.endpoint,
      });
      setLastSent({
        type,
        payload,
        id: res?.id || null,
        at: new Date(),
      });
      setStatus(`Sent ${label || type}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Failed: ${message}`);
    }
  }, [channel, defaults.endpoint]);


  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set('channel', channel);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', nextUrl);
    window.localStorage?.setItem('aera-control-channel', channel);
  }, [channel]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return;
      const target = event.target;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      const mapping = KEY_MAP[event.code];
      if (!mapping) {
        return;
      }
      event.preventDefault();
      void send(mapping.type, mapping.payload, mapping.label);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [send]);

  const lastSentDisplay = lastSent
    ? `${lastSent.type}${lastSent.id ? ` · ${lastSent.id.slice(0, 8)}` : ''} · ${lastSent.at.toLocaleTimeString()}`
    : 'None yet';

  return (
    <div className="control-root">
      <div className="control-shell">
        <header className="control-header">
          <div>
            <p className="control-eyebrow">AERA Remote</p>
            <h1 className="control-title">Control Surface</h1>
          </div>
          <div className="control-endpoint">
            <span className="control-label">Endpoint</span>
            <span className="control-mono">{defaults.endpoint}</span>
          </div>
        </header>

        <section className="control-card control-row">
          <div>
            <label className="control-label" htmlFor="channel-input">Channel</label>
            <input
              id="channel-input"
              className="control-input"
              value={channel}
              onChange={(event) => setChannel(normalizeChannel(event.target.value))}
              placeholder="default"
            />
            <p className="control-help">Keep the same channel on the mirror and controller.</p>
          </div>
          <div className="control-status">
            <span className="control-label">Status</span>
            <span className="control-status-pill">{status}</span>
            <span className="control-subtle">Last: {lastSentDisplay}</span>
          </div>
        </section>

        <section className="control-card">
          <h2 className="control-section-title">Script Mode (Albanian)</h2>
          <div className="control-buttons">
            <button type="button" onClick={() => send('script-1', {}, 'Script Line 1')}>Line 1 (Time)</button>
            <button type="button" onClick={() => send('script-2', {}, 'Script Line 2')}>Line 2 (Weather)</button>
            <button type="button" onClick={() => send('script-intro', {}, 'Self Intro')}>Self Intro</button>
          </div>
          <p className="control-subtle">
            Keys 1, 2, 3 trigger the same Albanian script lines while this page is focused.
          </p>
        </section>

        <section className="control-card">
          <h2 className="control-section-title">Key Map</h2>
          <div className="control-key-grid">
            {KEY_COMMANDS.map((entry) => (
              <div key={entry.code} className="control-key">
                <span className="control-mono">{entry.label}</span>
                <span className="control-subtle">{entry.type}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="control-footer">
          <p className="control-subtle">
            Tip: Keep this tab focused to capture key presses. Tap the mirror once if audio output is blocked.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default ControlPanel;
