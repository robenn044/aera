import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import LockScreen from './LockScreen';
import Dashboard from './Dashboard';
import './App.css';

const AUTO_LOCK_MS = 60 * 1000;
const FACE_DETECT_INTERVAL_MS = 220;
const MIN_FACE_AREA_RATIO = 0.012;
const CENTER_TOLERANCE_X = 0.42;
const CENTER_TOLERANCE_Y = 0.42;
const LOOKING_FRAMES_REQUIRED = 2;
const FACE_SCORE_THRESHOLD = 0.72;
const MAX_YAW_RATIO = 0.4;
const MAX_ROLL_RATIO = 0.24;
const FACE_CAMERA_CONSTRAINTS = {
  facingMode: 'user',
  width: { ideal: 640, max: 960 },
  height: { ideal: 360, max: 540 },
  frameRate: { ideal: 24, max: 30 },
};
const BLAZEFACE_CONFIG = {
  maxFaces: 1,
  inputWidth: 128,
  inputHeight: 128,
  iouThreshold: 0.3,
  scoreThreshold: FACE_SCORE_THRESHOLD,
};

let detectorModelPromise = null;
let tensorflowBackendPromise = null;

const ensureTensorflowBackend = async () => {
  if (!tensorflowBackendPromise) {
    tensorflowBackendPromise = (async () => {
      await tf.ready();
      if (tf.getBackend() !== 'webgl') {
        try {
          await tf.setBackend('webgl');
        } catch (_err) {
          await tf.setBackend('cpu');
        }
      }
      await tf.ready();
    })();
  }

  return tensorflowBackendPromise;
};

const getFaceDetectorModel = async () => {
  if (!detectorModelPromise) {
    detectorModelPromise = (async () => {
      await ensureTensorflowBackend();
      return blazeface.load(BLAZEFACE_CONFIG);
    })();
  }

  return detectorModelPromise;
};

const toPoint = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const x = Number(coordinates[0]);
  const y = Number(coordinates[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
};

function App() {
  const [isLocked, setIsLocked] = useState(true);
  const setFaceStatus = () => {};
  const [cameraStream, setCameraStream] = useState(null);
  const autoLockTimeoutRef = useRef(null);
  const conversationActiveRef = useRef(false);
  const unlockCooldownRef = useRef(false);

  const clearAutoLock = useCallback(() => {
    if (autoLockTimeoutRef.current) {
      clearTimeout(autoLockTimeoutRef.current);
      autoLockTimeoutRef.current = null;
    }
  }, []);

  const resetAutoLockTimer = useCallback(() => {
    clearAutoLock();
    if (conversationActiveRef.current) {
      return;
    }
    autoLockTimeoutRef.current = setTimeout(() => {
      setIsLocked(true);
    }, AUTO_LOCK_MS);
  }, [clearAutoLock]);

  const handleUnlock = useCallback(() => {
    setIsLocked(false);
    resetAutoLockTimer();
  }, [resetAutoLockTimer]);

  useEffect(() => {
    // Preload once so first lock detection starts faster.
    getFaceDetectorModel().catch(() => {});
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setFaceStatus('Camera API not supported in this browser');
      return undefined;
    }

    let cancelled = false;
    let acquiredStream = null;

    const startSharedCamera = async () => {
      setFaceStatus('Requesting camera access...');

      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia({
          video: FACE_CAMERA_CONSTRAINTS,
          audio: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'permission denied';
        if (!cancelled) {
          setFaceStatus(`Camera unavailable - ${message}`);
        }
        return;
      }

      if (cancelled) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        return;
      }

      acquiredStream.getVideoTracks().forEach((track) => {
        track.addEventListener(
          'ended',
          () => {
            if (!cancelled) {
              setCameraStream(null);
              setFaceStatus('Camera stopped by browser or system');
            }
          },
          { once: true },
        );
      });

      setCameraStream(acquiredStream);
      setFaceStatus('Camera ready');
    };

    startSharedCamera();

    return () => {
      cancelled = true;
      if (acquiredStream) {
        acquiredStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (isLocked) {
      clearAutoLock();
      return undefined;
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'pointerdown'];
    const onActivity = () => resetAutoLockTimer();
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });

    const onConversationStart = () => {
      conversationActiveRef.current = true;
      clearAutoLock();
    };

    const onConversationEnd = () => {
      conversationActiveRef.current = false;
      resetAutoLockTimer();
    };

    window.addEventListener('aera-conversation-start', onConversationStart);
    window.addEventListener('aera-conversation-end', onConversationEnd);

    resetAutoLockTimer();

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      window.removeEventListener('aera-conversation-start', onConversationStart);
      window.removeEventListener('aera-conversation-end', onConversationEnd);
      clearAutoLock();
    };
  }, [clearAutoLock, isLocked, resetAutoLockTimer]);

  useEffect(() => {
    if (!isLocked) {
      return undefined;
    }

    if (!cameraStream) {
      setFaceStatus('Waiting for camera...');
      return undefined;
    }

    let cancelled = false;
    let detectTimer = null;
    let videoEl = null;
    let detectorModel = null;
    let consecutiveLooking = 0;
    let detectionInFlight = false;

    const setStatus = (nextStatus) => {
      if (!cancelled) {
        setFaceStatus(nextStatus);
      }
    };

    const scheduleNextDetection = (delay = FACE_DETECT_INTERVAL_MS) => {
      if (cancelled) {
        return;
      }
      detectTimer = setTimeout(runDetection, delay);
    };

    const runDetection = async () => {
      if (cancelled || detectionInFlight || !videoEl || !detectorModel) {
        scheduleNextDetection();
        return;
      }

      detectionInFlight = true;
      try {
        const predictions = await detectorModel.estimateFaces(videoEl, false);
        if (!Array.isArray(predictions) || predictions.length === 0) {
          consecutiveLooking = 0;
          setStatus('READY - browser camera - no face detected');
          return;
        }

        const face = predictions[0];
        const topLeft = Array.isArray(face?.topLeft) ? face.topLeft : [0, 0];
        const bottomRight = Array.isArray(face?.bottomRight) ? face.bottomRight : [0, 0];
        const x = Number(topLeft[0] || 0);
        const y = Number(topLeft[1] || 0);
        const width = Math.max(0, Number(bottomRight[0] || 0) - x);
        const height = Math.max(0, Number(bottomRight[1] || 0) - y);
        const score = Array.isArray(face?.probability)
          ? Number(face.probability[0] || 0)
          : Number(face?.probability || 0);

        if (!Number.isFinite(score) || score < FACE_SCORE_THRESHOLD) {
          consecutiveLooking = 0;
          setStatus('READY - browser camera - no face detected');
          return;
        }

        const frameW = Math.max(1, videoEl.videoWidth || 1);
        const frameH = Math.max(1, videoEl.videoHeight || 1);
        const faceAreaRatio = (width * height) / (frameW * frameH);
        const centerX = x + (width / 2);
        const centerY = y + (height / 2);
        const offsetX = Math.abs(centerX - (frameW / 2)) / frameW;
        const offsetY = Math.abs(centerY - (frameH / 2)) / frameH;

        const lookingNow =
          faceAreaRatio >= MIN_FACE_AREA_RATIO
          && offsetX <= CENTER_TOLERANCE_X
          && offsetY <= CENTER_TOLERANCE_Y;

        const landmarks = Array.isArray(face?.landmarks) ? face.landmarks : [];
        const rightEye = toPoint(landmarks[0]);
        const leftEye = toPoint(landmarks[1]);
        const nose = toPoint(landmarks[2]);

        let frontal = false;
        if (leftEye && rightEye && nose) {
          const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
          if (eyeDistance > 0.0001) {
            const yawRatio = Math.abs(((nose.x - leftEye.x) - (rightEye.x - nose.x)) / eyeDistance);
            const rollRatio = Math.abs((leftEye.y - rightEye.y) / eyeDistance);
            frontal = yawRatio <= MAX_YAW_RATIO && rollRatio <= MAX_ROLL_RATIO;
          }
        }

        const lookingCandidate = lookingNow && frontal;
        consecutiveLooking = lookingCandidate ? (consecutiveLooking + 1) : 0;
        const lookingAtCamera = consecutiveLooking >= LOOKING_FRAMES_REQUIRED;

        const statusMessage = lookingAtCamera
          ? 'face detected and centered'
          : lookingCandidate
            ? 'face detected'
            : 'face detected - look directly at camera';
        setStatus(`READY - browser camera - ${statusMessage}`);

        if (lookingAtCamera && !unlockCooldownRef.current) {
          unlockCooldownRef.current = true;
          handleUnlock();
          setTimeout(() => {
            unlockCooldownRef.current = false;
          }, 1500);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown detector error';
        setStatus(`Face detection error - ${message}`);
      } finally {
        detectionInFlight = false;
        scheduleNextDetection();
      }
    };

    const startBrowserFaceDetection = async () => {
      const modelPromise = getFaceDetectorModel();

      videoEl = document.createElement('video');
      videoEl.setAttribute('playsinline', '');
      videoEl.muted = true;
      videoEl.srcObject = cameraStream;
      try {
        await videoEl.play();
      } catch (_err) {
        // Browsers that block autoplay for hidden video still decode camera frames.
      }

      await new Promise((resolve) => {
        if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
          resolve();
          return;
        }

        const onLoaded = () => resolve();
        videoEl.addEventListener('loadeddata', onLoaded, { once: true });
        setTimeout(resolve, 260);
      });

      setStatus('Camera ready - loading detector...');
      try {
        detectorModel = await modelPromise;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'model load failed';
        setStatus(`Face model failed to load - ${message}`);
        return;
      }

      if (cancelled) {
        return;
      }

      setStatus('READY - browser camera active');
      scheduleNextDetection(80);
    };

    startBrowserFaceDetection();

    return () => {
      cancelled = true;
      if (detectTimer) {
        clearTimeout(detectTimer);
      }
      if (videoEl) {
        videoEl.pause();
        videoEl.srcObject = null;
      }
      detectorModel = null;
    };
  }, [cameraStream, handleUnlock, isLocked]);

  return (
    <div className="app-container" onClick={isLocked ? handleUnlock : undefined}>
      
      {/* 1. The Lock Screen (Top Layer) */}
      <div className={`screen screen-lock ${isLocked ? 'visible' : 'hidden'}`}>
        <LockScreen />
      </div>

      {/* 2. The Dashboard (Bottom Layer) */}
      <div className={`screen screen-dashboard ${!isLocked ? 'visible' : 'hidden'}`}>
        <Dashboard active={!isLocked} cameraStream={cameraStream} />
      </div>

    </div>
  );
}

export default App;
