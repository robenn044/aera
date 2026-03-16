const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

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

  const { messages, temperature, max_tokens } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Body must include a non-empty "messages" array' });
  }

  const baseUrl = (process.env.GROQ_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const upstreamBody = {
    model,
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.4,
    ...(typeof max_tokens === 'number' ? { max_tokens } : { max_tokens: 256 }),
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
    return res.status(502).json({ error: `Upstream request failed: ${message}` });
  }

  let data;
  try {
    data = await upstreamResponse.json();
  } catch (_err) {
    return res.status(502).json({ error: 'Upstream returned non-JSON response' });
  }

  if (!upstreamResponse.ok) {
    return res.status(upstreamResponse.status).json({
      error: 'Upstream error',
      details: data,
    });
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return res.status(502).json({ error: 'Upstream response missing assistant content', details: data });
  }

  return res.status(200).json({
    content: content.trim(),
    usage: data?.usage || null,
  });
}
