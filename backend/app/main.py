from __future__ import annotations

import math
import threading
from datetime import date, datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

PORTLAND_ID = 1610612757
DENI_ID = 1630583
LEAGUE_ID = "00"
EASTERN = ZoneInfo("America/New_York")


def _nba_today() -> date:
    return datetime.now(EASTERN).date()


SEASON_START = _nba_today().year if _nba_today().month >= 10 else _nba_today().year - 1
SEASON = f"{SEASON_START}-{(SEASON_START + 1) % 100:02d}"
LIVE_TTL = 30
SEASON_TTL = 15 * 60
SCHEDULE_TTL = 6 * 60 * 60

app = FastAPI(title="Rip City Tracker API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


class MemoryCache:
    def __init__(self) -> None:
        self._values: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get_or_create(self, key: str, ttl: int, factory: Callable[[], Any]) -> Any:
        now = datetime.now().timestamp()
        with self._lock:
            cached = self._values.get(key)
            if cached and cached[0] > now:
                return cached[1]
        value = factory()
        with self._lock:
            self._values[key] = (datetime.now().timestamp() + ttl, value)
        return value


cache = MemoryCache()


def _nba() -> Any:
    try:
        from nba_api.stats import endpoints

        return endpoints
    except ImportError as exc:
        raise RuntimeError("The nba_api package is not installed. Run pip install -r requirements.txt.") from exc


def _records(frame: Any) -> list[dict[str, Any]]:
    return [_clean(row) for row in frame.to_dict("records")]


def _clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(item) for item in value]
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _fetch(operation: Callable[[], Any]) -> Any:
    try:
        return operation()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"NBA.com data is temporarily unavailable: {exc}",
        ) from exc


def _rows(frame: Any) -> list[dict[str, Any]]:
    return _records(frame) if frame is not None else []


def _game_date(value: Any) -> datetime:
    text = str(value or "")
    for pattern in ("%b %d, %Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            continue
    return datetime.min


def _player_payload() -> dict[str, Any]:
    api = _nba()
    dashboard = api.PlayerDashboardByGeneralSplits(
        player_id=DENI_ID,
        season=SEASON,
        per_mode_detailed="PerGame",
    )
    stats_rows = _rows(dashboard.overall_player_dashboard.get_data_frame())
    stats = stats_rows[0] if stats_rows else {}

    log = api.PlayerGameLog(player_id=DENI_ID, season=SEASON)
    game_rows = _rows(log.player_game_log.get_data_frame())
    game_rows.sort(key=lambda row: _game_date(row.get("GAME_DATE")), reverse=True)
    games = game_rows[:10]

    chart = [
        {
            "game": index,
            "date": str(row.get("GAME_DATE", "")),
            "opponent": str(row.get("MATCHUP", "")),
            "points": row.get("PTS"),
            "rebounds": row.get("REB"),
            "assists": row.get("AST"),
            "fgPct": _percent(row.get("FG_PCT")),
            "threePct": _percent(row.get("FG3_PCT")),
            "minutes": _minutes(row.get("MIN")),
        }
        for index, row in enumerate(reversed(game_rows), start=1)
    ]
    return {
        "player": {"id": DENI_ID, "name": "Deni Avdija", "team": "Portland Trail Blazers"},
        "season": SEASON,
        "averages": stats,
        "games": games,
        "trend": chart,
    }


def _percent(value: Any) -> Any:
    return round(value * 100, 1) if isinstance(value, (int, float)) else None


def _minutes(value: Any) -> Any:
    if value is None:
        return None
    try:
        return round(float(str(value).split(":")[0]) + float(str(value).split(":")[1]) / 60, 1)
    except (ValueError, IndexError):
        try:
            return round(float(value), 1)
        except (ValueError, TypeError):
            return None


def _scoreboard(game_date: date) -> list[dict[str, Any]]:
    api = _nba()
    board = api.ScoreboardV2(game_date=game_date.isoformat(), league_id=LEAGUE_ID)
    headers = _rows(board.game_header.get_data_frame())
    lines = _rows(board.line_score.get_data_frame())
    score_by_team: dict[tuple[str, str], Any] = {}
    abbreviation_by_team: dict[str, Any] = {}
    name_by_team: dict[str, str] = {}
    for row in lines:
        team_id = str(row.get("TEAM_ID"))
        score_by_team[(str(row.get("GAME_ID")), team_id)] = row.get("PTS")
        abbreviation_by_team[team_id] = row.get("TEAM_ABBREVIATION")
        name_by_team[team_id] = " ".join(
            str(part) for part in (row.get("TEAM_CITY_NAME"), row.get("TEAM_NAME")) if part
        )
    games = []
    for row in headers:
        game_id = str(row.get("GAME_ID", ""))
        home_id = str(row.get("HOME_TEAM_ID", ""))
        away_id = str(row.get("VISITOR_TEAM_ID", ""))
        games.append(
            {
                "id": game_id,
                "date": row.get("GAME_DATE_EST") or game_date.isoformat(),
                "status": row.get("GAME_STATUS_TEXT", ""),
                "statusCode": row.get("GAME_STATUS_ID"),
                "home": {
                    "id": home_id,
                    "name": name_by_team.get(home_id, ""),
                    "abbreviation": row.get("HOME_TEAM_ABBREVIATION") or abbreviation_by_team.get(home_id, ""),
                    "score": score_by_team.get((game_id, home_id)),
                },
                "away": {
                    "id": away_id,
                    "name": name_by_team.get(away_id, ""),
                    "abbreviation": row.get("VISITOR_TEAM_ABBREVIATION") or abbreviation_by_team.get(away_id, ""),
                    "score": score_by_team.get((game_id, away_id)),
                },
            }
        )
    return games


def _cached_scoreboard(game_date: date, ttl: int) -> list[dict[str, Any]]:
    return cache.get_or_create(
        f"scoreboard:{game_date.isoformat()}",
        ttl,
        lambda: _scoreboard(game_date),
    )


def _upcoming_games(limit: int = 5) -> list[dict[str, Any]]:
    upcoming: list[dict[str, Any]] = []
    today = _nba_today()
    for day_offset in range(22):
        game_date = today + timedelta(days=day_offset)
        ttl = LIVE_TTL if day_offset == 0 else SCHEDULE_TTL
        games = _cached_scoreboard(game_date, ttl)
        for game in games:
            home_id = str(game["home"]["id"])
            away_id = str(game["away"]["id"])
            if home_id != str(PORTLAND_ID) and away_id != str(PORTLAND_ID):
                continue
            if int(game.get("statusCode") or 0) == 3:
                continue
            home = home_id == str(PORTLAND_ID)
            opponent = game["away"] if home else game["home"]
            upcoming.append(
                {
                    "GAME_ID": game["id"],
                    "GAME_DATE": game["date"],
                    "GAME_STATUS_TEXT": game["status"],
                    "HOME_TEAM_ID": game["home"]["id"],
                    "HOME_TEAM_NAME": game["home"]["name"],
                    "VISITOR_TEAM_ID": game["away"]["id"],
                    "VISITOR_TEAM_NAME": game["away"]["name"],
                    "OPPONENT_NAME": opponent["name"],
                    "IS_HOME": home,
                }
            )
        if len(upcoming) >= limit:
            break
    upcoming.sort(key=lambda row: str(row.get("GAME_DATE", "")))
    return upcoming[:limit]


def _player_live() -> dict[str, Any]:
    games = _cached_scoreboard(_nba_today(), LIVE_TTL)
    game = next(
        (
            item
            for item in games
            if str(item["home"]["id"]) == str(PORTLAND_ID)
            or str(item["away"]["id"]) == str(PORTLAND_ID)
        ),
        None,
    )
    if not game:
        return {"isLive": False, "game": None, "stats": None, "message": "Portland is not playing today."}
    if int(game.get("statusCode") or 0) != 2:
        return {"isLive": False, "game": game, "stats": None, "message": game.get("status") or "Game has not started."}

    api = _nba()
    box = api.BoxScoreTraditionalV2(game_id=game["id"])
    rows = _rows(box.player_stats.get_data_frame())
    player = next((row for row in rows if str(row.get("PLAYER_ID")) == str(DENI_ID)), None)
    return {
        "isLive": True,
        "game": game,
        "stats": player,
        "message": None if player else "Live box score is not available yet.",
    }


def _league_standings() -> list[dict[str, Any]]:
    api = _nba()
    endpoint = api.LeagueStandings(season=SEASON, league_id=LEAGUE_ID)
    frame = endpoint.standings.get_data_frame()
    rows = _rows(frame)
    rows.sort(key=lambda row: (str(row.get("Conference", "")), int(row.get("PlayoffRank") or 99)))
    return rows


def _team_payload() -> dict[str, Any]:
    api = _nba()
    standings = _league_standings()
    team_row = next((row for row in standings if str(row.get("TeamID")) == str(PORTLAND_ID)), {})

    roster_endpoint = api.CommonTeamRoster(team_id=PORTLAND_ID, season=SEASON)
    roster = _rows(roster_endpoint.common_team_roster.get_data_frame())
    stats_endpoint = api.LeagueDashPlayerStats(
        season=SEASON,
        team_id_nullable=PORTLAND_ID,
        per_mode_detailed="PerGame",
    )
    player_stats = _rows(stats_endpoint.league_dash_player_stats.get_data_frame())
    stats_by_id = {str(row.get("PLAYER_ID")): row for row in player_stats}
    for player in roster:
        stats = stats_by_id.get(str(player.get("PLAYER_ID")), {})
        player["PTS"] = stats.get("PTS")
        player["REB"] = stats.get("REB")
        player["AST"] = stats.get("AST")
        player["MIN"] = stats.get("MIN")

    log_endpoint = api.TeamGameLog(team_id=PORTLAND_ID, season=SEASON)
    log = _rows(log_endpoint.team_game_log.get_data_frame())
    log.sort(key=lambda row: _game_date(row.get("GAME_DATE")), reverse=True)
    recent = log[:5]

    upcoming = _upcoming_games()

    return {
        "team": {"id": PORTLAND_ID, "name": "Portland Trail Blazers", "abbreviation": "POR"},
        "season": SEASON,
        "record": {
            "wins": team_row.get("WINS"),
            "losses": team_row.get("LOSSES"),
            "conference": team_row.get("Conference"),
            "rank": team_row.get("PlayoffRank"),
            "streak": team_row.get("strCurrentStreak") or team_row.get("CurrentStreak"),
            "streakType": team_row.get("strCurrentStreak"),
        },
        "roster": roster,
        "recent": recent,
        "upcoming": upcoming[:5],
    }


def _league_payload() -> dict[str, Any]:
    return {
        "date": _nba_today().isoformat(),
        "games": _cached_scoreboard(_nba_today(), LIVE_TTL),
        "standings": cache.get_or_create("standings", SEASON_TTL, _league_standings),
    }


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/player")
async def player() -> dict[str, Any]:
    return await run_in_threadpool(
        lambda: _fetch(lambda: cache.get_or_create("player", SEASON_TTL, _player_payload))
    )


@app.get("/api/player/live")
async def player_live() -> dict[str, Any]:
    return await run_in_threadpool(
        lambda: _fetch(lambda: cache.get_or_create("player-live", LIVE_TTL, _player_live))
    )


@app.get("/api/team")
async def team() -> dict[str, Any]:
    return await run_in_threadpool(
        lambda: _fetch(lambda: cache.get_or_create("team", SEASON_TTL, _team_payload))
    )


@app.get("/api/league")
async def league() -> dict[str, Any]:
    return await run_in_threadpool(
        lambda: _fetch(lambda: cache.get_or_create("league", LIVE_TTL, _league_payload))
    )
