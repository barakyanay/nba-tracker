# Rip City Tracker

A client-side NBA analytics dashboard focused on Deni Avdija, the Portland Trail Blazers, and league-wide game coverage. Its match center supports Israel-time date navigation, live and final scorecards, full game summaries, sortable box scores, team comparisons, play-by-play, and injury reports. Standings include a combined league power view, playoff zones, a Portland what-if simulator, and a 30-team scoring/defense chart. A persistent Deni quick-track dock, game trends, highlights, sharing tools, leaders, and history feed round out the workspace.

The frontend is a static React/Vite app that requests public ESPN JSON endpoints directly from the browser; it does not require the Python backend.
The interface uses a Midnight Slate color palette, Heebo and Plus Jakarta Sans typography, and shared ESPN logo/headshot components with initials fallbacks.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

ESPN’s public endpoints may throttle requests or be temporarily unavailable. The app uses sample/off-day states where appropriate and explains when individual game details have not been published.

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
