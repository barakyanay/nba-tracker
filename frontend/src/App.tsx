import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Clock3,
  Flame,
  Info,
  Radio,
  RefreshCw,
  Shield,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'
import {
  FALLBACK_LEAGUE,
  FALLBACK_LIVE,
  FALLBACK_INSIGHTS,
  FALLBACK_PLAYER,
  FALLBACK_TEAM,
  latestPlayerGame,
  loadInsights,
  loadLeagueData,
  loadLiveData,
  loadPlayerData,
  loadTeamData,
  type ApiResult,
  type InsightsPayload,
  type LeaguePayload,
  type LivePayload,
  type PlayerPayload,
  type Row,
  type ScoreGame,
  type TeamPayload,
} from './data'
import { DeniShareCard, GameHighlightLink, HighlightsHub } from './MediaHub'
import { HistoryFeed, LeagueLeadersHub, WeeklyDigestModal, weeklyDigestKey, weeklyStandingsKey } from './InsightsHub'
import {
  Area,
  Bar,
  ComposedChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type View = 'command' | 'deepdive' | 'leaders' | 'history'

const YEAR = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric' }).format(new Date()))
const MONTH = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', month: 'numeric' }).format(new Date()))
const SEASON_START = MONTH >= 10 ? YEAR : YEAR - 1
const NBA_SEASON = `${SEASON_START}—${String(SEASON_START + 1).slice(-2)}`

function useApi<T>(loader: () => Promise<ApiResult<T>>, fallback: T, enabled: boolean) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await loader()
      setData(result.data)
      setError(result.error)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load NBA data.')
      setData(fallback)
    } finally {
      setLoading(false)
    }
  }, [fallback, loader])

  useEffect(() => {
    if (enabled && data === null) void reload()
  }, [data, enabled, reload])

  return { data, loading, error, reload }
}

function number(value: unknown, digits = 1): string {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : String(value)
}

function pct(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : '—'
}

function ordinal(value: number): string {
  const remainder = value % 100
  const suffix = remainder >= 11 && remainder <= 13
    ? 'TH'
    : value % 10 === 1
      ? 'ST'
      : value % 10 === 2
        ? 'ND'
        : value % 10 === 3
          ? 'RD'
          : 'TH'
  return `${value}${suffix}`
}

function dateLabel(value: unknown, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—'
  const text = String(value)
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12))
    : new Date(text)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-US', {
    ...(options ?? { month: 'short', day: 'numeric' }),
    timeZone: dateOnly ? 'UTC' : 'America/Los_Angeles',
  }).format(date)
}

function StatCard({ label, value, suffix, icon: Icon, accent = false }: {
  label: string
  value: string
  suffix?: string
  icon: LucideIcon
  accent?: boolean
}) {
  return (
    <article className={`stat-card ${accent ? 'stat-card-accent' : ''}`}>
      <div className="stat-top"><span>{label}</span><Icon size={16} strokeWidth={1.8} /></div>
      <div className="stat-value">{value}<small>{suffix}</small></div>
      <div className="stat-foot"><span className="stat-dot" /> SEASON AVERAGE</div>
    </article>
  )
}

function SectionTitle({ kicker, title, action }: { kicker: string; title: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <div><p className="eyebrow">{kicker}</p><h2>{title}</h2></div>
      {action}
    </div>
  )
}

function LoadError({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  return (
    <div className="empty-state">
      <CircleHelp size={19} />
      <div>
        <strong>{loading ? 'Connecting to ESPN' : 'Some data unavailable'}</strong>
        <p>{loading ? 'Fetching the latest stats. This can take a few seconds.' : error}</p>
        {!loading && <button className="text-button" onClick={onRetry}>Try again <RefreshCw size={13} /></button>}
      </div>
    </div>
  )
}

function ScoreGameCard({ game }: { game: ScoreGame }) {
  return (
    <article className="score-game">
      <div className="game-status"><span className={game.statusCode === 2 ? 'live-dot' : 'status-dot'} />{game.status || 'Scheduled'}</div>
      {[game.away, game.home].map((team, index) => (
        <div className={`score-team ${index === 0 ? 'score-team-first' : ''}`} key={team.id}>
          <div className={`team-mark ${team.abbreviation === 'POR' ? 'team-mark-red' : ''}`}>{team.abbreviation || 'NBA'}</div>
          <span>{team.name || team.abbreviation}</span>
          <strong>{team.score ?? '—'}</strong>
        </div>
      ))}
    </article>
  )
}

function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const remaining = Math.max(0, Date.parse(target) - now)
  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  return <strong className="ticker-countdown">{hours}h {String(minutes).padStart(2, '0')}m {String(seconds).padStart(2, '0')}s</strong>
}

function LiveTicker({ live, team, lastSync, loading, onRefresh, autoRefresh, onToggleAutoRefresh }: {
  live: LivePayload | null
  team: TeamPayload | null
  lastSync: Date | null
  loading: boolean
  onRefresh: () => void
  autoRefresh: boolean
  onToggleAutoRefresh: () => void
}) {
  const nextGame = team?.upcoming.find((game) => Number.isFinite(Date.parse(String(game.TIP_TIMESTAMP))))
  const nextTip = nextGame ? String(nextGame.TIP_TIMESTAMP) : null
  return (
    <aside className="ticker-bar">
      <div className="ticker-main">
        <div className="ticker-connection"><span className="live-dot" /> LIVE <b>•</b> ESPN NBA API</div>
        <span className="ticker-sync">{lastSync ? `SYNC ${new Intl.DateTimeFormat('en-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jerusalem' }).format(lastSync)} IST` : 'WAITING FOR FIRST SYNC'}</span>
        <button className="ticker-refresh" aria-label="Refresh NBA data" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /><span>REFRESH</span></button>
        <label className="ticker-auto"><span>AUTO</span><button aria-label="Toggle automatic refresh" className={`toggle ${autoRefresh ? 'toggle-on' : ''}`} onClick={onToggleAutoRefresh}><i /></button></label>
        <details className="ticker-info">
          <summary aria-label="About live data"><Info size={15} /></summary>
          <div className="ticker-popover">Live scores, schedules and player data are fetched directly in this browser from ESPN’s public NBA JSON endpoints. Availability and timing depend on ESPN.</div>
        </details>
      </div>
      <div className="ticker-game">
        {live?.isLive && live.game ? (
          <>
            <span className="live-now"><i /> PORTLAND LIVE</span>
            <strong>{live.game.away.abbreviation} {live.game.away.score ?? 0} <b>—</b> {live.game.home.score ?? 0} {live.game.home.abbreviation}</strong>
            <span>{live.game.period ? `Q${live.game.period}` : ''} {live.game.clock ?? live.game.status}</span>
          </>
        ) : nextTip && nextGame ? (
          <>
            <span className="ticker-next-label"><Clock3 size={13} /> NEXT TIP · ISRAEL TIME</span>
            <strong>{String(nextGame.OPPONENT_NAME ?? 'PORTLAND')} <span>{nextGame.IS_HOME ? 'HOME' : 'AWAY'}</span></strong>
            <Countdown target={nextTip} />
          </>
        ) : <span className="ticker-next-label"><CalendarDays size={13} /> NO UPCOMING TIP FOUND</span>}
      </div>
      <div className="ticker-refresh-note">{autoRefresh ? `AUTO ${live?.isLive ? '60S' : '5M'}` : 'AUTO OFF'}</div>
    </aside>
  )
}

function statNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function IsraeliTime({ value, weekday = false }: { value: unknown; weekday?: boolean }) {
  if (!value) return <>—</>
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return <>{String(value)}</>
  return <>{new Intl.DateTimeFormat('en-IL', {
    timeZone: 'Asia/Jerusalem',
    ...(weekday ? { weekday: 'short' as const } : { month: 'short' as const, day: 'numeric' as const }),
  }).format(date)}</>
}

function Spotlight({ player, live, team, playerError, liveError, playerLoading, liveLoading, reloadPlayer, reloadLive }: {
  player: PlayerPayload | null
  live: LivePayload | null
  team: TeamPayload | null
  playerError: string
  liveError: string
  playerLoading: boolean
  liveLoading: boolean
  reloadPlayer: () => void
  reloadLive: () => void
}) {
  const [chartMetric, setChartMetric] = useState<'points' | 'rebounds' | 'assists' | 'tsPct' | 'minutes'>('points')
  const [chartStyle, setChartStyle] = useState<'area' | 'bar'>('area')
  const wins = player?.games.filter((game) => game.WL === 'W').length ?? 0
  const losses = player?.games.filter((game) => game.WL === 'L').length ?? 0

  const averages = player?.averages ?? {}
  const stats = [
    { label: 'POINTS', value: number(averages.PTS), icon: Flame, accent: true },
    { label: 'REBOUNDS', value: number(averages.REB), icon: Activity },
    { label: 'ASSISTS', value: number(averages.AST), icon: ArrowUpRight },
    { label: 'STEALS', value: number(averages.STL), icon: Shield },
    { label: 'BLOCKS', value: number(averages.BLK), icon: Shield },
    { label: 'FG%', value: pct(averages.FG_PCT), icon: Activity },
    { label: '3P%', value: pct(averages.FG3_PCT), icon: Activity },
    { label: 'FT%', value: pct(averages.FT_PCT), icon: Activity },
    { label: 'MINUTES', value: number(averages.MIN), icon: Clock3 },
    { label: '+ / −', value: number(averages.PLUS_MINUS), icon: ArrowUpRight },
    { label: 'TRUE SHOOTING', value: pct(averages.TS_PCT), icon: Activity },
    { label: 'AST / TO', value: number(averages.AST_TO), icon: ArrowUpRight },
  ]

  return (
    <>
      <section className="player-hero">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="live-dot" /> PLAYER SPOTLIGHT <span className="hero-season">{player?.season ?? 'NBA SEASON'}</span></div>
          <h1>Deni <span>Avdija</span></h1>
          <p>Portland Trail Blazers <i /> Forward <i /> #8</p>
          <div className="hero-note">All-around impact. Every night.</div>
        </div>
        <div className="hero-number">8</div>
        <div className="hero-watermark">RIP CITY</div>
        <div className="hero-bottom">
          <span><span className="live-dot" /> PORTLAND, OREGON</span>
          <span>{player?.season?.replace('-', '—') ?? NBA_SEASON} SEASON TRACKER</span>
        </div>
      </section>

      <SectionTitle kicker="The numbers" title="Season averages" action={<span className="muted-label">PER GAME <ChevronRight size={14} /></span>} />
      {playerError && <LoadError loading={playerLoading} error={playerError} onRetry={reloadPlayer} />}
      {playerLoading && !player && <div className="loading-line" />}
      <div className="stats-grid">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      <section className="live-panel">
        <div className="live-panel-heading">
          <div className="live-title"><span className="live-icon"><Radio size={17} /></span><div><p className="eyebrow">On the floor</p><h2>Live game tracker</h2></div></div>
          <div className="live-controls">
            <button className="icon-button" aria-label="Refresh live stats" onClick={() => void reloadLive()}><RefreshCw size={15} className={liveLoading ? 'spin' : ''} /></button>
          </div>
        </div>
        {liveError ? <LoadError loading={liveLoading} error={liveError} onRetry={reloadLive} /> : liveLoading && !live ? <div className="loading-line" /> : live?.isLive && live.game ? (
          <div className="live-content">
            <div className="live-matchup">
              <span className="live-now"><i /> LIVE NOW</span>
              <div className="live-score"><span>{live.game.away.abbreviation}</span><b>{live.game.away.score ?? '—'}</b><em>:</em><b>{live.game.home.score ?? '—'}</b><span>{live.game.home.abbreviation}</span></div>
              <p>{live.game.status}</p>
            </div>
            <div className="live-stat-strip">
              {[
                ['PTS', live.stats?.PTS],
                ['REB', live.stats?.REB],
                ['AST', live.stats?.AST],
                ['STL', live.stats?.STL],
                ['BLK', live.stats?.BLK],
                ['MIN', live.stats?.MIN],
                ['FG', `${live.stats?.FGM ?? '—'}-${live.stats?.FGA ?? '—'}`],
                ['3P', `${live.stats?.FG3M ?? '—'}-${live.stats?.FG3A ?? '—'}`],
                ['+/-', live.stats?.PLUS_MINUS],
              ].map(([label, value]) => <div key={String(label)}><span>{label}</span><b>{number(value)}</b></div>)}
            </div>
          </div>
        ) : (
          <div className="offday"><div className="offday-icon"><CalendarDays size={18} /></div><div><strong>{live?.game?.statusCode === 3 ? 'Portland’s game is final' : live?.game ? 'Tip-off is coming' : 'No game on the schedule today'}</strong><p>{live?.message ?? 'Deni’s live box score will appear here when Portland takes the court.'}</p></div><span className="offday-date">{dateLabel(new Date(), { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
        )}
        <div className="live-foot"><span><span className="stat-dot" /> DATA FROM ESPN</span><span>AUTO 60 SEC LIVE · 5 MIN OTHERWISE</span></div>
      </section>

      <div className="content-grid charts-grid">
        <section className="surface chart-card">
          <div className="chart-heading"><div><p className="eyebrow">Last {player?.games.length ?? 15} games</p><h2>Performance trend</h2></div><div className="segmented"><button className={chartStyle === 'area' ? 'selected' : ''} onClick={() => setChartStyle('area')}>Area</button><button className={chartStyle === 'bar' ? 'selected' : ''} onClick={() => setChartStyle('bar')}>Bars</button></div></div>
          <div className="chart-options">
            {([['points', 'PTS'], ['rebounds', 'REB'], ['assists', 'AST'], ['tsPct', 'TS%'], ['minutes', 'MIN']] as const).map(([metric, label]) => <button key={metric} className={chartMetric === metric ? 'metric-selected' : ''} onClick={() => setChartMetric(metric)}>{label}</button>)}
          </div>
          {player?.trend.length ? <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={player.trend} margin={{ top: 14, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#282b31" vertical={false} />
                <XAxis dataKey="game" tickLine={false} axisLine={false} tick={{ fill: '#777c86', fontSize: 10 }} tickFormatter={(value) => `G${value}`} minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#777c86', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#17191f', border: '1px solid #30333b', borderRadius: 8, color: '#f5f5f5' }} labelFormatter={(value, items) => items[0]?.payload?.date ?? `Game ${value}`} />
                {chartStyle === 'area'
                  ? <Area type="monotone" dataKey={chartMetric} name={chartMetric} stroke="#e03a3e" fill="#e03a3e" fillOpacity={0.16} strokeWidth={2.4} activeDot={{ r: 5 }} />
                  : <Bar dataKey={chartMetric} name={chartMetric} fill="#e03a3e" radius={[3, 3, 0, 0]} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div> : <div className="chart-empty">{playerLoading ? 'Loading the season game log…' : playerError ? 'Season trend is unavailable while ESPN data is offline.' : 'Season trend will appear when games are available.'}</div>}
          <div className="chart-legend"><span><i className="legend-red" />{chartMetric === 'tsPct' ? 'TRUE SHOOTING %' : chartMetric === 'minutes' ? 'MINUTES' : chartMetric.toUpperCase()}</span></div>
          <div className="split-summary"><span><b className="positive">{wins} W</b><small>LAST 15</small></span><i /><span><b className="negative">{losses} L</b><small>RESULTS SPLIT</small></span><i /><span><b>{player?.games.length ?? 0}</b><small>GAMES LOGGED</small></span></div>
        </section>
        <section className="surface efficiency-card">
          <p className="eyebrow">Efficiency snapshot</p><h2>Shot profile</h2>
          <div className="efficiency-main"><div className="efficiency-ring" style={{ background: `conic-gradient(var(--red) 0% ${Number.isFinite(Number(averages.FG_PCT)) ? Number(averages.FG_PCT) * 100 : 0}%, #26282e 0% 100%)` }}><div><strong>{pct(averages.FG_PCT)}</strong><span>FIELD GOAL</span></div></div><div className="efficiency-rows"><div><span>3-point</span><b>{pct(averages.FG3_PCT)}</b></div><div><span>Free throw</span><b>{pct(averages.FT_PCT)}</b></div><div><span>Minutes</span><b>{number(averages.MIN)}<small> MPG</small></b></div></div></div>
          <div className="efficiency-callout"><span className="callout-bar" /><p>Three levels. One tough cover.<br /><b>Making an impact in Rip City.</b></p><ArrowUpRight size={16} /></div>
        </section>
      </div>

      <PlayerComparison roster={team?.roster ?? []} playerStats={averages} loading={team?.roster.length === 0} />
      <section className="surface table-section">
        <SectionTitle kicker="The last 15" title="Game log" action={<><span className="muted-label">{player?.season?.replace('-', '—') ?? NBA_SEASON} REGULAR SEASON</span>{player && <DeniShareCard player={player} />}</>} />
        {playerError ? <LoadError loading={playerLoading} error={playerError} onRetry={reloadPlayer} /> : playerLoading && !player ? <div className="loading-line" /> : (
          <div className="table-scroll"><table><thead><tr><th>DATE</th><th>MATCHUP</th><th>RESULT</th><th>MIN</th><th>PTS</th><th>REB</th><th>OREB</th><th>DREB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3PT</th><th>FT</th><th>TO</th><th>PF</th><th>+/-</th><th>VIDEO</th></tr></thead><tbody>
            {(player?.games ?? []).map((game, index) => <tr key={`${game.GAME_ID ?? game.GAME_DATE}-${index}`}><td>{dateLabel(game.GAME_DATE)}</td><td className="matchup-cell">{game.MATCHUP ?? '—'}</td><td><span className={`result-pill ${game.WL === 'W' ? 'win' : 'loss'}`}>{game.WL ?? '—'}</span></td><td>{number(game.MIN)}</td><td className="strong-cell">{number(game.PTS, 0)}</td><td>{number(game.REB, 0)}</td><td>{number(game.OREB, 0)}</td><td>{number(game.DREB, 0)}</td><td>{number(game.AST, 0)}</td><td>{number(game.STL, 0)}</td><td>{number(game.BLK, 0)}</td><td>{game.FGM ?? '—'}-{game.FGA ?? '—'}</td><td>{game.FG3M ?? '—'}-{game.FG3A ?? '—'}</td><td>{game.FTM ?? '—'}-{game.FTA ?? '—'}</td><td>{number(game.TOV, 0)}</td><td>{number(game.PF, 0)}</td><td className={Number(game.PLUS_MINUS) >= 0 ? 'positive' : 'negative'}>{number(game.PLUS_MINUS, 0)}</td><td><GameHighlightLink game={game} /></td></tr>)}
            {!player?.games.length && <tr><td className="empty-cell" colSpan={18}>No game log is available for this season yet.</td></tr>}
          </tbody></table></div>
        )}
      </section>
    </>
  )
}

function PlayerComparison({ roster, playerStats, loading }: { roster: Row[]; playerStats: Row; loading: boolean }) {
  const teammates = roster
    .filter((player) => String(player.PLAYER_ID) !== '4683021' && !/^deni avdija$/i.test(String(player.PLAYER ?? '')))
    .filter((player, index, list) => list.findIndex((other) => String(other.PLAYER_ID ?? other.PLAYER) === String(player.PLAYER_ID ?? player.PLAYER)) === index)
  const [selectedId, setSelectedId] = useState('')
  const deni = roster.find((player) => String(player.PLAYER_ID) === '4683021') ?? { PLAYER: 'Deni Avdija', ...playerStats }
  const comparison = teammates.find((player) => String(player.PLAYER_ID) === selectedId) ?? teammates[0]
  useEffect(() => {
    if (comparison && String(comparison.PLAYER_ID) !== selectedId) setSelectedId(String(comparison.PLAYER_ID))
  }, [comparison, selectedId])

  const metrics = [
    { key: 'PTS', label: 'POINTS', cap: 40 },
    { key: 'REB', label: 'REBOUNDS', cap: 15 },
    { key: 'AST', label: 'ASSISTS', cap: 15 },
    { key: 'STL', label: 'STEALS', cap: 3 },
    { key: 'BLK', label: 'BLOCKS', cap: 3 },
    { key: 'FG_PCT', label: 'FG%', cap: 0.7 },
  ]
  const radarData = metrics.map((metric) => ({
    metric: metric.label,
    Deni: Math.min(100, (statNumber(deni?.[metric.key]) / metric.cap) * 100),
    teammate: Math.min(100, (statNumber(comparison?.[metric.key]) / metric.cap) * 100),
  }))

  return (
    <section className="surface comparison-card">
      <div className="section-title"><div><p className="eyebrow">Blazers, side by side</p><h2>Player comparison</h2></div>
        <label className="comparison-select"><span>COMPARE DENI WITH</span><select value={comparison ? String(comparison.PLAYER_ID) : ''} onChange={(event) => setSelectedId(event.target.value)} disabled={!teammates.length}><option value="">Select a teammate</option>{teammates.map((player) => <option key={String(player.PLAYER_ID)} value={String(player.PLAYER_ID)}>{String(player.PLAYER)}</option>)}</select></label>
      </div>
      {loading && !roster.length ? <div className="quiet-empty">Loading Portland player stats…</div> : !comparison ? <div className="quiet-empty">Teammate comparisons are unavailable right now.</div> : (
        <div className="comparison-layout">
          <div className="comparison-players">
            {[{ name: 'Deni Avdija', color: 'var(--red)', stats: deni }, { name: String(comparison.PLAYER), color: '#80a6d9', stats: comparison }].map((player) => (
              <div className="compare-player" key={player.name}>
                <div className="compare-player-title"><span className="compare-dot" style={{ background: player.color }} /><strong>{player.name}</strong><small>PER GAME</small></div>
                {metrics.map((metric) => {
                  const raw = player.stats?.[metric.key]
                  const value = metric.key === 'FG_PCT' ? pct(raw) : number(raw)
                  const width = Math.min(100, (statNumber(raw) / metric.cap) * 100)
                  return <div className="compare-stat" key={metric.key}><span>{metric.label}</span><div className="compare-track"><i style={{ width: `${width}%`, background: player.color }} /></div><b>{value}</b></div>
                })}
              </div>
            ))}
          </div>
          <div className="comparison-radar"><ResponsiveContainer width="100%" height="100%"><RadarChart data={radarData} outerRadius="72%"><PolarGrid stroke="#30343d" /><PolarAngleAxis dataKey="metric" tick={{ fill: '#aeb2bb', fontSize: 9 }} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} /><Radar name="Deni" dataKey="Deni" stroke="#e03a3e" fill="#e03a3e" fillOpacity={0.28} /><Radar name={String(comparison.PLAYER)} dataKey="teammate" stroke="#80a6d9" fill="#80a6d9" fillOpacity={0.16} /></RadarChart></ResponsiveContainer><div className="radar-legend"><span><i className="legend-red" />DENI</span><span><i className="legend-blue" />{String(comparison.PLAYER).toUpperCase()}</span></div></div>
        </div>
      )}
    </section>
  )
}

function TeamHub({ data, loading, error, reload }: { data: TeamPayload | null; loading: boolean; error: string; reload: () => void }) {
  const record = data?.record
  return (
    <>
      <section className="team-hero">
        <div><div className="hero-kicker"><span className="live-dot" /> PORTLAND, OREGON</div><h1>Rip <span>City.</span></h1><p>Portland Trail Blazers <i /> Western Conference</p></div>
        <div className="record-block"><span className="eyebrow">{data?.season?.replace('-', '—') ?? NBA_SEASON} RECORD</span><strong>{record?.wins ?? '—'}<i>—</i>{record?.losses ?? '—'}</strong><span>{record?.conference ?? 'WESTERN CONFERENCE'}{record?.rank ? ` · ${ordinal(record.rank)} IN WEST` : ''}</span></div>
      </section>
      {error && <LoadError loading={loading} error={error} onRetry={reload} />}
      {data?.sample && <p className="insights-note"><Info size={14} /> Portland roster or schedule data is in fallback mode while ESPN reconnects.</p>}
      {loading && !data && <div className="loading-line" />}
      <div className="team-highlights">
        <div className="surface highlight-tile"><div className="highlight-icon"><Trophy size={17} /></div><div><span>CONFERENCE POSITION</span><strong>{record?.rank ? `#${record.rank}` : '—'}</strong><small>{record?.conference ?? 'Western Conference'}</small></div></div>
        <div className="surface highlight-tile"><div className="highlight-icon highlight-red"><Flame size={17} /></div><div><span>RECENT STREAK</span><strong>{record?.streakType || record?.streak || '—'}</strong><small>Current run</small></div></div>
        <div className="surface highlight-tile"><div className="highlight-icon"><Users size={17} /></div><div><span>ACTIVE ROSTER</span><strong>{data?.roster.length ?? '—'}</strong><small>Players on roster</small></div></div>
      </div>
      <div className="content-grid schedule-grid">
        <section className="surface schedule-card"><div className="section-title"><div><p className="eyebrow">What’s next</p><h2>Upcoming schedule</h2></div><CalendarDays size={17} className="title-icon" /></div>
          {data?.upcoming.length ? <div className="schedule-list">{data.upcoming.map((game, index) => {
            const home = String(game.HOME_TEAM_ID) === '22'
            const opponent = home ? game.VISITOR_TEAM_NAME : game.HOME_TEAM_NAME
            return <div className="schedule-row" key={String(game.GAME_ID ?? index)}><div className="schedule-date"><b><IsraeliTime value={game.GAME_DATE} /></b><span><IsraeliTime value={game.GAME_DATE} weekday /></span></div><div className="schedule-opponent"><div className="team-mark">{game.OPPONENT_LOGO ? <img src={String(game.OPPONENT_LOGO)} alt="" /> : String(opponent ?? 'NBA').slice(0, 3).toUpperCase()}</div><div><b>{String(opponent ?? 'Opponent')}</b><span>{home ? 'HOME' : 'AWAY'} <i /> ISRAEL TIME</span></div></div><span className="schedule-time">{String(game.GAME_STATUS_TEXT ?? 'TBD')}</span>{game.IS_ISRAEL_FRIENDLY === true && <span className="israel-friendly">ISRAEL PRIME</span>}<ChevronRight size={15} className="row-chevron" /></div>
          })}</div> : <div className="quiet-empty">{loading ? 'Loading schedule…' : 'Upcoming games will appear here when the season schedule is available.'}</div>}
        </section>
        <section className="surface schedule-card recent-card"><div className="section-title"><div><p className="eyebrow">Last five</p><h2>Recent results</h2></div><Activity size={17} className="title-icon" /></div>
          {data?.recent.length ? <div className="schedule-list">{data.recent.map((game, index) => <div className="schedule-row recent-row" key={`${game.GAME_ID ?? game.GAME_DATE}-${index}`}><div className="schedule-date"><b><IsraeliTime value={game.GAME_DATE} /></b><span><IsraeliTime value={game.GAME_DATE} weekday /></span></div><div className="schedule-opponent"><div className={`team-mark ${game.WL === 'W' ? 'team-mark-red' : ''}`}>{(game.MATCHUP ?? 'NBA').split(' ').pop()?.replace(/[^A-Z]/g, '').slice(0, 3)}</div><div><b>{game.MATCHUP ?? '—'}</b><span>FINAL <i /> {game.PTS ?? '—'}–{game.OPPONENT_PTS ?? '—'}</span></div></div><span className={`result-pill ${game.WL === 'W' ? 'win' : 'loss'}`}>{game.WL ?? '—'}</span></div>)}</div> : <div className="quiet-empty">{loading ? 'Loading recent results…' : 'No completed games yet this season.'}</div>}
        </section>
      </div>
      <section className="surface table-section roster-section"><SectionTitle kicker="Built for the grind" title="The roster" action={<span className="muted-label">{data?.roster.length ?? '—'} PLAYERS <Users size={14} /></span>} />
        {data?.roster.length ? <div className="table-scroll"><table><thead><tr><th>PLAYER</th><th>POS</th><th>HEIGHT</th><th>WEIGHT</th><th>EXP</th><th>PTS</th><th>REB</th><th>AST</th><th>MIN</th></tr></thead><tbody>
          {data.roster.map((player, index) => <tr key={String(player.PLAYER_ID ?? index)}><td className="roster-name"><span className="roster-avatar">{String(player.PLAYER ?? '?').split(' ').map((part) => part[0]).slice(-2).join('')}</span>{String(player.PLAYER ?? 'Player')}</td><td>{String(player.POSITION ?? '—')}</td><td>{String(player.HEIGHT ?? '—')}</td><td>{String(player.WEIGHT ?? '—')}</td><td>{String(player.EXP ?? '—')}</td><td className="strong-cell">{number(player.PTS)}</td><td>{number(player.REB)}</td><td>{number(player.AST)}</td><td>{number(player.MIN)}</td></tr>)}
        </tbody></table></div> : !loading && !error ? <div className="quiet-empty">Roster data is not available right now.</div> : null}
      </section>
    </>
  )
}

function StandingsTable({ rows, conference }: { rows: Row[]; conference: string }) {
  const filtered = rows.filter((team) => String(team.Conference ?? '').toLowerCase().includes(conference.toLowerCase()))
  return <div className="table-scroll standings-scroll"><table><thead><tr><th>#</th><th>TEAM</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>STREAK</th></tr></thead><tbody>
    {filtered.map((team, index) => {
      const seed = Number(team.PlayoffRank ?? index + 1)
      const zone = seed <= 6 ? 'playoff-zone' : seed <= 10 ? 'playin-zone' : ''
      return <tr className={`${zone} ${String(team.TeamID) === '22' ? 'highlight-row' : ''}`} key={String(team.TeamID ?? index)}><td><span className={`seed-chip ${zone}`}>{seed}</span></td><td className="standings-name">{team.TeamCity ? `${String(team.TeamCity)} ${String(team.TeamName ?? '')}` : String(team.TeamName ?? team.Team ?? '—')}{String(team.TeamID) === '22' && <span className="you-tag">POR</span>}</td><td>{String(team.WINS ?? '—')}</td><td>{String(team.LOSSES ?? '—')}</td><td>{pct(team.WinPCT)}</td><td>{String(team.ConferenceGamesBack ?? '—')}</td><td>{String(team.strCurrentStreak ?? team.CurrentStreak ?? '—')}</td></tr>
    })}
    {!filtered.length && <tr><td colSpan={7} className="empty-cell">Standings are not available.</td></tr>}
  </tbody></table></div>
}

function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value))
}

function PlayoffSimulator({ rows }: { rows: Row[] }) {
  const [nextWins, setNextWins] = useState(5)
  const west = rows.filter((team) => String(team.Conference ?? '').toLowerCase().includes('west'))
  const portland = west.find((team) => String(team.TeamID) === '22')
  const complete = portland && typeof portland.WINS === 'number' && typeof portland.LOSSES === 'number'
  const wins = complete ? Number(portland.WINS) : 0
  const losses = complete ? Number(portland.LOSSES) : 0
  const gamesPlayed = complete ? Number(portland.GAMES_PLAYED ?? wins + losses) : 0
  const remaining = complete ? Number(portland.REMAINING ?? Math.max(0, 82 - gamesPlayed)) : 0
  const simulatedGames = Math.min(10, remaining)
  const currentRate = gamesPlayed ? wins / gamesPlayed : 0
  const projectedWins = complete
    ? wins + Math.min(nextWins, simulatedGames) + Math.max(0, remaining - simulatedGames) * currentRate
    : 0
  const projectedLosses = complete ? 82 - projectedWins : 0
  const projectedRate = complete ? projectedWins / Math.max(1, 82) : 0
  const projectedOrder = west.map((team) => ({
    id: String(team.TeamID),
    rate: String(team.TeamID) === '22'
      ? projectedRate
      : Number(team.WinPCT ?? 0),
  })).sort((left, right) => right.rate - left.rate)
  const projectedSeed = complete ? projectedOrder.findIndex((team) => team.id === '22') + 1 : 0
  const sixth = Number(west.find((team) => Number(team.PlayoffRank) === 6)?.WinPCT)
  const tenth = Number(west.find((team) => Number(team.PlayoffRank) === 10)?.WinPCT)
  const sigma = Math.max(0.045, Math.sqrt(Math.max(1, remaining)) * 0.008)
  const directOdds = complete && Number.isFinite(sixth) ? logistic((projectedRate - sixth) / sigma) : null
  const playinTotal = complete && Number.isFinite(tenth) ? logistic((projectedRate - tenth) / sigma) : null
  const playinOdds = directOdds !== null && playinTotal !== null ? Math.max(0, playinTotal - directOdds) : null
  const gamesBack = (seed: number) => {
    const target = west.find((team) => Number(team.PlayoffRank) === seed)
    if (!target || !portland) return '—'
    const targetWins = Number(target.WINS ?? 0)
    const targetLosses = Number(target.LOSSES ?? 0)
    return Math.max(0, ((targetWins - wins) + (losses - targetLosses)) / 2).toFixed(1)
  }
  const percent = (probability: number | null) => probability === null ? '—' : `${Math.round(probability * 100)}%`

  return (
    <section className="surface simulator-card">
      <div className="section-title"><div><p className="eyebrow">Run the table</p><h2>Playoff & play-in simulator</h2></div><span className="simulator-live"><i /> WHAT-IF MODEL</span></div>
      <p className="simulator-intro">A simple projection from current West records, games back and the remaining schedule. Simulate Portland’s next 10.</p>
      <div className="simulator-odds">
        <div><span>DIRECT PLAYOFF</span><strong>{percent(directOdds)}</strong><small>TOP 6 SEEDS</small></div>
        <div><span>PLAY-IN CHANCE</span><strong>{percent(playinOdds)}</strong><small>SEEDS 7–10</small></div>
        <div><span>GAMES BACK · #6 / #10</span><strong>{gamesBack(6)} <i>/</i> {gamesBack(10)}</strong><small>{remaining || '—'} GAMES REMAINING</small></div>
      </div>
      <label className="sim-slider-label"><span>SIMULATE NEXT {simulatedGames} GAMES</span><strong>{nextWins} WINS <i>—</i> {simulatedGames - nextWins} LOSSES</strong></label>
      <input className="sim-slider" type="range" min="0" max={simulatedGames} value={Math.min(nextWins, simulatedGames)} onChange={(event) => setNextWins(Number(event.target.value))} disabled={!complete || simulatedGames === 0} />
      <div className="slider-ends"><span>0 WINS</span><span>{simulatedGames} WINS</span></div>
      <div className="projection-result">
        <div><span>PROJECTED FINAL RECORD</span><strong>{complete ? `${projectedWins.toFixed(0)}–${projectedLosses.toFixed(0)}` : 'Unavailable'}</strong></div>
        <div><span>PROJECTED WEST SEED</span><strong>{projectedSeed ? `#${projectedSeed}` : '—'}</strong></div>
        <p>{complete ? projectedSeed <= 6 ? 'Direct playoff spot in this scenario.' : projectedSeed <= 10 ? 'Play-in position in this scenario.' : 'Outside the current projected top 10.' : 'Standings data is unavailable; projections will return when ESPN responds.'}</p>
      </div>
      <small className="model-disclaimer">Illustrative estimate, not a betting or official NBA forecast. Remaining teams are projected at their current win rate.</small>
    </section>
  )
}

function CommandCenter({ player, live, team, league, insights }: {
  player: PlayerPayload | null
  live: LivePayload | null
  team: TeamPayload | null
  league: LeaguePayload | null
  insights: InsightsPayload | null
}) {
  const averages = player?.averages ?? {}
  const next = team?.upcoming[0]
  const currentAlert = insights?.anomalies[0]
  const lastGame = player ? latestPlayerGame(player.games) : undefined
  const localTip = next?.TIP_TIMESTAMP ? new Intl.DateTimeFormat('en-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(String(next.TIP_TIMESTAMP))) : 'Schedule update pending'
  return (
    <section className="command-center">
      <div className="command-hero glass-panel">
        <div className="command-hero-copy"><p className="eyebrow"><span className="live-dot" /> RIP CITY · NBA COMMAND CENTER</p><h1>Built for <span>game night.</span></h1><p>Portland basketball, Deni Avdija and the league — live from the court.</p><div className="command-hero-tags"><span>100% CLIENT-SIDE</span><span>ISRAEL TIME</span><span>{player?.season ?? NBA_SEASON}</span></div></div>
        <div className="command-jersey">08</div>
      </div>
      <div className="command-summary-grid">
        <article className="command-spotlight glass-panel"><div className="command-card-head"><span className="eyebrow">PLAYER SPOTLIGHT · #8</span>{live?.isLive && <span className="command-live-pill"><i /> LIVE NOW</span>}</div><h2>Deni <span>Avdija</span></h2><p>PORTLAND TRAIL BLAZERS · FORWARD</p><div className="command-stat-row">{[['PTS', averages.PTS], ['REB', averages.REB], ['AST', averages.AST]].map(([label, value]) => <div key={String(label)}><small>{String(label)}</small><b>{number(value)}</b></div>)}</div><div className="command-spotlight-bottom"><span>SEASON AVERAGES</span>{lastGame && <span>LAST GAME · {number(lastGame.PTS, 0)} PTS</span>}</div></article>
        <article className={`command-next glass-panel ${live?.isLive ? 'command-next-live' : ''}`}><span className="eyebrow">{live?.isLive ? 'LIVE GAME' : 'NEXT TIP · ISRAEL TIME'}</span><h2>{live?.isLive ? `${live.game?.away.abbreviation ?? 'POR'} ${live.game?.away.score ?? 0} — ${live.game?.home.score ?? 0} ${live.game?.home.abbreviation ?? ''}` : String(next?.OPPONENT_NAME ?? 'Awaiting schedule')}</h2><p>{live?.isLive ? live.game?.status : next ? `${next.IS_HOME ? 'HOME' : 'AWAY'} · ${localTip}` : 'Portland’s next tip-off will appear when ESPN publishes the schedule.'}</p>{live?.isLive ? <span className="command-countdown"><Radio size={14} /> Deni’s live box score is tracking on the Deep-Dive tab.</span> : next?.TIP_TIMESTAMP ? <Countdown target={String(next.TIP_TIMESTAMP)} /> : <CalendarDays size={20} className="command-muted-icon" />}</article>
      </div>
      <section className="command-alerts"><div className="history-section-title"><div><p className="eyebrow">COURTSIDE SIGNAL</p><h2>Top alerts</h2></div><span className="history-count">{currentAlert ? 'LIVE FEED' : 'DENI WATCH'}</span></div><div className="command-alert-grid">
        {currentAlert ? <article className="command-alert-card glass-panel"><span className="command-alert-icon"><Flame size={17} /></span><div><small>{currentAlert.team} · {dateLabel(currentAlert.date)}</small><b>{currentAlert.player} · {currentAlert.reason}</b><span>{currentAlert.points} PTS · {currentAlert.rebounds} REB · {currentAlert.assists} AST</span></div></article> : lastGame ? <article className="command-alert-card glass-panel"><span className="command-alert-icon"><Activity size={17} /></span><div><small>DENI AVDIJA · LAST GAME</small><b>{number(lastGame.PTS, 0)} PTS · {number(lastGame.REB, 0)} REB · {number(lastGame.AST, 0)} AST</b><span>{String(lastGame.MATCHUP ?? 'Portland')} · {String(lastGame.WL ?? 'RESULT PENDING')}</span></div></article> : <article className="command-alert-card glass-panel"><span className="command-alert-icon"><Info size={17} /></span><div><small>DATA CONNECTION</small><b>ESPN’s game feed is warming up</b><span>Player alerts appear as soon as recent box scores load.</span></div></article>}
        <article className="command-alert-card glass-panel"><span className="command-alert-icon command-alert-green"><Trophy size={17} /></span><div><small>WESTERN CONFERENCE</small><b>{team?.record.rank ? `PORTLAND · #${team.record.rank} SEED` : 'PLAYOFF SCENARIOS'}</b><span>Use the live simulator to explore the postseason race.</span></div></article>
      </div></section>
      <PlayoffSimulator rows={league?.standings ?? []} />
      {league?.games.length ? <section className="command-scoreboard"><div className="history-section-title"><div><p className="eyebrow">AROUND THE ASSOCIATION</p><h2>Today’s scoreboard</h2></div><span className="history-count">{league.games.length} GAMES</span></div><div className="scoreboard-grid">{league.games.slice(0, 4).map((game) => <ScoreGameCard key={game.id} game={game} />)}</div></section> : null}
    </section>
  )
}

function LeagueHub({ data, loading, error, reload }: { data: LeaguePayload | null; loading: boolean; error: string; reload: () => void }) {
  const [conference, setConference] = useState<'East' | 'West'>('West')
  const east = data?.standings.filter((row) => String(row.Conference ?? '').toLowerCase().includes('east')) ?? []
  const west = data?.standings.filter((row) => String(row.Conference ?? '').toLowerCase().includes('west')) ?? []
  return (
    <>
      <section className="league-hero"><div><div className="hero-kicker"><span className="live-dot" /> AROUND THE LEAGUE</div><h1>Every game.<br /><span>Every night.</span></h1><p>League-wide action, one place.</p></div><div className="league-date"><CalendarDays size={17} /><span>TONIGHT’S SLATE</span><strong>{dateLabel(data?.date ?? new Date().toISOString(), { weekday: 'long', month: 'long', day: 'numeric' })}</strong></div></section>
      {error && <LoadError loading={loading} error={error} onRetry={reload} />}
      <SectionTitle kicker="Around the association" title="Today’s scoreboard" action={<button className="text-button" onClick={() => void reload()}><RefreshCw size={13} /> Refresh</button>} />
      {loading && !data && <div className="loading-line" />}
      {data && <div className="scoreboard-grid">{data.games.map((game) => <ScoreGameCard key={game.id} game={game} />)}{!data.games.length && <div className="quiet-empty full-width">{error ? 'Today’s scoreboard is temporarily unavailable.' : 'No NBA games scheduled today. Check back on game day.'}</div>}</div>}
      <section className="surface standings-section"><div className="section-title"><div><p className="eyebrow">The race to the playoffs</p><h2>Conference standings</h2></div><div className="segmented"><button className={conference === 'West' ? 'selected' : ''} onClick={() => setConference('West')}>Western</button><button className={conference === 'East' ? 'selected' : ''} onClick={() => setConference('East')}>Eastern</button></div></div>
        {data?.sample && <p className="insights-note"><Info size={14} /> Sample conference order · win-loss records will appear when ESPN’s standings feed responds.</p>}
        {data && <StandingsTable rows={conference === 'West' ? west : east} conference={conference} />}
        {!data && !error && <div className="quiet-empty">Conference standings load with today’s scoreboard.</div>}
      </section>
      <PlayoffSimulator rows={data?.standings ?? []} />
    </>
  )
}

export default function App() {
  const [view, setView] = useState<View>('command')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [digestOpen, setDigestOpen] = useState(false)
  const [digestUnread, setDigestUnread] = useState(false)
  const player = useApi(loadPlayerData, FALLBACK_PLAYER, view === 'command' || view === 'deepdive' || view === 'history')
  const live = useApi(loadLiveData, FALLBACK_LIVE, true)
  const team = useApi(loadTeamData, FALLBACK_TEAM, true)
  const league = useApi(loadLeagueData, FALLBACK_LEAGUE, view === 'command' || view === 'leaders')
  const insights = useApi(loadInsights, FALLBACK_INSIGHTS, true)
  const refreshAll = useCallback(async () => {
    const active = [live.reload(), team.reload()]
    if (player.data || view === 'command' || view === 'deepdive' || view === 'history') active.push(player.reload())
    if (league.data || view === 'command' || view === 'leaders') active.push(league.reload())
    if (insights.data || view === 'command' || view === 'leaders' || view === 'history') active.push(insights.reload())
    await Promise.allSettled(active)
    setLastSync(new Date())
  }, [insights.data, insights.reload, league.data, league.reload, live.reload, player.data, player.reload, team.reload, view])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = live.data?.isLive ? 60_000 : 5 * 60_000
    const timer = window.setInterval(() => void refreshAll(), interval)
    return () => window.clearInterval(timer)
  }, [autoRefresh, live.data?.isLive, refreshAll])

  useEffect(() => {
    if (!live.loading && !team.loading && live.data && team.data) setLastSync(new Date())
  }, [live.data, live.loading, team.data, team.loading])
  useEffect(() => {
    try {
      setDigestUnread(window.localStorage.getItem(weeklyDigestKey()) !== 'viewed')
    } catch {
      setDigestUnread(false)
    }
  }, [])
  useEffect(() => {
    const portland = league.data?.standings.find((row) => String(row.TeamID) === '22')
    if (typeof portland?.PlayoffRank !== 'number' || portland.SAMPLE === true) return
    try {
      const key = weeklyStandingsKey()
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, JSON.stringify({ seed: portland.PlayoffRank, savedAt: new Date().toISOString() }))
      }
    } catch {
      return
    }
  }, [league.data])
  const openDigest = () => {
    setDigestOpen(true)
    setDigestUnread(false)
    if (!league.data) void league.reload()
    try {
      window.localStorage.setItem(weeklyDigestKey(), 'viewed')
    } catch {
      setDigestUnread(false)
    }
  }
  const nav: { id: View; label: string }[] = [
    { id: 'command', label: 'Command Center' },
    { id: 'deepdive', label: 'Deni & Blazers' },
    { id: 'leaders', label: 'League Leaders' },
    { id: 'history', label: 'Anomalies & Media' },
  ]

  return (
    <div className="app-shell">
      <div className="topline"><span>{NBA_SEASON} NBA SEASON</span><span>THE ROSE CITY’S HOME FOR HOOPS <i /> <b>PORTLAND, OR</b></span></div>
      <header className="site-header">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView('command') }}><span className="brand-mark"><span /></span><span className="brand-name">RIP CITY<span>TRACKER</span></span></a>
        <nav className="main-nav" aria-label="Main navigation">{nav.map((item) => <button key={item.id} className={view === item.id ? 'nav-active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>
        <div className="header-actions"><button className="digest-trigger" onClick={openDigest}>WEEKLY DIGEST{digestUnread && <i aria-label="Unread digest" />}</button><div className="header-status"><span className="live-dot" /> ESPN DATA <span className="header-season">{NBA_SEASON.slice(-2)}</span></div></div>
      </header>
      <LiveTicker
        live={live.data}
        team={team.data}
        lastSync={lastSync}
        loading={live.loading || team.loading || ((view === 'command' || view === 'deepdive') && player.loading)}
        onRefresh={() => void refreshAll()}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((enabled) => !enabled)}
      />
      <main className="main-content">
        {view === 'command' && <CommandCenter player={player.data} live={live.data} team={team.data} league={league.data} insights={insights.data} />}
        {view === 'deepdive' && <><Spotlight player={player.data} live={live.data} team={team.data} playerError={player.error} liveError={live.error} playerLoading={player.loading} liveLoading={live.loading} reloadPlayer={player.reload} reloadLive={live.reload} /><TeamHub data={team.data} loading={team.loading} error={team.error} reload={team.reload} /></>}
        {view === 'leaders' && <><LeagueLeadersHub insights={insights.data} player={player.data} error={insights.error} /><LeagueHub data={league.data} loading={league.loading} error={league.error} reload={league.reload} /></>}
        {view === 'history' && <><HistoryFeed insights={insights.data} player={player.data} error={insights.error} /><HighlightsHub latestGame={player.data ? latestPlayerGame(player.data.games) : undefined} /></>}
        <footer className="site-footer"><a className="brand brand-small" href="#" onClick={(event) => { event.preventDefault(); setView('command') }}><span className="brand-mark"><span /></span><span className="brand-name">RIP CITY<span>TRACKER</span></span></a><span>BUILT FOR THE LOVE OF THE GAME <i /> UNOFFICIAL FAN PROJECT</span><span>DATA FROM ESPN</span></footer>
      </main>
      <div className="mobile-nav">{nav.map((item) => <button key={item.id} className={view === item.id ? 'nav-active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}</div>
      {digestOpen && <WeeklyDigestModal player={player.data} team={team.data} league={league.data} insights={insights.data} onClose={() => setDigestOpen(false)} />}
    </div>
  )
}
