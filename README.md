# AERA

AERA is a React-based smart mirror interface with:
- Face unlock (TensorFlow.js + BlazeFace)
- Live camera feed
- System audio activity orb
- Weather and ambient light indicators

## Local Run

```bash
npm install
npm start
```

## Production Build

```bash
npm run build
```

Build output is generated in `build/`.

## Free Online Hosting (Netlify)

This project is already configured for Netlify with:
- `netlify.toml` (build and publish settings)
- `public/_redirects` (SPA fallback)
- `.env.production` (`GENERATE_SOURCEMAP=false` for cleaner builds)

### Deploy Steps

1. Push this repo to GitHub.
2. Sign in to Netlify and click **Add new site** -> **Import an existing project**.
3. Select your GitHub repository.
4. Netlify will auto-detect settings from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `build`
5. Click **Deploy site**.

After deploy, Netlify gives you an HTTPS URL (required for camera APIs).

## Important Browser Requirements

- Camera + microphone access need HTTPS (Netlify provides this by default).
- AERA no longer uses screen/window capture (`getDisplayMedia`), so the screen-share picker will not appear.
- For best compatibility, run in the latest Chromium-based browser.

## Voice Assistant (Deployed)

AERA includes an always-listening, Siri-like voice loop:
- Speech-to-text: **Groq Whisper** via `netlify/functions/transcribe.js`
- LLM: Groq chat completions via `netlify/functions/chat.js`
- Text-to-speech: browser `speechSynthesis` (auto-picks the best available English voice)

### Netlify env vars (server-side)

Set these in Netlify → Site settings → Environment variables:
- `GROQ_API_KEY` (required)
- `GROQ_MODEL` (optional, default: `llama-3.1-8b-instant`)
- `GROQ_STT_MODEL` (optional, default: `whisper-large-v3`)
- `GROQ_STT_LANGUAGE` (optional, default: `en`)
- `GROQ_STT_TEMPERATURE` (optional, default: `0`)
- `GROQ_BASE_URL` (optional, default: `https://api.groq.com/openai/v1`)

### Frontend env vars (build-time)

These are **REACT_APP_** build variables:
- `REACT_APP_WAKE_WORD` (default wake word is `aera`; set to `off` to disable)
- `REACT_APP_VOICE_DEBUG=true` to show a small on-screen voice status overlay + last transcript
- `REACT_APP_DASHBOARD_AUDIO=true` (optional) to let the dashboard request its own mic stream (not recommended; can fight VoiceAgent for mic access)

## Raspberry Pi Kiosk

### 1) On the Pi, clone/open this repo

```bash
cd ~/aera
```

### 2) Create a clickable desktop launcher

```bash
chmod +x pi/kiosk/install-desktop-shortcut.sh
./pi/kiosk/install-desktop-shortcut.sh "https://aerasmartmirror.netlify.app/"
```

This installs helper tools and creates:
- `~/Desktop/AERA Kiosk.desktop`

### Manual start

```bash
bash ~/aera/pi/kiosk/start-aera-kiosk.sh
```
