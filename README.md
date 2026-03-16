# AERA

AERA is a React-based smart mirror interface with:
- Face unlock (TensorFlow.js + BlazeFace)
- Live camera feed
- System audio activity orb
- Weather and ambient light indicators
- Remote script audio playback (MP3)

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
- `GENERATE_SOURCEMAP=false` set in your host (cleaner builds; don’t commit secrets)

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

- Camera access needs HTTPS (Netlify provides this by default).
- AERA no longer uses screen/window capture (`getDisplayMedia`), so the screen-share picker will not appear.
- For best compatibility, run in the latest Chromium-based browser.
- Audio playback requires a user gesture: click/tap the mirror once after load.

## Remote Script Audio (Deployed)

The mirror plays pre-recorded MP3 lines when you send remote commands.

### Audio Files

Place these files in `public/audio/`:
- `script-1.mp3`
- `script-2.mp3`
- `script-3.mp3`

### Remote Control (Browser)

Open `/control` and press:
- `1` → play `script-1.mp3`
- `2` → play `script-2.mp3`
- `3` → play `script-3.mp3`

### Remote Control (Server)

Commands are stored in Redis (Vercel KV / Upstash). Set these env vars on your host:
- `KV_REST_API_URL` + `KV_REST_API_TOKEN`
  -or-
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

### Frontend env vars (build-time)

These are **REACT_APP_** build variables:
- `REACT_APP_REMOTE_CONTROL=true`
- `REACT_APP_COMMANDS_ENDPOINT=/api/commands` (Vercel) or `/.netlify/functions/commands` (Netlify)
- `REACT_APP_COMMANDS_CHANNEL=default`
- `REACT_APP_SCRIPT_AUDIO_1=/audio/script-1.mp3`
- `REACT_APP_SCRIPT_AUDIO_2=/audio/script-2.mp3`
- `REACT_APP_SCRIPT_AUDIO_3=/audio/script-3.mp3`
- `REACT_APP_DASHBOARD_AUDIO=false` (optional; set to false to disable the microphone level meter)

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
