# Rip City Tracker

A dark, Portland Trail Blazers-focused NBA dashboard for Deni Avdija’s season and game stats, Portland’s schedule and roster, and the league scoreboard. The frontend is a static React/Vite app that requests public ESPN JSON endpoints directly from the browser; it does not require the Python backend.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

ESPN’s public endpoints may throttle requests or be temporarily unavailable. The app shows explicit fallback states when live data cannot be loaded.

## Run locally

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). No backend server or API key is needed.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the frontend and publishes `frontend/dist` whenever changes are pushed to `main`. In the repository’s **Settings → Pages**, select **GitHub Actions** as the deployment source.

Vite uses a relative asset base so the built site works under a repository subpath. Season statistics use ESPN’s public season-statistics endpoint; scoreboards, schedules, and game box scores use ESPN’s public site API. Successful browser responses are cached in memory to reduce repeat requests.
