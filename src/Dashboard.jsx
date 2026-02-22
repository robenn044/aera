import { useState, useEffect, useRef, useCallback } from 'react';
import Orb from './Orb';
import './Dashboard.css';

const ONE_HOUR_MS = 60 * 60 * 1000;
const FALLBACK_COORDS = { latitude: 40.7128, longitude: -74.0060 }; // New York City
const AUDIO_LEVEL_SCALE = 10.5;
const AUDIO_LEVEL_SMOOTHING = 0.28;
const AUDIO_LEVEL_INTERVAL_MS = 80;
const AUDIO_ACTIVITY_THRESHOLD = 0.06;
const AUDIO_ACTIVITY_HOLD_MS = 650;

const ThermometerIcon = () => (
  <svg className="status-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M14 14.76V5a2 2 0 1 0-4 0v9.76A4 4 0 1 0 14 14.76ZM12 3a2 2 0 0 1 2 2v10.26a3 3 0 1 1-4 0V5a2 2 0 0 1 2-2Zm-1 5h2v7h-2V8Z"
      fill="currentColor"
    />
  </svg>
);

const LightIcon = () => (
  <svg className="status-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 4a1 1 0 0 0 1-1V2a1 1 0 1 0-2 0v1a1 1 0 0 0 1 1Zm0 16a1 1 0 0 0-1 1v1a1 1 0 1 0 2 0v-1a1 1 0 0 0-1-1Zm8-9h-1a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2ZM5 12a1 1 0 0 0-1-1H3a1 1 0 1 0 0 2h1a1 1 0 0 0 1-1Zm9.12-5.88a1 1 0 0 0 .71-.29l.71-.71a1 1 0 0 0-1.41-1.41l-.71.71a1 1 0 0 0 .7 1.7Zm-4.24 11.76a1 1 0 0 0-.7.29l-.71.71a1 1 0 0 0 1.41 1.41l.71-.71a1 1 0 0 0-.71-1.7Zm8.48 1.41a1 1 0 0 0 0-1.41l-.71-.71a1 1 0 1 0-1.41 1.41l.71.71a1 1 0 0 0 1.41 0Zm-11.31-11.3a1 1 0 0 0 0-1.42l-.71-.7a1 1 0 1 0-1.41 1.4l.71.71a1 1 0 0 0 1.41.01ZM12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5Zm0 8a3 3 0 1 1 3-3 3 3 0 0 1-3 3Z"
      fill="currentColor"
    />
  </svg>
);

const Dashboard = ({ active = true, cameraStream = null }) => {
  const videoRef = useRef(null);
  const audioCaptureRef = useRef({
    stream: null,
    context: null,
    analyser: null,
    source: null,
    meterTimer: null,
  });
  const audioRequestInFlightRef = useRef(false);
  const autoAudioRequestedRef = useRef(false);
  const dashboardActiveRef = useRef(active);
  const audioLastActiveAtRef = useRef(0);

  const [time, setTime] = useState(new Date());
  const [temperature, setTemperature] = useState(null);
  const [tempUnit, setTempUnit] = useState('C');
  const [lightLevel, setLightLevel] = useState(null);
  const [environmentUpdatedAt, setEnvironmentUpdatedAt] = useState(null);
  const [orbLevel, setOrbLevel] = useState(0);
  const [audioLevelPercent, setAudioLevelPercent] = useState(0);
  const [audioPeakPercent, setAudioPeakPercent] = useState(0);
  const [audioSourceLabel, setAudioSourceLabel] = useState('Not connected');
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [, setAudioStatus] = useState('System audio will be requested automatically');
  const [needsAudioGestureRetry, setNeedsAudioGestureRetry] = useState(false);

  const audioCaptureSupported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);

  const toggleTempUnit = useCallback(() => {
    setTempUnit((prev) => (prev === 'C' ? 'F' : 'C'));
  }, []);

  const stopAudioCapture = useCallback((nextStatus = 'Audio source disconnected', shouldUpdateState = true) => {
    const capture = audioCaptureRef.current;

    if (capture.meterTimer) {
      clearInterval(capture.meterTimer);
    }

    if (capture.source) {
      capture.source.disconnect();
    }

    if (capture.analyser) {
      capture.analyser.disconnect();
    }

    if (capture.stream) {
      capture.stream.getTracks().forEach((track) => track.stop());
    }

    if (capture.context && capture.context.state !== 'closed') {
      capture.context.close().catch(() => {});
    }

    audioCaptureRef.current = {
      stream: null,
      context: null,
      analyser: null,
      source: null,
      meterTimer: null,
    };
    audioRequestInFlightRef.current = false;
    audioLastActiveAtRef.current = 0;
    setAudioSourceLabel('Not connected');
    setAudioLevelPercent(0);
    setAudioPeakPercent(0);
    setIsAudioActive(false);

    if (shouldUpdateState) {
      setOrbLevel(0);
      setAudioStatus(nextStatus);
    }
  }, []);

  const startAudioCapture = useCallback(async () => {
    if (audioRequestInFlightRef.current) {
      return;
    }

    if (!active) {
      setAudioStatus('Unlock dashboard before requesting system audio');
      return;
    }

    if (!audioCaptureSupported) {
      setAudioStatus('This browser does not support system audio capture');
      return;
    }

    setNeedsAudioGestureRetry(false);
    audioRequestInFlightRef.current = true;
    stopAudioCapture('Requesting system audio...', false);
    setAudioStatus('Requesting system audio. Choose Entire Screen and enable Share system audio.');

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 5, max: 10 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false,
          channelCount: 2,
        },
        selfBrowserSurface: 'exclude',
        preferCurrentTab: false,
        systemAudio: 'include',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'capture request canceled';
      const looksLikeGestureBlock = err?.name === 'NotAllowedError'
        || /gesture|user activation|interact|permission/i.test(message);
      if (looksLikeGestureBlock) {
        setNeedsAudioGestureRetry(true);
        setAudioStatus('System audio requires one click/key press. Interact once to retry.');
      } else {
        setAudioStatus(`System audio unavailable - ${message}`);
      }
      audioRequestInFlightRef.current = false;
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      setAudioStatus('No system audio track was shared. Select Entire Screen and enable Share system audio.');
      audioRequestInFlightRef.current = false;
      return;
    }

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      stream.getTracks().forEach((track) => track.stop());
      setAudioStatus('Web Audio API unavailable in this browser');
      audioRequestInFlightRef.current = false;
      return;
    }

    const context = new AudioContextConstructor();
    if (context.state === 'suspended') {
      await context.resume().catch(() => {});
    }

    stream.getVideoTracks().forEach((track) => {
      track.enabled = false;
    });

    const source = context.createMediaStreamSource(new MediaStream(audioTracks));
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);
    const sourceLabel = audioTracks[0]?.label?.trim() || 'Shared system source';
    setAudioSourceLabel(sourceLabel);
    setAudioPeakPercent(0);
    audioLastActiveAtRef.current = 0;

    const meterBuffer = new Float32Array(analyser.fftSize);
    const meterTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(meterBuffer);
      let sumSquares = 0;
      for (let i = 0; i < meterBuffer.length; i += 1) {
        const sample = meterBuffer[i];
        sumSquares += sample * sample;
      }

      const rms = Math.sqrt(sumSquares / meterBuffer.length);
      const normalized = Math.max(0, Math.min(1, rms * AUDIO_LEVEL_SCALE));
      const levelPercent = Math.round(normalized * 100);
      const now = Date.now();

      if (normalized >= AUDIO_ACTIVITY_THRESHOLD) {
        audioLastActiveAtRef.current = now;
        setIsAudioActive((prev) => (prev ? prev : true));
      } else if (
        audioLastActiveAtRef.current > 0
        && now - audioLastActiveAtRef.current >= AUDIO_ACTIVITY_HOLD_MS
      ) {
        setIsAudioActive((prev) => (prev ? false : prev));
      }

      setAudioLevelPercent((prev) => (prev !== levelPercent ? levelPercent : prev));
      setAudioPeakPercent((prev) => (levelPercent > prev ? levelPercent : prev));

      if (dashboardActiveRef.current) {
        setOrbLevel((prev) => (prev * (1 - AUDIO_LEVEL_SMOOTHING)) + (normalized * AUDIO_LEVEL_SMOOTHING));
      }
    }, AUDIO_LEVEL_INTERVAL_MS);

    stream.getTracks().forEach((track) => {
      track.addEventListener(
        'ended',
        () => {
          stopAudioCapture('Audio source ended');
        },
        { once: true }
      );
    });

    audioCaptureRef.current = {
      stream,
      context,
      analyser,
      source,
      meterTimer,
    };

    audioRequestInFlightRef.current = false;
    setAudioStatus(`System audio connected: ${sourceLabel}`);
  }, [active, audioCaptureSupported, stopAudioCapture]);

  // =========================
  // CAMERA
  // =========================
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) {
      return undefined;
    }

    if (!cameraStream || !active) {
      videoEl.pause();
      videoEl.srcObject = null;
      return undefined;
    }

    if (videoEl.srcObject !== cameraStream) {
      videoEl.srcObject = cameraStream;
    }

    videoEl.play().catch(() => {});

    return () => {
      if (videoEl.srcObject === cameraStream) {
        videoEl.pause();
        videoEl.srcObject = null;
      }
    };
  }, [active, cameraStream]);

  // =========================
  // CLOCK
  // =========================
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // =========================
  // ORB AUDIO REACTIVITY
  // =========================
  useEffect(() => {
    dashboardActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!active) {
      setNeedsAudioGestureRetry(false);
      setOrbLevel(0);
      return;
    }

    if (!audioCaptureSupported) {
      setAudioStatus('This browser does not support system audio capture');
      return;
    }

    if (!autoAudioRequestedRef.current) {
      autoAudioRequestedRef.current = true;
      startAudioCapture();
    }
  }, [active, audioCaptureSupported, startAudioCapture]);

  useEffect(() => {
    if (!active || !needsAudioGestureRetry) {
      return undefined;
    }

    let consumed = false;
    const retryCapture = () => {
      if (consumed) {
        return;
      }
      consumed = true;
      setNeedsAudioGestureRetry(false);
      startAudioCapture();
    };

    window.addEventListener('pointerdown', retryCapture);
    window.addEventListener('keydown', retryCapture);
    window.addEventListener('touchstart', retryCapture);

    return () => {
      window.removeEventListener('pointerdown', retryCapture);
      window.removeEventListener('keydown', retryCapture);
      window.removeEventListener('touchstart', retryCapture);
    };
  }, [active, needsAudioGestureRetry, startAudioCapture]);

  useEffect(() => () => stopAudioCapture('Audio source disconnected', false), [stopAudioCapture]);

  // =========================
  // WEATHER + LIGHT FETCH (HOURLY)
  // =========================
  useEffect(() => {
    let hourlyInterval;

    const fetchEnvironmentData = async (coords) => {
      const { latitude, longitude } = coords;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=shortwave_radiation&timezone=auto`;

      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Open-Meteo request failed: ${res.status}`);
        }

        const data = await res.json();
        const currentTemp = data?.current?.temperature_2m;
        const hourlyTimes = data?.hourly?.time || [];
        const hourlyRadiation = data?.hourly?.shortwave_radiation || [];

        if (typeof currentTemp === 'number') {
          setTemperature(currentTemp);
        } else {
          setTemperature(null);
        }

        const now = new Date();
        let nearestIndex = -1;
        let smallestDiff = Number.POSITIVE_INFINITY;

        for (let i = 0; i < hourlyTimes.length; i += 1) {
          const sampleTime = new Date(hourlyTimes[i]);
          const diff = Math.abs(sampleTime.getTime() - now.getTime());
          if (diff < smallestDiff) {
            smallestDiff = diff;
            nearestIndex = i;
          }
        }

        const radiation = nearestIndex >= 0 ? hourlyRadiation[nearestIndex] : null;
        if (typeof radiation === 'number') {
          const normalized = Math.round(Math.max(0, Math.min(100, (radiation / 1000) * 100)));
          setLightLevel(normalized);
        } else {
          setLightLevel(null);
        }
        setEnvironmentUpdatedAt(new Date());
      } catch (err) {
        console.error('Environment fetch error:', err);
        setTemperature(null);
        setLightLevel(null);
      }
    };

    const startUpdates = (coords) => {
      fetchEnvironmentData(coords);
      hourlyInterval = setInterval(() => fetchEnvironmentData(coords), ONE_HOUR_MS);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          startUpdates({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          startUpdates(FALLBACK_COORDS);
        },
        { timeout: 10000 }
      );
    } else {
      startUpdates(FALLBACK_COORDS);
    }

    return () => {
      if (hourlyInterval) {
        clearInterval(hourlyInterval);
      }
    };
  }, []);

  const hours = time.toLocaleTimeString([], { hour: '2-digit', hour12: false });
  const minutes = time.toLocaleTimeString([], { minute: '2-digit' });
  const dayName = time.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
  const dayNum = time.getDate();
  const month = time.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();

  const greeting = (() => {
    const h = time.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  })();

  const tempDisplay = (() => {
    if (temperature === null || temperature === undefined) {
      return '\u2014';
    }

    if (tempUnit === 'F') {
      const fahrenheit = (temperature * 9) / 5 + 32;
      return `${Math.round(fahrenheit)}\u00B0F`;
    }

    return `${Math.round(temperature)}\u00B0C`;
  })();

  const lightDisplay = lightLevel !== null && lightLevel !== undefined ? `${lightLevel}%` : '\u2014';
  const lightCondition = (() => {
    if (lightLevel === null || lightLevel === undefined) return 'Unknown';
    if (lightLevel < 25) return 'Low';
    if (lightLevel < 65) return 'Moderate';
    return 'Bright';
  })();
  const envUpdatedDisplay = environmentUpdatedAt
    ? `Updated ${environmentUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Waiting for weather';

  return (
    <div className="dashboard">
      {/* LEFT: CAMERA */}
      <div className="camera-section">
        <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
      </div>

      {/* RIGHT PANEL */}
      <div className="panel">
        {/* TOP */}
        <div className="panel-top">
          <div className="greeting-row">
            <p className="greeting-text">{greeting}</p>
            <div className="date-text">
              <span>{dayName}</span>
              <span className="date-dot">\u00B7</span>
              <span>
                {dayNum} {month}
              </span>
            </div>
          </div>
          <p className="environment-updated">{envUpdatedDisplay}</p>

          <div className="clock">
            <span className="clock-digit">{hours}</span>
            <span className="clock-colon">:</span>
            <span className="clock-digit">{minutes}</span>
          </div>

          <div className="status-row">
            <button className="status-item status-item-button" onClick={toggleTempUnit} type="button" title="Toggle C/F">
              <ThermometerIcon />
              <span className="status-copy">
                <span className="status-label">Temp</span>
                <span className="status-value">{tempDisplay}</span>
              </span>
            </button>

            <div className="status-divider" />

            <div className="status-item">
              <LightIcon />
              <span className="status-copy">
                <span className="status-label">Light</span>
                <span className="status-value">{lightDisplay}</span>
                <span className="status-sub">{lightCondition}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ORB */}
        <div className="orb-section">
          <div className="orb-container">
            <div className="orb-wrapper">
              <Orb
                hoverIntensity={0.5}
                rotateOnHover
                hue={0}
                forceHoverState={false}
                backgroundColor="#000000"
                activityLevel={orbLevel}
              />
            </div>
          </div>
        </div>

        {/* AUDIO MONITOR */}
        <div className="panel-bottom">
          <div className="audio-monitor">
            <div className="audio-monitor-row">
              <span className="audio-monitor-label">Source</span>
              <span className="audio-monitor-value" title={audioSourceLabel}>{audioSourceLabel}</span>
            </div>

            <div className="audio-monitor-row">
              <span className="audio-monitor-label">State</span>
              <span className={`audio-monitor-state ${isAudioActive ? 'audio-monitor-state-active' : 'audio-monitor-state-idle'}`}>
                {isAudioActive ? 'Audio Active' : 'Silent'}
              </span>
            </div>

            <div className="audio-monitor-row">
              <span className="audio-monitor-label">Live Level</span>
              <span className="audio-monitor-value">{audioLevelPercent}%</span>
            </div>

            <div className="audio-monitor-meter" aria-hidden="true">
              <span style={{ width: `${audioLevelPercent}%` }} />
            </div>

            <div className="audio-monitor-row">
              <span className="audio-monitor-label">Peak</span>
              <span className="audio-monitor-value">{audioPeakPercent}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
