import React, { useState, useEffect, useCallback } from 'react';

// Albanian responses for the script - Science Festival Presentation
const SCRIPT_RESPONSES = {
  // Key 1: Response to "Aera, sa është ora?" (Kida's question)
  1: () => {
    return "Ora është nëntë e gjysmë.";
  },
  
  // Key 2: Response to "Si është moti sot?" (Kida's second question)
  2: () => {
    return "Moti sot është i kthjellët dhe me diell, me temperaturë rreth njëzet gradë celsius. Një ditë e përkryer për të dalë jashtë.";
  },
  
  // Key 3: Self-introduction of AERA
  3: () => {
    return `Përshëndetje! Unë jam AERA, asistentja juaj personale inteligjente. Jam këtu për t'ju ndihmuar në jetën e përditshme duke ju dhënë informacione të dobishme si ora, moti, dhe kalendari juaj. Me mua, mund të organizoni ditën tuaj më mirë, të kurseni kohë, dhe të jeni gjithmonë të informuar. Jam gjithmonë e gatshme t'ju ndihmoj me çdo pyetje që keni. Mjafton të më pyesni!`;
  }
};

// Script lines for display - Festival presentation cues
const SCRIPT_LABELS = {
  1: 'Kida: "Aera, sa është ora?" → AERA përgjigjet',
  2: 'Kida: "Si është moti sot?" → AERA përgjigjet',
  3: 'AERA vetë-prezantohet'
};

export default function ScriptMode() {
  const [currentKey, setCurrentKey] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [error, setError] = useState(null);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // Try to find Albanian voice, fallback to any available
      const albanianVoice = availableVoices.find(v => 
        v.lang.startsWith('sq') || v.lang.includes('Albanian')
      );
      
      if (albanianVoice) {
        setSelectedVoice(albanianVoice);
      } else if (availableVoices.length > 0) {
        // Fallback to first available voice
        setSelectedVoice(availableVoices[0]);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Speak function
  const speak = useCallback((text) => {
    if (!window.speechSynthesis) {
      setError('Speech synthesis not supported in this browser');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    // Albanian language code
    utterance.lang = 'sq-AL';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setSpokenText(text);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (e) => {
      setIsSpeaking(false);
      setError(`Speech error: ${e.error}`);
    };

    window.speechSynthesis.speak(utterance);
  }, [selectedVoice]);

  // Handle key press
  const handleKeyPress = useCallback((key) => {
    if (SCRIPT_RESPONSES[key]) {
      setCurrentKey(key);
      setError(null);
      const response = SCRIPT_RESPONSES[key]();
      speak(response);
    }
  }, [speak]);

  // Keyboard listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = parseInt(e.key, 10);
      if (key >= 1 && key <= 3) {
        handleKeyPress(key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyPress]);

  // Stop speaking
  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>AERA</h1>
        <p style={styles.subtitle}>Modaliteti i Skriptës / Script Mode</p>
      </div>

      <div style={styles.instructions}>
        <h2 style={styles.sectionTitle}>Shtypni një tast / Press a key:</h2>
        
        <div style={styles.keyGrid}>
          {[1, 2, 3].map((key) => (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              style={{
                ...styles.keyButton,
                ...(currentKey === key && isSpeaking ? styles.activeButton : {})
              }}
            >
              <span style={styles.keyNumber}>{key}</span>
              <span style={styles.keyLabel}>{SCRIPT_LABELS[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {isSpeaking && (
        <div style={styles.speakingSection}>
          <div style={styles.speakingIndicator}>
            <div style={styles.pulseRing}></div>
            <div style={styles.pulseCore}></div>
          </div>
          <p style={styles.speakingLabel}>Duke folur... / Speaking...</p>
          <p style={styles.spokenText}>{spokenText}</p>
          <button onClick={stopSpeaking} style={styles.stopButton}>
            Ndalo / Stop
          </button>
        </div>
      )}

      {error && (
        <div style={styles.errorSection}>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      <div style={styles.voiceSection}>
        <label style={styles.voiceLabel}>Zëri / Voice: </label>
        <select 
          value={selectedVoice?.name || ''} 
          onChange={(e) => {
            const voice = voices.find(v => v.name === e.target.value);
            setSelectedVoice(voice);
          }}
          style={styles.voiceSelect}
        >
          {voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </div>

      <div style={styles.footer}>
        <a href="/" style={styles.backLink}>
          Kthehu te Aera / Back to Aera
        </a>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
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
    alignItems: 'center',
    padding: '40px 20px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  title: {
    fontSize: '48px',
    fontWeight: '700',
    letterSpacing: '8px',
    margin: '0 0 10px 0',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '18px',
    color: '#888',
    margin: 0,
  },
  instructions: {
    textAlign: 'center',
    marginBottom: '40px',
    width: '100%',
    maxWidth: '600px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '500',
    marginBottom: '24px',
    color: '#ccc',
  },
  keyGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  keyButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '20px 24px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left',
  },
  activeButton: {
    backgroundColor: '#2a1a4a',
    borderColor: '#667eea',
    boxShadow: '0 0 20px rgba(102, 126, 234, 0.3)',
  },
  keyNumber: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#667eea',
    minWidth: '50px',
    textAlign: 'center',
  },
  keyLabel: {
    fontSize: '16px',
    color: '#fff',
  },
  speakingSection: {
    textAlign: 'center',
    padding: '30px',
    backgroundColor: '#1a1a1a',
    borderRadius: '16px',
    marginBottom: '30px',
    maxWidth: '600px',
    width: '100%',
  },
  speakingIndicator: {
    position: 'relative',
    width: '60px',
    height: '60px',
    margin: '0 auto 20px',
  },
  pulseRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    backgroundColor: '#667eea',
    animation: 'pulse 1.5s ease-out infinite',
  },
  pulseCore: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    backgroundColor: '#667eea',
  },
  speakingLabel: {
    fontSize: '18px',
    color: '#667eea',
    marginBottom: '15px',
  },
  spokenText: {
    fontSize: '16px',
    color: '#ccc',
    lineHeight: '1.6',
    marginBottom: '20px',
    padding: '0 20px',
  },
  stopButton: {
    padding: '10px 24px',
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  errorSection: {
    padding: '15px 20px',
    backgroundColor: '#2a1a1a',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  errorText: {
    color: '#ff6b6b',
    margin: 0,
  },
  voiceSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '20px',
  },
  voiceLabel: {
    color: '#888',
    fontSize: '14px',
  },
  voiceSelect: {
    padding: '8px 12px',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: '1px solid #333',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: '40px',
  },
  backLink: {
    color: '#667eea',
    textDecoration: 'none',
    fontSize: '14px',
  },
};
