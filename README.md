# Rip City Tracker

A dark, Portland Trail Blazers-focused NBA dashboard for Deni Avdija’s season and game stats, Portland’s schedule and roster, and the league scoreboard. The FastAPI backend reads NBA.com Stats through `nba_api` and caches responses in memory.

## Requirements

- Python 3.10+
- Node.js 20.19+ or 22.12+
- npm

NBA.com Stats is an unofficial upstream data source. It may throttle or temporarily block requests; the API returns explicit `503` errors when live data cannot be retrieved.

## Run locally

In one terminal:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The frontend proxies `/api` requests to FastAPI on port `8000`. Interactive API docs are available at `http://localhost:8000/docs`.

To use a different backend address, set `VITE_API_URL` in `frontend/.env.local`.

## API

- `GET /api/health` — service health
- `GET /api/player` — Deni Avdija season averages, last 10 games, and chart series
- `GET /api/player/live` — live game state and box score, or an explicit pre-game/off-day state
- `GET /api/team` — Portland record, standings, roster, recent results, and upcoming games
- `GET /api/league` — today’s scoreboard and conference standings

Live scoreboard and player stats are cached for 30 seconds; season, roster, schedule, and standings data are cached for 15 minutes. Caches are process-local and reset when the backend restarts.
