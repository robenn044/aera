import React, { useState, useEffect, useRef, useCallback } from 'react';

// Albanian script responses for the presentation
const SCRIPT_RESPONSES = {
  '1': "Ora është nëntë e gjysmë.",
  '2': "Moti sot është i kthjellët dhe me diell, me temperaturë rreth njëzet gradë celsius. Një ditë e përkryer për të dalë jashtë.",
  '3': "Përshëndetje! Unë jam AERA, asistentja juaj personale inteligjente. Jam këtu për t'ju ndihmuar në jetën e përditshme duke ju dhënë informacione të dobishme si ora, moti, dhe kalendari juaj. Me mua, mund të organizoni ditën tuaj më mirë, të kurseni kohë, dhe të jeni gjithmonë të informuar. Jam gjithmonë e gatshme t'ju ndihmoj me çdo pyetje që keni. Mjafton të më pyesni!"
};

const SCRIPT_LABELS = {
  '1': 'Përgjigje për orën',
  '2': 'Përgjigje për motin',
  '3': 'Vetë-prezantimi'
};

export default function PresentationDisplay() {
  const [status, setStatus] = useState('connecting');
  const [currentAction, setCurrentAction] = useState(null);
  const [displayText, setDisplayText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);
  const [lastTimestamp, setLastTimestamp] = useState(0);
  const audioRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Generate speech using ElevenLabs API
  const speak = useCallback(async (text) => {
    setIsPlaying(true);
    setError(null);
    
    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'TTS failed');
      }

      const data = await response.json();
      
      // Create audio from base64
      const audioSrc = `data:audio/mpeg;base64,${data.audio}`;
      
      if (audioRef.current) {
        audioRef.current.src = audioSrc;
        audioRef.current.play();
      }
    } catch (err) {
      console.error('Speech error:', err);
      setError(`Speech failed: ${err.message}`);
      setIsPlaying(false);
    }
  }, []);

  // Handle incoming commands
  const handleCommand = useCallback((action) => {
    const text = SCRIPT_RESPONSES[action];
    if (text) {
      setCurrentAction(action);
      setDisplayText(text);
      speak(text);
    }
  }, [speak]);

  // Poll for commands from the controller
  useEffect(() => {
    const pollCommands = async () => {
      try {
        const response = await fetch(`/api/command?lastTimestamp=${lastTimestamp}`);
        const data = await response.json();
        
        if (data.hasCommand && data.command) {
          setLastTimestamp(data.command.timestamp);
          
          if (data.command.action === 'stop') {
            // Stop current audio
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
            }
            setIsPlaying(false);
            setCurrentAction(null);
            setDisplayText('');
          } else {
            handleCommand(data.command.action);
          }
        }
        
        setStatus('connected');
      } catch (err) {
        console.error('Poll error:', err);
        setStatus('error');
      }
    };

    // Poll every 500ms for responsive control
    pollIntervalRef.current = setInterval(pollCommands, 500);
    pollCommands(); // Initial poll

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [lastTimestamp, handleCommand]);

  // Handle audio end
  const handleAudioEnd = () => {
    setIsPlaying(false);
  };

  return (
    <div style={styles.container}>
      {/* Hidden audio element */}
      <audio 
        ref={audioRef} 
        onEnded={handleAudioEnd}
        onError={() => {
          setError('Audio playback failed');
          setIsPlaying(false);
        }}
      />

      {/* Status indicator */}
      <div style={styles.statusBar}>
        <div style={{
          ...styles.statusDot,
          backgroundColor: status === 'connected' ? '#10b981' : 
                          status === 'error' ? '#ef4444' : '#f59e0b'
        }} />
        <span style={styles.statusText}>
          {status === 'connected' ? 'Ready' : 
           status === 'error' ? 'Connection Error' : 'Connecting...'}
        </span>
      </div>

      {/* Main display area */}
      <div style={styles.mainContent}>
        {/* AERA Logo/Title */}
        <h1 style={styles.title}>AERA</h1>
        <p style={styles.subtitle}>Asistentja Inteligjente</p>

        {/* Visual feedback orb */}
        <div style={{
          ...styles.orb,
          ...(isPlaying ? styles.orbActive : {})
        }}>
          <div style={{
            ...styles.orbInner,
            ...(isPlaying ? styles.orbInnerActive : {})
          }} />
        </div>

        {/* Current action indicator */}
        {currentAction && (
          <div style={styles.actionBadge}>
            {SCRIPT_LABELS[currentAction]}
          </div>
        )}

        {/* Display text being spoken */}
        {displayText && (
          <div style={styles.textDisplay}>
            <p style={styles.spokenText}>{displayText}</p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div style={styles.errorBox}>
            {error}
          </div>
        )}

        {/* Waiting message when idle */}
        {!isPlaying && !displayText && (
          <p style={styles.waitingText}>
            Duke pritur komandën...
          </p>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <p>Festivali i Shkencave 2025</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 24px',
    borderBottom: '1px solid #222',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '14px',
    color: '#888',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    textAlign: 'center',
  },
  title: {
    fontSize: '72px',
    fontWeight: '700',
    margin: '0 0 8px 0',
    letterSpacing: '8px',
    background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '18px',
    color: '#666',
    margin: '0 0 48px 0',
    letterSpacing: '2px',
  },
  orb: {
    width: '200px',
    height: '200px',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, #1e3a5f 0%, #0a1628 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '40px',
    transition: 'all 0.3s ease',
    boxShadow: '0 0 60px rgba(96, 165, 250, 0.1)',
  },
  orbActive: {
    boxShadow: '0 0 100px rgba(96, 165, 250, 0.4), 0 0 200px rgba(167, 139, 250, 0.2)',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  orbInner: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, #3b82f6 0%, #1e40af 100%)',
    transition: 'all 0.3s ease',
  },
  orbInnerActive: {
    background: 'radial-gradient(circle at 30% 30%, #60a5fa 0%, #3b82f6 100%)',
    animation: 'glow 1s ease-in-out infinite alternate',
  },
  actionBadge: {
    backgroundColor: '#1e3a5f',
    color: '#60a5fa',
    padding: '8px 20px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '24px',
  },
  textDisplay: {
    maxWidth: '800px',
    padding: '32px',
    backgroundColor: 'rgba(30, 58, 95, 0.3)',
    borderRadius: '16px',
    border: '1px solid rgba(96, 165, 250, 0.2)',
  },
  spokenText: {
    fontSize: '24px',
    lineHeight: '1.6',
    color: '#e2e8f0',
    margin: 0,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#f87171',
    padding: '16px 24px',
    borderRadius: '8px',
    marginTop: '24px',
  },
  waitingText: {
    color: '#666',
    fontSize: '18px',
    fontStyle: 'italic',
  },
  footer: {
    padding: '24px',
    textAlign: 'center',
    borderTop: '1px solid #222',
    color: '#444',
    fontSize: '14px',
  },
};

// Add CSS animation via style tag
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  @keyframes glow {
    0% { opacity: 0.8; }
    100% { opacity: 1; }
  }
`;
document.head.appendChild(styleSheet);
