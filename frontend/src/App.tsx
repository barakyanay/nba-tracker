import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Clock3,
  Flame,
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
  FALLBACK_PLAYER,
  FALLBACK_TEAM,
  loadLeagueData,
  loadLiveData,
  loadPlayerData,
  loadTeamData,
  type ApiResult,
  type LeaguePayload,
  type LivePayload,
  type PlayerPayload,
  type Row,
  type ScoreGame,
  type TeamPayload,
} from './data'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type View = 'spotlight' | 'team' | 'league'

const YEAR = new Date().getFullYear()
const SEASON_START = new Date().getMonth() >= 9 ? YEAR : YEAR - 1
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

function Spotlight({ player, live, playerError, liveError, playerLoading, liveLoading, reloadPlayer, reloadLive }: {
  player: PlayerPayload | null
  live: LivePayload | null
  playerError: string
  liveError: string
  playerLoading: boolean
  liveLoading: boolean
  reloadPlayer: () => void
  reloadLive: () => void
}) {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [chartMode, setChartMode] = useState<'scoring' | 'efficiency'>('scoring')

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => void reloadLive(), 30_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, reloadLive])

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
            <label className="toggle-wrap"><span>Auto-refresh</span><button aria-label="Toggle automatic live stat refresh" className={`toggle ${autoRefresh ? 'toggle-on' : ''}`} onClick={() => setAutoRefresh((value) => !value)}><i /></button></label>
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
        <div className="live-foot">        <span><span className="stat-dot" /> DATA FROM ESPN</span><span>REFRESHES EVERY 30 SEC</span></div>
      </section>

      <div className="content-grid charts-grid">
        <section className="surface chart-card">
          <div className="chart-heading"><div><p className="eyebrow">Game by game</p><h2>Performance trend</h2></div><div className="segmented"><button className={chartMode === 'scoring' ? 'selected' : ''} onClick={() => setChartMode('scoring')}>Scoring</button><button className={chartMode === 'efficiency' ? 'selected' : ''} onClick={() => setChartMode('efficiency')}>Efficiency</button></div></div>
          {player?.trend.length ? <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={player.trend} margin={{ top: 14, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#282b31" vertical={false} />
                <XAxis dataKey="game" tickLine={false} axisLine={false} tick={{ fill: '#777c86', fontSize: 10 }} tickFormatter={(value) => `G${value}`} minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#777c86', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#17191f', border: '1px solid #30333b', borderRadius: 8, color: '#f5f5f5' }} labelFormatter={(value, items) => items[0]?.payload?.date ?? `Game ${value}`} />
                {chartMode === 'scoring' ? <>
                  <Line type="monotone" dataKey="points" name="Points" stroke="#e03a3e" strokeWidth={2.5} dot={{ r: 2, fill: '#e03a3e', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="rebounds" name="Rebounds" stroke="#d7a358" strokeWidth={1.8} dot={false} />
                  <Line type="monotone" dataKey="assists" name="Assists" stroke="#7f95c6" strokeWidth={1.8} dot={false} />
                </> : <>
                  <Line type="monotone" dataKey="fgPct" name="FG%" stroke="#e03a3e" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="threePct" name="3P%" stroke="#d7a358" strokeWidth={1.8} dot={false} />
                </>}
              </LineChart>
            </ResponsiveContainer>
          </div> : <div className="chart-empty">{playerLoading ? 'Loading the season game log…' : playerError ? 'Season trend is unavailable while ESPN data is offline.' : 'Season trend will appear when games are available.'}</div>}
          <div className="chart-legend"><span><i className="legend-red" />{chartMode === 'scoring' ? 'POINTS' : 'FG%'}</span><span><i className="legend-gold" />{chartMode === 'scoring' ? 'REBOUNDS' : '3P%'}</span>{chartMode === 'scoring' && <span><i className="legend-blue" />ASSISTS</span>}</div>
        </section>
        <section className="surface efficiency-card">
          <p className="eyebrow">Efficiency snapshot</p><h2>Shot profile</h2>
          <div className="efficiency-main"><div className="efficiency-ring" style={{ background: `conic-gradient(var(--red) 0% ${Number.isFinite(Number(averages.FG_PCT)) ? Number(averages.FG_PCT) * 100 : 0}%, #26282e 0% 100%)` }}><div><strong>{pct(averages.FG_PCT)}</strong><span>FIELD GOAL</span></div></div><div className="efficiency-rows"><div><span>3-point</span><b>{pct(averages.FG3_PCT)}</b></div><div><span>Free throw</span><b>{pct(averages.FT_PCT)}</b></div><div><span>Minutes</span><b>{number(averages.MIN)}<small> MPG</small></b></div></div></div>
          <div className="efficiency-callout"><span className="callout-bar" /><p>Three levels. One tough cover.<br /><b>Making an impact in Rip City.</b></p><ArrowUpRight size={16} /></div>
        </section>
      </div>

      <section className="surface table-section">
        <SectionTitle kicker="The last 10" title="Game log" action={<span className="muted-label">{player?.season?.replace('-', '—') ?? NBA_SEASON} REGULAR SEASON</span>} />
        {playerError ? <LoadError loading={playerLoading} error={playerError} onRetry={reloadPlayer} /> : playerLoading && !player ? <div className="loading-line" /> : (
          <div className="table-scroll"><table><thead><tr><th>DATE</th><th>MATCHUP</th><th>RESULT</th><th>MIN</th><th>PTS</th><th>REB</th><th>OREB</th><th>DREB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3PT</th><th>FT</th><th>TO</th><th>PF</th><th>+/-</th></tr></thead><tbody>
            {(player?.games ?? []).map((game, index) => <tr key={`${game.GAME_ID ?? game.GAME_DATE}-${index}`}><td>{dateLabel(game.GAME_DATE)}</td><td className="matchup-cell">{game.MATCHUP ?? '—'}</td><td><span className={`result-pill ${game.WL === 'W' ? 'win' : 'loss'}`}>{game.WL ?? '—'}</span></td><td>{number(game.MIN)}</td><td className="strong-cell">{number(game.PTS, 0)}</td><td>{number(game.REB, 0)}</td><td>{number(game.OREB, 0)}</td><td>{number(game.DREB, 0)}</td><td>{number(game.AST, 0)}</td><td>{number(game.STL, 0)}</td><td>{number(game.BLK, 0)}</td><td>{game.FGM ?? '—'}-{game.FGA ?? '—'}</td><td>{game.FG3M ?? '—'}-{game.FG3A ?? '—'}</td><td>{game.FTM ?? '—'}-{game.FTA ?? '—'}</td><td>{number(game.TOV, 0)}</td><td>{number(game.PF, 0)}</td><td className={Number(game.PLUS_MINUS) >= 0 ? 'positive' : 'negative'}>{number(game.PLUS_MINUS, 0)}</td></tr>)}
            {!player?.games.length && <tr><td className="empty-cell" colSpan={17}>No game log is available for this season yet.</td></tr>}
          </tbody></table></div>
        )}
      </section>
    </>
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
      {loading && !data && <div className="loading-line" />}
      <div className="team-highlights">
        <div className="surface highlight-tile"><div className="highlight-icon"><Trophy size={17} /></div><div><span>CONFERENCE POSITION</span><strong>{record?.rank ? `#${record.rank}` : '—'}</strong><small>{record?.conference ?? 'Western Conference'}</small></div></div>
        <div className="surface highlight-tile"><div className="highlight-icon highlight-red"><Flame size={17} /></div><div><span>RECENT STREAK</span><strong>{record?.streakType || record?.streak || '—'}</strong><small>Current run</small></div></div>
        <div className="surface highlight-tile"><div className="highlight-icon"><Users size={17} /></div><div><span>ACTIVE ROSTER</span><strong>{data?.roster.length ?? '—'}</strong><small>Players on roster</small></div></div>
      </div>
      <div className="content-grid schedule-grid">
        <section className="surface schedule-card"><div className="section-title"><div><p className="eyebrow">What’s next</p><h2>Upcoming schedule</h2></div><CalendarDays size={17} className="title-icon" /></div>
          {data?.upcoming.length ? <div className="schedule-list">{data.upcoming.map((game, index) => {
            const home = String(game.HOME_TEAM_ID) === '1610612757'
            const opponent = home ? game.VISITOR_TEAM_NAME : game.HOME_TEAM_NAME
            return <div className="schedule-row" key={String(game.GAME_ID ?? index)}><div className="schedule-date"><b>{dateLabel(game.GAME_DATE, { month: 'short', day: 'numeric' })}</b><span>{dateLabel(game.GAME_DATE, { weekday: 'short' })}</span></div><div className="schedule-opponent"><div className="team-mark">{String(opponent ?? 'NBA').slice(0, 3).toUpperCase()}</div><div><b>{String(opponent ?? 'Opponent')}</b><span>{home ? 'HOME' : 'AWAY'} <i /> {String(game.GAME_STATUS_TEXT ?? 'UPCOMING')}</span></div></div><span className="schedule-time">{game.GAME_STATUS_TEXT ? String(game.GAME_STATUS_TEXT) : 'TBD'}</span><ChevronRight size={15} className="row-chevron" /></div>
          })}</div> : <div className="quiet-empty">{loading ? 'Loading schedule…' : 'Upcoming games will appear here when the season schedule is available.'}</div>}
        </section>
        <section className="surface schedule-card recent-card"><div className="section-title"><div><p className="eyebrow">Last five</p><h2>Recent results</h2></div><Activity size={17} className="title-icon" /></div>
          {data?.recent.length ?           <div className="schedule-list">{data.recent.map((game, index) => <div className="schedule-row recent-row" key={`${game.GAME_ID ?? game.GAME_DATE}-${index}`}><div className="schedule-date"><b>{dateLabel(game.GAME_DATE, { month: 'short', day: 'numeric' })}</b><span>{dateLabel(game.GAME_DATE, { weekday: 'short' })}</span></div><div className="schedule-opponent"><div className={`team-mark ${game.WL === 'W' ? 'team-mark-red' : ''}`}>{(game.MATCHUP ?? 'NBA').split(' ').pop()?.replace(/[^A-Z]/g, '').slice(0, 3)}</div><div><b>{game.MATCHUP ?? '—'}</b><span>FINAL <i /> {game.PTS ?? '—'}–{game.OPPONENT_PTS ?? '—'}</span></div></div><span className={`result-pill ${game.WL === 'W' ? 'win' : 'loss'}`}>{game.WL ?? '—'}</span></div>)}</div> : <div className="quiet-empty">{loading ? 'Loading recent results…' : 'No completed games yet this season.'}</div>}
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
    {filtered.map((team, index) => <tr className={String(team.TeamID) === '1610612757' ? 'highlight-row' : ''} key={String(team.TeamID ?? index)}><td>{String(team.PlayoffRank ?? index + 1)}</td><td className="standings-name">{team.TeamCity ? `${String(team.TeamCity)} ${String(team.TeamName ?? '')}` : String(team.TeamName ?? team.Team ?? '—')}{String(team.TeamID) === '1610612757' && <span className="you-tag">POR</span>}</td><td>{String(team.WINS ?? '—')}</td><td>{String(team.LOSSES ?? '—')}</td><td>{pct(team.WinPCT)}</td><td>{String(team.ConferenceGamesBack ?? '—')}</td><td>{String(team.strCurrentStreak ?? team.CurrentStreak ?? '—')}</td></tr>)}
    {!filtered.length && <tr><td colSpan={7} className="empty-cell">Standings are not available.</td></tr>}
  </tbody></table></div>
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
        {data && <StandingsTable rows={conference === 'West' ? west : east} conference={conference} />}
        {!data && !error && <div className="quiet-empty">Conference standings load with today’s scoreboard.</div>}
      </section>
    </>
  )
}

export default function App() {
  const [view, setView] = useState<View>('spotlight')
  const player = useApi(loadPlayerData, FALLBACK_PLAYER, view === 'spotlight')
  const live = useApi(loadLiveData, FALLBACK_LIVE, view === 'spotlight')
  const team = useApi(loadTeamData, FALLBACK_TEAM, view === 'team')
  const league = useApi(loadLeagueData, FALLBACK_LEAGUE, view === 'league')
  const nav: { id: View; label: string }[] = [
    { id: 'spotlight', label: 'Deni spotlight' },
    { id: 'team', label: 'Trail Blazers' },
    { id: 'league', label: 'NBA league' },
  ]

  return (
    <div className="app-shell">
      <div className="topline"><span>{NBA_SEASON} NBA SEASON</span><span>THE ROSE CITY’S HOME FOR HOOPS <i /> <b>PORTLAND, OR</b></span></div>
      <header className="site-header">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView('spotlight') }}><span className="brand-mark"><span /></span><span className="brand-name">RIP CITY<span>TRACKER</span></span></a>
        <nav className="main-nav" aria-label="Main navigation">{nav.map((item) => <button key={item.id} className={view === item.id ? 'nav-active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>
        <div className="header-status"><span className="live-dot" /> ESPN DATA <span className="header-season">{NBA_SEASON.slice(-2)}</span></div>
      </header>
      <main className="main-content">
        {view === 'spotlight' && <Spotlight player={player.data} live={live.data} playerError={player.error} liveError={live.error} playerLoading={player.loading} liveLoading={live.loading} reloadPlayer={player.reload} reloadLive={live.reload} />}
        {view === 'team' && <TeamHub data={team.data} loading={team.loading} error={team.error} reload={team.reload} />}
        {view === 'league' && <LeagueHub data={league.data} loading={league.loading} error={league.error} reload={league.reload} />}
        <footer className="site-footer"><a className="brand brand-small" href="#" onClick={(event) => { event.preventDefault(); setView('spotlight') }}><span className="brand-mark"><span /></span><span className="brand-name">RIP CITY<span>TRACKER</span></span></a><span>BUILT FOR THE LOVE OF THE GAME <i /> UNOFFICIAL FAN PROJECT</span><span>DATA FROM ESPN</span></footer>
      </main>
      <div className="mobile-nav">{nav.map((item) => <button key={item.id} className={view === item.id ? 'nav-active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}</div>
    </div>
  )
}
