#!/usr/bin/env node
import readline from 'readline';

const endpoint = (process.env.AERA_COMMANDS_ENDPOINT || '').trim();
if (!endpoint) {
  console.error('Missing AERA_COMMANDS_ENDPOINT (e.g. https://your-app.vercel.app/api/commands).');
  process.exit(1);
}

const channel = (process.env.AERA_COMMANDS_CHANNEL || 'default').trim() || 'default';

const send = async (type) => {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, channel }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Command failed (${res.status})`);
  }
  return data;
};

console.log('AERA Control CLI');
console.log('Press 1, 2, 3 to trigger script lines. Press q to quit.');

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', async (str, key) => {
  if (key?.name === 'q' || (key?.ctrl && key?.name === 'c')) {
    process.exit(0);
  }
  try {
    if (str === '1') {
      await send('script-1');
      console.log('Sent script-1');
    } else if (str === '2') {
      await send('script-2');
      console.log('Sent script-2');
    } else if (str === '3') {
      await send('script-intro');
      console.log('Sent script-intro');
    }
  } catch (err) {
    console.error(err?.message || err);
  }
});
