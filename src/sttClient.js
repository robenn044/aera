const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Failed to read audio blob'));
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    const comma = dataUrl.indexOf(',');
    if (comma === -1) {
      reject(new Error('Unexpected FileReader result'));
      return;
    }
    resolve(dataUrl.slice(comma + 1));
  };
  reader.readAsDataURL(blob);
});

const toErrorString = (data, fallback) => {
  if (!data) return fallback;
  if (typeof data === 'string') return data;

  const upstreamMessage = data?.details?.error?.message || data?.details?.message;
  if (typeof upstreamMessage === 'string' && upstreamMessage.trim()) {
    return upstreamMessage;
  }

  const err = data?.error;
  if (typeof err === 'string' && err.trim()) return err;

  try {
    return JSON.stringify(data);
  } catch (_err) {
    return fallback;
  }
};

export async function transcribeAudio(blob) {
  if (!blob) throw new Error('No audio blob to transcribe');

  const mimeType = blob.type || 'audio/webm';
  const audioBase64 = await blobToBase64(blob);

  const timeoutMs = Number(process.env.REACT_APP_VOICE_REQUEST_TIMEOUT_MS || 30000);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res;
  try {
    res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audioBase64, mimeType }),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`STT request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(toErrorString(data, `STT request failed (${res.status})`));
  }

  const text = data?.text;
  if (typeof text !== 'string') {
    throw new Error('STT response missing text');
  }

  // Return full response object for better filtering
  return {
    text,
    noSpeechProb: data?.no_speech_prob ?? null,
    duration: data?.duration ?? null,
    language: data?.language ?? 'en',
  };
}
