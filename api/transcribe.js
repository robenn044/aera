const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server not configured (missing GROQ_API_KEY)' });
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (_err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { audioBase64, mimeType } = payload || {};
  if (typeof audioBase64 !== 'string' || audioBase64.length < 32) {
    return res.status(400).json({ error: 'Body must include "audioBase64" (base64-encoded audio)' });
  }

  const baseUrl = (process.env.GROQ_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.GROQ_STT_MODEL || 'whisper-large-v3';

  let buffer;
  try {
    buffer = Buffer.from(audioBase64, 'base64');
  } catch (_err) {
    return res.status(400).json({ error: 'audioBase64 must be valid base64' });
  }

  if (!buffer || buffer.length < 16) {
    return res.status(400).json({ error: 'audioBase64 decoded to an empty buffer' });
  }

  const type = typeof mimeType === 'string' && mimeType ? mimeType : 'audio/webm';

  const filename = type.includes('ogg')
    ? 'audio.ogg'
    : type.includes('wav')
      ? 'audio.wav'
      : type.includes('mpeg')
        ? 'audio.mp3'
        : 'audio.webm';

  // Create FormData for the Groq API
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), filename);
  form.append('model', model);
  form.append('language', process.env.GROQ_STT_LANGUAGE || 'en');

  const temperature = toNumber(process.env.GROQ_STT_TEMPERATURE, 0);
  form.append('temperature', String(Math.max(0, Math.min(1, temperature))));
  form.append('response_format', 'verbose_json');

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Upstream request failed: ${message}` });
  }

  let data;
  try {
    data = await upstreamResponse.json();
  } catch (_err) {
    const text = await upstreamResponse.text().catch(() => '');
    return res.status(502).json({ error: 'Upstream returned non-JSON response', details: text.slice(0, 2000) });
  }

  if (!upstreamResponse.ok) {
    return res.status(upstreamResponse.status).json({
      error: 'Upstream error',
      details: data,
    });
  }

  const text = data?.text;
  if (typeof text !== 'string') {
    return res.status(502).json({ error: 'Upstream response missing transcription text', details: data });
  }

  // Return verbose response for better filtering on client
  return res.status(200).json({
    text: text.trim(),
    language: data?.language || 'en',
    duration: data?.duration || null,
    segments: data?.segments || [],
    no_speech_prob: data?.segments?.[0]?.no_speech_prob ?? null,
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
