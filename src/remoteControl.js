const DEFAULT_ENDPOINT = '/api/commands';
const DEFAULT_CHANNEL = 'default';

const toCleanString = (value) => String(value || '').trim();

export const normalizeChannel = (value) => {
  const cleaned = toCleanString(value).replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 64);
  return cleaned || DEFAULT_CHANNEL;
};

export const normalizeEndpoint = (value) => {
  const cleaned = toCleanString(value);
  return cleaned ? cleaned.replace(/\/+$/, '') : DEFAULT_ENDPOINT;
};

export const getCommandDefaults = () => ({
  endpoint: normalizeEndpoint(process.env.REACT_APP_COMMANDS_ENDPOINT || DEFAULT_ENDPOINT),
  channel: normalizeChannel(process.env.REACT_APP_COMMANDS_CHANNEL || DEFAULT_CHANNEL),
});

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch (_err) {
    return {};
  }
};

export const sendRemoteCommand = async ({
  type,
  payload = {},
  channel,
  endpoint,
  signal,
}) => {
  const { endpoint: defaultEndpoint, channel: defaultChannel } = getCommandDefaults();
  const resolvedEndpoint = normalizeEndpoint(endpoint || defaultEndpoint);
  const resolvedChannel = normalizeChannel(channel || defaultChannel);
  const trimmedType = toCleanString(type);
  if (!trimmedType) {
    throw new Error('Command type is required.');
  }

  const res = await fetch(resolvedEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: trimmedType,
      payload,
      channel: resolvedChannel,
    }),
    signal,
  });

  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Command failed (${res.status})`);
  }
  return data;
};

export const fetchRemoteCommands = async ({
  channel,
  endpoint,
  limit = 20,
  peek = false,
  signal,
} = {}) => {
  const { endpoint: defaultEndpoint, channel: defaultChannel } = getCommandDefaults();
  const resolvedEndpoint = normalizeEndpoint(endpoint || defaultEndpoint);
  const resolvedChannel = normalizeChannel(channel || defaultChannel);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  const params = new URLSearchParams({
    channel: resolvedChannel,
    limit: String(safeLimit),
    ...(peek ? { peek: '1' } : {}),
  });
  const joiner = resolvedEndpoint.includes('?') ? '&' : '?';
  const url = `${resolvedEndpoint}${joiner}${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });

  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Fetch failed (${res.status})`);
  }

  return data;
};
