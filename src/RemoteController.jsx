import React, { useState, useEffect, useCallback } from 'react';

// Script information for display
const SCRIPT_INFO = {
  '1': {
    cue: 'Kida: "Aera, sa është ora?"',
    response: 'Ora është nëntë e gjysmë.',
    color: '#3b82f6'
  },
  '2': {
    cue: 'Kida: "Si është moti sot?"',
    response: 'Moti sot është i kthjellët dhe me diell, me temperaturë rreth njëzet gradë celsius. Një ditë e përkryer për të dalë jashtë.',
    color: '#10b981'
  },
  '3': {
    cue: 'AERA vetë-prezantohet',
    response: 'Përshëndetje! Unë jam AERA, asistentja juaj personale inteligjente...',
    color: '#a855f7'
  }
};

export default function RemoteController() {
  const [lastSent, setLastSent] = useState(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('ready');

  // Send command to display
  const sendCommand = useCallback(async (action) => {
    if (sending) return;
    
    setSending(true);
    setStatus('sending');
    
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        throw new Error('Failed to send command');
      }

      setLastSent(action);
      setStatus('sent');
      
      // Reset status after a moment
      setTimeout(() => setStatus('ready'), 2000);
    } catch (err) {
      console.error('Send error:', err);
      setStatus('error');
    } finally {
      setSending(false);
    }
  }, [sending]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        sendCommand(e.key);
      } else if (e.key === 's' || e.key === 'S' || e.key === 'Escape') {
        e.preventDefault();
        sendCommand('stop');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sendCommand]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>AERA Remote Control</h1>
        <p style={styles.subtitle}>Kontrolluesi i Prezantimit</p>
        
        {/* Status indicator */}
        <div style={{
          ...styles.statusBadge,
          backgroundColor: status === 'ready' ? '#10b981' : 
                          status === 'sending' ? '#f59e0b' :
                          status === 'sent' ? '#3b82f6' : '#ef4444'
        }}>
          {status === 'ready' ? 'Ready' : 
           status === 'sending' ? 'Sending...' :
           status === 'sent' ? 'Command Sent!' : 'Error'}
        </div>
      </div>

      {/* Instructions */}
      <div style={styles.instructions}>
        <p>Press <kbd style={styles.kbd}>1</kbd> <kbd style={styles.kbd}>2</kbd> <kbd style={styles.kbd}>3</kbd> on keyboard or tap buttons below</p>
        <p>Press <kbd style={styles.kbd}>S</kbd> or <kbd style={styles.kbd}>Esc</kbd> to stop audio</p>
      </div>

      {/* Command buttons */}
      <div style={styles.buttonGrid}>
        {['1', '2', '3'].map((key) => (
          <button
            key={key}
            onClick={() => sendCommand(key)}
            disabled={sending}
            style={{
              ...styles.commandButton,
              borderColor: SCRIPT_INFO[key].color,
              ...(lastSent === key ? { 
                backgroundColor: SCRIPT_INFO[key].color,
                color: '#fff' 
              } : {})
            }}
          >
            <span style={styles.keyNumber}>{key}</span>
            <span style={styles.cueLine}>{SCRIPT_INFO[key].cue}</span>
            <span style={styles.responseLine}>{SCRIPT_INFO[key].response}</span>
          </button>
        ))}
      </div>

      {/* Stop button */}
      <button
        onClick={() => sendCommand('stop')}
        disabled={sending}
        style={styles.stopButton}
      >
        Stop Audio
      </button>

      {/* Script reference */}
      <div style={styles.scriptSection}>
        <h2 style={styles.scriptTitle}>Full Script Reference</h2>
        <div style={styles.scriptContent}>
          <p><strong>Scene:</strong> Kida vjen para pasqyrës duke u përgatitur për të dalë.</p>
          <br />
          <p><span style={{color: '#f59e0b'}}>Kida:</span> Aera, sa është ora?</p>
          <p><span style={{color: '#60a5fa'}}>AERA:</span> <em>[Press 1]</em></p>
          <br />
          <p><span style={{color: '#f59e0b'}}>Kida:</span> Si është moti sot?</p>
          <p><span style={{color: '#60a5fa'}}>AERA:</span> <em>[Press 2]</em></p>
          <br />
          <p><span style={{color: '#888'}}>(Amanda afrohet.)</span></p>
          <p><span style={{color: '#f59e0b'}}>Amanda:</span> Aera, çfarë kam sot në kalendar?</p>
          <p><span style={{color: '#888'}}>(do vem reminder prezantim per festivalin e shkencave ne oren 9)</span></p>
          <br />
          <p><span style={{color: '#f59e0b'}}>Tea:</span> Kjo që sapo patë është një shembull i thjeshtë...</p>
          <p><span style={{color: '#f59e0b'}}>Roben:</span> Ne kemi krijuar një pasqyrë inteligjente...</p>
          <p><span style={{color: '#f59e0b'}}>Alkida:</span> Pasqyra mund të shfaqë informacione...</p>
          <p><span style={{color: '#f59e0b'}}>Ervioli:</span> Në pjesën teknike kemi përdorur...</p>
          <p><span style={{color: '#f59e0b'}}>Amanda:</span> Qëllimi i projektit tonë është...</p>
          <br />
          <p><span style={{color: '#60a5fa'}}>AERA:</span> VET PREZANTOHET <em>[Press 3]</em></p>
          <br />
          <p><span style={{color: '#f59e0b'}}>Antea:</span> Kjo është pasqyra jonë inteligjente. Faleminderit për vëmendjen</p>
          <p><span style={{color: '#f59e0b'}}>Të gjithë bashkë:</span> AERA!</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#111',
    color: '#fff',
    padding: '24px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    margin: '0 0 8px 0',
    background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    color: '#666',
    margin: '0 0 16px 0',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#fff',
  },
  instructions: {
    textAlign: 'center',
    marginBottom: '32px',
    color: '#888',
  },
  kbd: {
    backgroundColor: '#333',
    padding: '4px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '14px',
    border: '1px solid #555',
    margin: '0 4px',
  },
  buttonGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '600px',
    margin: '0 auto 24px auto',
  },
  commandButton: {
    backgroundColor: 'transparent',
    border: '2px solid',
    borderRadius: '12px',
    padding: '20px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s ease',
    color: '#fff',
  },
  keyNumber: {
    display: 'block',
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '8px',
  },
  cueLine: {
    display: 'block',
    fontSize: '16px',
    fontWeight: '500',
    marginBottom: '4px',
    color: '#ddd',
  },
  responseLine: {
    display: 'block',
    fontSize: '14px',
    color: '#888',
    fontStyle: 'italic',
  },
  stopButton: {
    display: 'block',
    width: '200px',
    margin: '0 auto 48px auto',
    padding: '12px 24px',
    backgroundColor: '#991b1b',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  scriptSection: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '24px',
    backgroundColor: '#1a1a1a',
    borderRadius: '12px',
  },
  scriptTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#ddd',
  },
  scriptContent: {
    fontSize: '14px',
    lineHeight: '1.8',
    color: '#aaa',
  },
};
