const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

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

  const { messages, temperature, max_tokens } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json(400, { error: 'Body must include a non-empty "messages" array' });
  }

  const baseUrl = (process.env.GROQ_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

  const upstreamBody = {
    model,
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.4,
    ...(typeof max_tokens === 'number' ? { max_tokens } : {}),
  };

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(502, { error: `Upstream request failed: ${message}` });
  }

  let data;
  try {
    data = await upstreamResponse.json();
  } catch (_err) {
    return json(502, { error: 'Upstream returned non-JSON response' });
  }

  if (!upstreamResponse.ok) {
    return json(upstreamResponse.status, {
      error: 'Upstream error',
      details: data,
    });
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return json(502, { error: 'Upstream response missing assistant content', details: data });
  }

  return json(200, {
    content: content.trim(),
    usage: data?.usage || null,
  });
};
