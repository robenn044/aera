#!/usr/bin/env node

/**
 * AERA Script Mode CLI
 * 
 * Run this script locally to trigger Aera's Albanian voice responses.
 * 
 * Usage:
 *   node scripts/aera-script-cli.js
 * 
 * Then press:
 *   1 - Response to "Aera, sa është ora?" (What time is it?)
 *   2 - Response to "Si është moti sot?" (How's the weather today?)
 *   3 - Aera self-introduction in Albanian
 *   q - Quit
 * 
 * Requirements:
 *   - Node.js 18+
 *   - Internet connection (uses Google TTS API)
 *   - Audio playback capability (mpv, afplay, or aplay)
 */

import readline from 'readline';
import https from 'https';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

// Albanian responses
const getTimeResponse = () => {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  const albanianNumbers = {
    0: 'zero', 1: 'një', 2: 'dy', 3: 'tre', 4: 'katër', 5: 'pesë',
    6: 'gjashtë', 7: 'shtatë', 8: 'tetë', 9: 'nëntë', 10: 'dhjetë',
    11: 'njëmbëdhjetë', 12: 'dymbëdhjetë', 13: 'trembëdhjetë',
    14: 'katërmbëdhjetë', 15: 'pesëmbëdhjetë', 16: 'gjashtëmbëdhjetë',
    17: 'shtatëmbëdhjetë', 18: 'tetëmbëdhjetë', 19: 'nëntëmbëdhjetë',
    20: 'njëzet', 21: 'njëzet e një', 22: 'njëzet e dy', 23: 'njëzet e tre',
    24: 'njëzet e katër', 25: 'njëzet e pesë', 26: 'njëzet e gjashtë',
    27: 'njëzet e shtatë', 28: 'njëzet e tetë', 29: 'njëzet e nëntë',
    30: 'tridhjetë', 31: 'tridhjetë e një', 32: 'tridhjetë e dy',
    33: 'tridhjetë e tre', 34: 'tridhjetë e katër', 35: 'tridhjetë e pesë',
    36: 'tridhjetë e gjashtë', 37: 'tridhjetë e shtatë', 38: 'tridhjetë e tetë',
    39: 'tridhjetë e nëntë', 40: 'dyzet', 41: 'dyzet e një', 42: 'dyzet e dy',
    43: 'dyzet e tre', 44: 'dyzet e katër', 45: 'dyzet e pesë',
    46: 'dyzet e gjashtë', 47: 'dyzet e shtatë', 48: 'dyzet e tetë',
    49: 'dyzet e nëntë', 50: 'pesëdhjetë', 51: 'pesëdhjetë e një',
    52: 'pesëdhjetë e dy', 53: 'pesëdhjetë e tre', 54: 'pesëdhjetë e katër',
    55: 'pesëdhjetë e pesë', 56: 'pesëdhjetë e gjashtë', 57: 'pesëdhjetë e shtatë',
    58: 'pesëdhjetë e tetë', 59: 'pesëdhjetë e nëntë'
  };
  
  const hourWord = albanianNumbers[hours] || hours;
  const minuteWord = albanianNumbers[minutes] || minutes;
  
  if (minutes === 0) {
    return `Ora është ${hourWord}.`;
  }
  return `Ora është ${hourWord} e ${minuteWord} minuta.`;
};

const RESPONSES = {
  '1': getTimeResponse,
  '2': () => "Sot moti është i kthjellët me diell, temperatura është njëzet e pesë gradë celsius. Është një ditë e bukur për të dalë jashtë.",
  '3': () => `Përshëndetje! Unë jam Aera, asistenti juaj personal inteligjent. Unë jam këtu për t'ju ndihmuar në jetën e përditshme duke ju dhënë informacione të dobishme si ora, moti, dhe kalendari juaj. Me mua, ju mund të planifikoni ditën tuaj më lehtë dhe të qëndroni të informuar në çdo moment. Qëllimi im është të bëj jetën tuaj më të thjeshtë, më të organizuar dhe më efikase. Ju faleminderit që më zgjodhët si asistentin tuaj!`
};

const LABELS = {
  '1': 'Përgjigje: "Aera, sa është ora?"',
  '2': 'Përgjigje: "Si është moti sot?"',
  '3': 'Vetë-prezantimi i Aerës'
};

// Google Translate TTS URL (unofficial but free)
const getTTSUrl = (text, lang = 'sq') => {
  const encodedText = encodeURIComponent(text);
  return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;
};

// Download audio file
const downloadAudio = (url) => {
  return new Promise((resolve, reject) => {
    const tempFile = join(tmpdir(), `aera-tts-${Date.now()}.mp3`);
    
    const makeRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const parsedUrl = new URL(requestUrl);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      https.get(options, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          makeRequest(response.headers.location, redirectCount + 1);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          writeFileSync(tempFile, buffer);
          resolve(tempFile);
        });
        response.on('error', reject);
      }).on('error', reject);
    };

    makeRequest(url);
  });
};

// Find available audio player
const findAudioPlayer = () => {
  const players = [
    { cmd: 'mpv', args: ['--no-video', '--really-quiet'] },
    { cmd: 'afplay', args: [] }, // macOS
    { cmd: 'aplay', args: [] }, // Linux ALSA
    { cmd: 'paplay', args: [] }, // PulseAudio
    { cmd: 'play', args: [] }, // SoX
  ];

  for (const player of players) {
    try {
      const result = spawn('which', [player.cmd], { stdio: 'pipe' });
      // We can't really check synchronously, so we'll try them in order
      return player;
    } catch {
      continue;
    }
  }
  
  // Default to mpv
  return players[0];
};

// Play audio file
const playAudio = (filePath) => {
  return new Promise((resolve, reject) => {
    const player = findAudioPlayer();
    const args = [...player.args, filePath];
    
    console.log(`\x1b[90mPlaying with ${player.cmd}...\x1b[0m`);
    
    const proc = spawn(player.cmd, args, { stdio: 'inherit' });
    
    proc.on('close', (code) => {
      // Clean up temp file
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch {}
      
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Player exited with code ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to start player: ${err.message}\nInstall mpv: brew install mpv (macOS) or apt install mpv (Linux)`));
    });
  });
};

// Speak text in Albanian
const speak = async (text) => {
  console.log(`\n\x1b[36m📢 Duke folur / Speaking:\x1b[0m`);
  console.log(`\x1b[33m"${text}"\x1b[0m\n`);
  
  try {
    const url = getTTSUrl(text, 'sq');
    const audioFile = await downloadAudio(url);
    await playAudio(audioFile);
    console.log('\x1b[32m✓ Përfundoi / Done\x1b[0m\n');
  } catch (error) {
    console.error(`\x1b[31m✗ Error: ${error.message}\x1b[0m`);
    console.log('\x1b[90mFallback: Copy the text and use a TTS service manually.\x1b[0m\n');
  }
};

// Main CLI
const main = () => {
  console.clear();
  console.log('\x1b[35m╔═══════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[35m║\x1b[0m                    \x1b[1m\x1b[36mAERA Script Mode\x1b[0m                       \x1b[35m║\x1b[0m');
  console.log('\x1b[35m║\x1b[0m              Modaliteti i Skriptës në Shqip               \x1b[35m║\x1b[0m');
  console.log('\x1b[35m╚═══════════════════════════════════════════════════════════╝\x1b[0m\n');
  
  console.log('\x1b[1mShtypni një tast / Press a key:\x1b[0m\n');
  console.log('  \x1b[36m[1]\x1b[0m ' + LABELS['1']);
  console.log('  \x1b[36m[2]\x1b[0m ' + LABELS['2']);
  console.log('  \x1b[36m[3]\x1b[0m ' + LABELS['3']);
  console.log('  \x1b[90m[q]\x1b[0m Dil / Quit\n');
  console.log('\x1b[90m─────────────────────────────────────────────────────────────\x1b[0m\n');

  // Setup raw mode for single key presses
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', async (str, key) => {
    if (key.ctrl && key.name === 'c') {
      console.log('\n\x1b[90mMirupafshim! / Goodbye!\x1b[0m\n');
      process.exit();
    }

    if (str === 'q' || str === 'Q') {
      console.log('\n\x1b[90mMirupafshim! / Goodbye!\x1b[0m\n');
      process.exit();
    }

    if (RESPONSES[str]) {
      console.log(`\x1b[35m▶ Tasti ${str}: ${LABELS[str]}\x1b[0m`);
      const text = RESPONSES[str]();
      await speak(text);
    }
  });

  process.stdin.resume();
};

main();
