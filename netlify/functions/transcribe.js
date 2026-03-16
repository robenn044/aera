const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': event.headers?.origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' }, { Allow: 'POST, OPTIONS' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return json(500, { error: 'Server not configured (missing GROQ_API_KEY)' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_err) {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { audioBase64, mimeType } = payload || {};
  if (typeof audioBase64 !== 'string' || audioBase64.length < 32) {
    return json(400, { error: 'Body must include "audioBase64" (base64-encoded audio)' });
  }

  const baseUrl = (process.env.GROQ_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.GROQ_STT_MODEL || 'whisper-large-v3';

  let buffer;
  try {
    buffer = Buffer.from(audioBase64, 'base64');
  } catch (_err) {
    return json(400, { error: 'audioBase64 must be valid base64' });
  }

  if (!buffer || buffer.length < 16) {
    return json(400, { error: 'audioBase64 decoded to an empty buffer' });
  }

  const type = typeof mimeType === 'string' && mimeType ? mimeType : 'audio/webm';

  const filename = type.includes('ogg')
    ? 'audio.ogg'
    : type.includes('wav')
      ? 'audio.wav'
      : type.includes('mpeg')
        ? 'audio.mp3'
        : 'audio.webm';

  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), filename);
  form.append('model', model);
  form.append('language', process.env.GROQ_STT_LANGUAGE || 'en');

  const temperature = toNumber(process.env.GROQ_STT_TEMPERATURE, 0);
  // Keep the range sane; Whisper expects ~0..1
  form.append('temperature', String(Math.max(0, Math.min(1, temperature))));

  form.append('response_format', 'json');

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
    return json(502, { error: `Upstream request failed: ${message}` });
  }

  let data;
  try {
    data = await upstreamResponse.json();
  } catch (_err) {
    const text = await upstreamResponse.text().catch(() => '');
    return json(502, { error: 'Upstream returned non-JSON response', details: text.slice(0, 2000) });
  }

  if (!upstreamResponse.ok) {
    return json(upstreamResponse.status, {
      error: 'Upstream error',
      details: data,
    });
  }

  const text = data?.text;
  if (typeof text !== 'string') {
    return json(502, { error: 'Upstream response missing transcription text', details: data });
  }

  return json(200, {
    text: text.trim(),
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: 'Transcribe function crashed', message });
  }
};
