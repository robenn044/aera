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

export async function chatCompletions(messages, options = {}) {
  const timeoutMs = Number(process.env.REACT_APP_VOICE_REQUEST_TIMEOUT_MS || 30000);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(toErrorString(data, `LLM request failed (${res.status})`));
  }

  const content = data?.content;
  if (typeof content !== 'string') {
    throw new Error('LLM response missing content');
  }

  return content;
}
