const { randomUUID } = require('crypto');
const { Redis } = require('@upstash/redis');

const MAX_QUEUE_LENGTH = 200;
const QUEUE_TTL_SECONDS = 60 * 60 * 24 * 7;

const toCleanString = (value) => String(value || '').trim();

const normalizeChannel = (value) => {
  const cleaned = toCleanString(value).replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 64);
  return cleaned || 'default';
};

const json = (res, statusCode, body, extraHeaders = {}) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(extraHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.end(JSON.stringify(body));
};

const withCors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers?.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const getRedisClient = () => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  return new Redis({ url, token });
};

module.exports = async (req, res) => {
  withCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end('');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    json(res, 405, { error: 'Method Not Allowed' }, { Allow: 'GET, POST, OPTIONS' });
    return;
  }

  const redis = getRedisClient();
  if (!redis) {
    json(res, 500, {
      error: 'Server not configured (missing KV/Upstash environment variables)',
    });
    return;
  }

  if (req.method === 'GET') {
    const channel = normalizeChannel(req.query?.channel);
    const limit = Math.max(1, Math.min(Number(req.query?.limit) || 20, 100));
    const peek = String(req.query?.peek || '').toLowerCase() === '1'
      || String(req.query?.peek || '').toLowerCase() === 'true';
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
        json(res, 200, { commands, peek: true });
        return;
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

      json(res, 200, { commands });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: `KV error: ${message}` });
      return;
    }
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_err) {
      payload = null;
    }
  }
  if (!payload || typeof payload !== 'object') {
    json(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const type = toCleanString(payload.type);
  if (!type) {
    json(res, 400, { error: 'Command type is required' });
    return;
  }

  const channel = normalizeChannel(payload.channel || req.query?.channel);
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
    json(res, 200, { ok: true, id });
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 500, { error: `KV error: ${message}` });
    return;
  }
};
