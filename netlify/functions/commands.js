const { randomUUID } = require('crypto');
const { Redis } = require('@upstash/redis');

const MAX_QUEUE_LENGTH = 200;
const QUEUE_TTL_SECONDS = 60 * 60 * 24 * 7;

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const toCleanString = (value) => String(value || '').trim();

const normalizeChannel = (value) => {
  const cleaned = toCleanString(value).replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 64);
  return cleaned || 'default';
};

const getRedisClient = () => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  return new Redis({ url, token });
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': event.headers?.origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' }, { Allow: 'GET, POST, OPTIONS' });
  }

  const redis = getRedisClient();
  if (!redis) {
    return json(500, { error: 'Server not configured (missing KV/Upstash environment variables)' });
  }

  if (event.httpMethod === 'GET') {
    const channel = normalizeChannel(event.queryStringParameters?.channel);
    const limit = Math.max(1, Math.min(Number(event.queryStringParameters?.limit) || 20, 100));
    const peek = String(event.queryStringParameters?.peek || '').toLowerCase() === '1'
      || String(event.queryStringParameters?.peek || '').toLowerCase() === 'true';
    const key = `aera:commands:${channel}`;

    try {
      if (peek) {
        const list = await redis.lrange(key, 0, limit - 1);
        const commands = (list || []).map((entry) => {
          try {
            return JSON.parse(entry);
          } catch (_err) {
            return null;
          }
        }).filter(Boolean);
        return json(200, { commands, peek: true });
      }

      const multi = redis.multi();
      multi.lrange(key, 0, limit - 1);
      multi.ltrim(key, limit, -1);
      const [list] = await multi.exec();

      const commands = (list || []).map((entry) => {
        try {
          return JSON.parse(entry);
        } catch (_err) {
          return null;
        }
      }).filter(Boolean);

      return json(200, { commands });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(500, { error: `KV error: ${message}` });
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_err) {
    return json(400, { error: 'Invalid JSON body' });
  }

  const type = toCleanString(payload.type);
  if (!type) {
    return json(400, { error: 'Command type is required' });
  }

  const channel = normalizeChannel(payload.channel || event.queryStringParameters?.channel);
  const key = `aera:commands:${channel}`;
  const id = typeof randomUUID === 'function'
    ? randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const command = {
    id,
    type,
    payload: payload.payload || {},
    channel,
    createdAt: new Date().toISOString(),
  };

  try {
    const multi = redis.multi();
    multi.rpush(key, JSON.stringify(command));
    multi.ltrim(key, -MAX_QUEUE_LENGTH, -1);
    multi.expire(key, QUEUE_TTL_SECONDS);
    await multi.exec();
    return json(200, { ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: `KV error: ${message}` });
  }
};
