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
