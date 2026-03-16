import { useEffect, useMemo, useRef, useState } from 'react';
import { chatCompletions } from './llmClient';
import { transcribeAudio } from './sttClient';

// Tuned VAD settings for better voice detection
const SILENCE_HOLD_MS = 1200; // Longer pause before ending recording
const POST_TTS_COOLDOWN_MS = 1500; // Longer cooldown after speaking
const VAD_INTERVAL_MS = 60; // Faster VAD polling
const MIN_SPEECH_DURATION_MS = 400; // Minimum recording duration
const MIN_RECORDING_MS = 600; // Don't process recordings shorter than this

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SYSTEM_PROMPT = `You are AERA, a hands-free voice assistant for a smart mirror. 
Reply in concise, natural spoken English. Keep responses short (1-2 sentences) unless asked for detail.
Be helpful, friendly, and conversational. If you don't understand something, ask for clarification.`;

const toCleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();

const stripPunctuation = (text) => text.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// Improved noise detection with Whisper's no_speech_prob
const isLikelyNoise = (text, { wakeWordEnabled, noSpeechProb } = {}) => {
  // If Whisper is confident there's no speech, filter it out
  if (typeof noSpeechProb === 'number' && noSpeechProb > 0.6) {
    return true;
  }

  const cleaned = stripPunctuation(text);
  if (!cleaned) return true;

  const words = cleaned.split(' ').filter(Boolean);
  
  // Filter filler words only
  const fillers = new Set(['um', 'uh', 'erm', 'hmm', 'mm', 'mhm', 'ah', 'huh']);
  if (words.length > 0 && words.every((w) => fillers.has(w))) return true;

  // Filter obvious hallucinations from Whisper
  const lower = cleaned.toLowerCase();
  const hallucinations = [
    /thanks? for watching/,
    /subscribe/,
    /like and subscribe/,
    /please subscribe/,
    /see you next time/,
    /bye bye/,
    /thank you for listening/,
    /\[music\]/,
    /\[applause\]/,
    /\(music\)/,
  ];
  if (hallucinations.some(re => re.test(lower))) return true;

  // Too repetitive (often noise gets transcribed as repeated tokens)
  const uniqueRatio = words.length ? (new Set(words).size / words.length) : 0;
  if (words.length >= 6 && uniqueRatio < 0.35) return true;

  // Require minimum letters for meaningful content
  const lettersOnly = cleaned.replace(/[^a-z]/g, '');
  const minLetters = wakeWordEnabled ? 3 : 5;
  if (lettersOnly.length < minLetters) return true;

  return false;
};

const pickBestEnglishVoice = (voices) => {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const english = voices.filter((v) => /^en(-|_)/i.test(v.lang));
  const pool = english.length > 0 ? english : voices;

  const preferredMatchers = [
    /Google UK English Female/i,
    /Google US English/i,
    /Samantha/i,
    /Karen/i,
    /female/i,
    /Zira/i,
  ];

  for (const re of preferredMatchers) {
    const match = pool.find((v) => re.test(v.name));
    if (match) return match;
  }

  return pool[0] || null;
};

const getWakeWord = () => {
  const raw = (process.env.REACT_APP_WAKE_WORD ?? 'aera').trim();
  const lowered = raw.toLowerCase();
  if (!lowered) return 'aera';
  if (['off', 'none', 'disabled', 'false', '0'].includes(lowered)) return '';
  return lowered;
};

const getWakeWordVariants = () => {
  const wake = getWakeWord();
  if (!wake) return [];

  // Common Whisper transcription variants for "AERA"
  if (wake === 'aera') {
    return ['aera', 'era', 'aira', 'airah', 'aero', 'air a', 'a e r a', 'aira', 'aera', 'eira', 'ara'];
  }

  return [wake];
};

const applyWakeWord = (text) => {
  const wake = getWakeWord();
  if (!wake) {
    return { ok: true, prompt: text, wakeOnly: false, wakeEnabled: false };
  }

  const cleaned = stripPunctuation(text);
  const variants = getWakeWordVariants().map(escapeRegExp).join('|');

  // Wake word at the beginning (with optional greeting prefix)
  const startRe = new RegExp(`^(?:(?:hey|hi|hello|ok|okay)\\s+)?(?:${variants})\\b\\s*(.*)$`, 'i');
  const startMatch = cleaned.match(startRe);
  if (startMatch) {
    const remainder = (startMatch[1] || '').trim();
    return { ok: true, prompt: remainder, wakeOnly: remainder.length === 0, wakeEnabled: true };
  }

  // Wake word anywhere in the text (fallback for noisy prefix)
  const anywhereRe = new RegExp(`\\b(?:${variants})\\b`, 'i');
  const anywhereMatch = cleaned.match(anywhereRe);
  if (!anywhereMatch || typeof anywhereMatch.index !== 'number') {
    return { ok: false, prompt: '', wakeOnly: false, wakeEnabled: true };
  }

  const idx = anywhereMatch.index + anywhereMatch[0].length;
  const remainder = cleaned.slice(idx).trim();
  return { ok: true, prompt: remainder, wakeOnly: remainder.length === 0, wakeEnabled: true };
};

const pickRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];

  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
};

const VoiceAgent = () => {
  const [status, setStatus] = useState('idle');
  const [needsGesture, setNeedsGesture] = useState(false);
  const [errorLine, setErrorLine] = useState('');
  const [traceLine, setTraceLine] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [lastReply, setLastReply] = useState('');

  const shouldRunRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const busyRef = useRef(false);

  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const timeDataRef = useRef(null);
  const vadTimerRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const silenceSinceRef = useRef(null);
  const cancelRecordingRef = useRef(false);
  const speechDetectedRef = useRef(false);

  const cooldownUntilRef = useRef(0);
  const noiseFloorRef = useRef(0.01);
  const rmsHistoryRef = useRef([]);

  const voiceRef = useRef(null);
  const conversationRef = useRef([
    { role: 'system', content: SYSTEM_PROMPT },
  ]);

  const debug = useMemo(() => String(process.env.REACT_APP_VOICE_DEBUG || '') === 'true', []);

  const pushMessage = (msg) => {
    const history = conversationRef.current;
    history.push(msg);
    const MAX_MESSAGES = 14;
    if (history.length > MAX_MESSAGES) {
      conversationRef.current = [history[0], ...history.slice(-MAX_MESSAGES + 1)];
    }
  };

  const setError = (message, err) => {
    const msg = toCleanText(message);
    if (msg) setErrorLine(msg);
    if (debug) {
      console.error('[AERA voice] error:', msg, err);
    }
  };

  const speak = (text) => new Promise((resolve) => {
    const cleaned = toCleanText(text);
    if (!cleaned || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    isSpeakingRef.current = true;
    setStatus('speaking');

    try {
      window.speechSynthesis.cancel();
    } catch (_err) {
      // ignore
    }

    const utter = new SpeechSynthesisUtterance(cleaned);
    if (voiceRef.current) {
      utter.voice = voiceRef.current;
    }
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1;

    utter.onend = () => {
      isSpeakingRef.current = false;
      resolve();
    };
    utter.onerror = () => {
      isSpeakingRef.current = false;
      resolve();
    };

    window.speechSynthesis.speak(utter);
  });

  const stopVadLoop = () => {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
  };

  const stopRecording = ({ cancel } = { cancel: true }) => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state !== 'recording') return;

    cancelRecordingRef.current = Boolean(cancel);
    try {
      rec.stop();
    } catch (_err) {
      // ignore
    }
  };

  const teardownAudio = () => {
    stopVadLoop();

    try {
      stopRecording({ cancel: true });
    } catch (_err) {
      // ignore
    }

    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    analyserRef.current = null;
    timeDataRef.current = null;

    if (ctx) {
      try {
        ctx.close();
      } catch (_err) {
        // ignore
      }
    }

    const stream = micStreamRef.current;
    micStreamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
    silenceSinceRef.current = null;
  };

  const computeRms = () => {
    const analyser = analyserRef.current;
    const data = timeDataRef.current;
    if (!analyser || !data) return 0;

    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  };

  const setCooldown = (ms) => {
    const until = Date.now() + Math.max(0, Number(ms) || 0);
    cooldownUntilRef.current = Math.max(cooldownUntilRef.current || 0, until);
  };

  // Update adaptive noise floor
  const updateNoiseFloor = (rms) => {
    const history = rmsHistoryRef.current;
    history.push(rms);
    if (history.length > 50) {
      history.shift();
    }
    
    // Use the 20th percentile as noise floor estimate
    const sorted = [...history].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.2);
    const newFloor = sorted[idx] || 0.01;
    
    // Smooth the noise floor
    noiseFloorRef.current = noiseFloorRef.current * 0.95 + newFloor * 0.05;
  };

  const pauseAndSpeak = async (reply) => {
    shouldRunRef.current = false;
    stopRecording({ cancel: true });

    await speak(reply);

    setCooldown(POST_TTS_COOLDOWN_MS);

    setTimeout(() => {
      shouldRunRef.current = true;
      if (!busyRef.current) {
        setStatus('listening');
      }
    }, POST_TTS_COOLDOWN_MS);
  };

  const handleBlob = async (blob, durationMs) => {
    // Filter out recordings that are too short or didn't have enough speech energy
    if (!blob || durationMs < MIN_RECORDING_MS) {
      setCooldown(num(process.env.REACT_APP_VAD_REJECT_COOLDOWN_MS, 500));
      busyRef.current = false;
      setStatus('listening');
      return;
    }

    // Check if we detected actual speech during recording
    if (!speechDetectedRef.current) {
      setCooldown(num(process.env.REACT_APP_VAD_REJECT_COOLDOWN_MS, 400));
      busyRef.current = false;
      setStatus('listening');
      return;
    }

    setStatus('transcribing');

    let sttResult;
    try {
      sttResult = await transcribeAudio(blob);
      const transcript = toCleanText(typeof sttResult === 'string' ? sttResult : sttResult?.text || '');
      setLastTranscript(transcript);
      setTraceLine(transcript ? `STT: ${transcript}` : 'STT: (empty)');
      setErrorLine('');

      // Check no_speech_prob from Whisper
      const noSpeechProb = sttResult?.noSpeechProb;
      if (typeof noSpeechProb === 'number' && noSpeechProb > 0.7) {
        setCooldown(num(process.env.REACT_APP_VAD_REJECT_COOLDOWN_MS, 600));
        setTraceLine(`Filtered: no_speech_prob=${noSpeechProb.toFixed(2)}`);
        busyRef.current = false;
        setStatus('listening');
        return;
      }

      if (!transcript) {
        setCooldown(num(process.env.REACT_APP_VAD_REJECT_COOLDOWN_MS, 500));
        busyRef.current = false;
        setStatus('listening');
        return;
      }

      const wakeApplied = applyWakeWord(transcript);
      if (!wakeApplied.ok) {
        setCooldown(num(process.env.REACT_APP_VAD_WAKE_MISS_COOLDOWN_MS, 800));
        setTraceLine(transcript ? `Wake miss: ${transcript}` : 'Wake miss: (empty)');
        if (debug) {
          console.debug('[AERA voice] wake word not detected:', transcript);
        }
        busyRef.current = false;
        setStatus('listening');
        return;
      }

      const prompt = toCleanText(wakeApplied.prompt);
      setLastPrompt(prompt);
      setTraceLine(wakeApplied.wakeOnly ? 'Wake-only' : `Prompt: ${prompt}`);

      if (wakeApplied.wakeOnly) {
        window.dispatchEvent(new Event('aera-conversation-start'));
        try {
          await pauseAndSpeak('Yes? How can I help?');
        } finally {
          window.dispatchEvent(new Event('aera-conversation-end'));
          busyRef.current = false;
          setStatus('listening');
        }
        return;
      }

      if (isLikelyNoise(prompt, { 
        wakeWordEnabled: wakeApplied.wakeEnabled, 
        noSpeechProb: sttResult?.noSpeechProb 
      })) {
        setCooldown(num(process.env.REACT_APP_VAD_REJECT_COOLDOWN_MS, 800));
        setTraceLine(prompt ? `Ignored: ${prompt}` : 'Ignored: (empty)');
        if (debug) {
          console.debug('[AERA voice] ignored noise:', prompt);
        }
        busyRef.current = false;
        setStatus('listening');
        return;
      }

      window.dispatchEvent(new Event('aera-conversation-start'));
      setStatus('thinking');
      pushMessage({ role: 'user', content: prompt });

      try {
        const reply = await chatCompletions(conversationRef.current);
        pushMessage({ role: 'assistant', content: reply });
        setLastReply(reply);
        setTraceLine(`Reply: ${toCleanText(reply).slice(0, 120)}`);
        setErrorLine('');
        await pauseAndSpeak(reply);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setLastReply('');
        setError(`LLM error: ${message}`, err);
        await pauseAndSpeak(`Sorry, I couldn't process that. Please try again.`);
      } finally {
        window.dispatchEvent(new Event('aera-conversation-end'));
        busyRef.current = false;
        setStatus('listening');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCooldown(num(process.env.REACT_APP_VAD_REJECT_COOLDOWN_MS, 900));
      setError(`STT error: ${message}`, err);
      busyRef.current = false;
      setStatus('listening');
    }
  };

  const startRecording = () => {
    const stream = micStreamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder unavailable in this browser');
      setStatus('MediaRecorder unavailable');
      return;
    }

    const mimeType = pickRecorderMimeType();

    let rec;
    try {
      rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (err) {
      setError('Failed to start MediaRecorder', err);
      setStatus('MediaRecorder failed');
      return;
    }

    chunksRef.current = [];
    recordingStartedAtRef.current = Date.now();
    silenceSinceRef.current = null;
    cancelRecordingRef.current = false;
    speechDetectedRef.current = false;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    rec.onerror = (e) => {
      setError('MediaRecorder error', e);
    };

    rec.onstop = () => {
      const durationMs = Date.now() - (recordingStartedAtRef.current || Date.now());
      const cancelled = cancelRecordingRef.current;

      mediaRecorderRef.current = null;

      const chunks = chunksRef.current;
      chunksRef.current = [];
      silenceSinceRef.current = null;
      cancelRecordingRef.current = false;

      if (cancelled) {
        busyRef.current = false;
        speechDetectedRef.current = false;
        if (!isSpeakingRef.current) {
          setStatus('listening');
        }
        return;
      }

      const type = mimeType || (chunks[0] && chunks[0].type) || 'audio/webm';
      const blob = new Blob(chunks, { type });
      void handleBlob(blob, durationMs);
    };

    mediaRecorderRef.current = rec;

    try {
      rec.start(200);
      setStatus('hearing');
    } catch (err) {
      setError('Failed to start recording', err);
      mediaRecorderRef.current = null;
    }
  };

  const startVadLoop = () => {
    stopVadLoop();

    // Adaptive thresholds based on noise floor
    const getStartThreshold = () => {
      const base = num(process.env.REACT_APP_VAD_START_RMS, 0.04);
      const noiseFloor = noiseFloorRef.current || 0.01;
      return Math.max(base, noiseFloor * 3.0);
    };

    const getStopThreshold = () => {
      const base = num(process.env.REACT_APP_VAD_STOP_RMS, 0.02);
      const noiseFloor = noiseFloorRef.current || 0.01;
      return Math.max(base, noiseFloor * 1.8);
    };

    const maxRecordMs = num(process.env.REACT_APP_MAX_RECORD_MS, 15000);

    vadTimerRef.current = setInterval(() => {
      if (!shouldRunRef.current) {
        return;
      }

      const rec = mediaRecorderRef.current;
      const isRec = rec && rec.state === 'recording';

      // Never record while speaking
      if (isSpeakingRef.current) {
        if (isRec) stopRecording({ cancel: true });
        return;
      }

      // If transcribing/thinking, don't start new recording
      if (busyRef.current) {
        if (isRec) stopRecording({ cancel: true });
        return;
      }

      const rms = computeRms();
      
      // Update noise floor when not recording
      if (!isRec) {
        updateNoiseFloor(rms);
      }

      try {
        window.dispatchEvent(new CustomEvent('aera-mic-rms', { detail: { rms } }));
      } catch (_err) {
        // ignore
      }

      const now = Date.now();
      const startThreshold = getStartThreshold();
      const stopThreshold = getStopThreshold();

      if (!isRec) {
        if (now < (cooldownUntilRef.current || 0)) {
          return;
        }

        // Start recording if RMS exceeds threshold
        if (rms >= startThreshold) {
          startRecording();
        }
        return;
      }

      const startedAt = recordingStartedAtRef.current || now;
      const elapsed = now - startedAt;

      // Max recording duration
      if (elapsed >= maxRecordMs) {
        setStatus('transcribing');
        busyRef.current = true;
        stopRecording({ cancel: false });
        return;
      }

      // Track if we've detected clear speech during this recording
      if (rms >= startThreshold * 0.8) {
        speechDetectedRef.current = true;
      }

      // Check for silence to end recording
      if (rms >= stopThreshold) {
        silenceSinceRef.current = null;
        return;
      }

      // Need minimum recording before we check for silence
      if (elapsed < MIN_SPEECH_DURATION_MS) {
        return;
      }

      if (!silenceSinceRef.current) {
        silenceSinceRef.current = now;
        return;
      }

      const silentFor = now - silenceSinceRef.current;
      if (silentFor >= SILENCE_HOLD_MS) {
        setStatus('transcribing');
        busyRef.current = true;
        stopRecording({ cancel: false });
      }
    }, VAD_INTERVAL_MS);
  };

  const startAudioPipeline = async () => {
    teardownAudio();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone API not supported in this browser');
      setStatus('Microphone API unavailable');
      shouldRunRef.current = false;
      return;
    }

    setStatus('Requesting microphone...');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
        video: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'permission denied';
      setNeedsGesture(true);
      setError(`Microphone blocked: ${message}`, err);
      setStatus('Microphone permission blocked');
      return;
    }

    micStreamRef.current = stream;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      setError('AudioContext unavailable in this browser');
      setStatus('AudioContext unavailable');
      return;
    }

    const ctx = new AudioContextCtor();
    audioContextRef.current = ctx;

    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    } catch (err) {
      setNeedsGesture(true);
      setError('AudioContext is suspended (needs user gesture)', err);
    }

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);

    analyserRef.current = analyser;
    timeDataRef.current = new Uint8Array(analyser.fftSize);

    setNeedsGesture(false);
    setStatus('listening');
    setErrorLine('');

    startVadLoop();
  };

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      return undefined;
    }

    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current = pickBestEnglishVoice(voices);
    };

    load();
    window.speechSynthesis.onvoiceschanged = load;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await startAudioPipeline();
      if (cancelled) {
        teardownAudio();
      }
    })();

    return () => {
      cancelled = true;
      shouldRunRef.current = false;
      teardownAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!needsGesture) {
      return undefined;
    }

    let consumed = false;
    const tryEnable = () => {
      if (consumed) return;
      consumed = true;
      shouldRunRef.current = true;
      void startAudioPipeline();
    };

    window.addEventListener('pointerdown', tryEnable);
    window.addEventListener('keydown', tryEnable);
    window.addEventListener('touchstart', tryEnable);

    return () => {
      window.removeEventListener('pointerdown', tryEnable);
      window.removeEventListener('keydown', tryEnable);
      window.removeEventListener('touchstart', tryEnable);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsGesture]);

  const statusLower = String(status || '').toLowerCase();
  const hasError = Boolean(errorLine);

  const showOverlayText = debug
    || needsGesture
    || hasError
    || Boolean(traceLine)
    || /(hearing|transcribing|thinking|speaking|requesting)/i.test(statusLower)
    || /unavailable|blocked|tap to enable/i.test(statusLower);

  const dotColor = needsGesture || hasError || statusLower.includes('blocked') || statusLower.includes('unavailable')
    ? '#ff453a'
    : statusLower.includes('thinking') || statusLower.includes('transcribing')
      ? '#ffd60a'
      : statusLower.includes('speaking')
        ? '#0a84ff'
        : statusLower.includes('hearing')
          ? '#ff9500'
          : '#30d158';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 10,
        left: 10,
        zIndex: 9999,
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        opacity: showOverlayText ? (debug ? 0.75 : 0.9) : 0.35,
        pointerEvents: 'none',
        background: showOverlayText ? 'rgba(0,0,0,0.55)' : 'transparent',
        padding: showOverlayText ? '6px 8px' : 0,
        borderRadius: showOverlayText ? 8 : 0,
        maxWidth: 520,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 999,
            background: dotColor,
            flex: '0 0 auto',
            animation: statusLower.includes('hearing') ? 'pulse 0.5s ease-in-out infinite' : 'none',
          }}
        />
        {showOverlayText ? (
          <span>
            {needsGesture ? 'Tap/click once to enable voice + microphone permissions' : `Voice: ${status}`}
            {getWakeWord() ? ` (say "${getWakeWord()}" to activate)` : ''}
          </span>
        ) : null}
      </div>

      {hasError ? (
        <div style={{ marginTop: 6, color: '#ffd2d2' }}>
          {errorLine}
        </div>
      ) : null}

      {showOverlayText ? (
        <div style={{ marginTop: 6, opacity: 0.9 }}>
          {traceLine ? <div>{traceLine}</div> : null}
          {debug ? <div>Last transcript: {lastTranscript || '(none)'}</div> : null}
          {debug ? <div>Last prompt: {lastPrompt || '(none)'}</div> : null}
          {debug ? <div>Last reply: {(lastReply || '(none)').slice(0, 160)}</div> : null}
        </div>
      ) : null}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};

export default VoiceAgent;
