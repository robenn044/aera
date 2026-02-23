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

- Camera and display capture need HTTPS (Netlify provides this by default).
- System audio sharing depends on browser support and user permission.
- For best compatibility, run in the latest Chromium-based browser.

## Raspberry Pi Kiosk + Hidden ChatGPT Voice Tab

This setup opens:
- Tab 1: AERA (visible kiosk screen)
- Tab 2: ChatGPT (background tab for voice conversation audio)

### 1) On the Pi, clone/open this repo

```bash
cd ~/aera
```

### 2) Create a clickable desktop launcher

```bash
chmod +x pi/kiosk/install-desktop-shortcut.sh
./pi/kiosk/install-desktop-shortcut.sh "https://aerasmartmirror.netlify.app/" "https://chatgpt.com/"
```

This installs helper tools and creates:
- `~/Desktop/AERA Kiosk.desktop`

### 3) Launch from Desktop

Double-click `AERA Kiosk` on Desktop.

### 4) One-time ChatGPT preparation

1. Switch to ChatGPT tab (`Ctrl+2`).
2. Sign in to ChatGPT.
3. Start Voice mode.
4. Return to AERA (`Ctrl+1`).

Now AERA stays visible while ChatGPT runs in the background tab.

### Notes

- Background tabs can be throttled by browser policies; if voice pauses, briefly switch to tab 2 and back.
- If kiosk ever fails, run manually:

```bash
bash ~/aera/pi/kiosk/start-aera-kiosk.sh
```
