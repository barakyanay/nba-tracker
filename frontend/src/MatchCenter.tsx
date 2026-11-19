import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, CircleHelp, Clock3, Info, Radio, RefreshCw, Trophy, X } from 'lucide-react'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { LeaguePayload, ScoreGame, Row } from './data'

type GameTeam = ScoreGame['home'] & { linescores: string[]; winner?: boolean }
type MatchGame = {
  id: string
  date: string
  status: string
  statusCode: number
  period?: number
  clock?: string
  venue?: string
  broadcast?: string
  home: GameTeam
  away: GameTeam
}
type SummaryAthlete = { athlete?: { id?: string; displayName?: string; shortName?: string; headshot?: { href?: string }; position?: { abbreviation?: string } }; starter?: boolean; didNotPlay?: boolean; reason?: string; stats?: string[] }
type SummaryStats = { labels?: string[]; athletes?: SummaryAthlete[] }
type SummaryTeam = { team?: { id?: string; displayName?: string; abbreviation?: string }; statistics?: Array<{ label?: string; abbreviation?: string; displayValue?: string }> }
type GameSummary = {
  boxscore?: { players?: Array<{ team?: SummaryTeam['team']; statistics?: SummaryStats[] }>; teams?: SummaryTeam[] }
  plays?: Array<{ id?: string; text?: string; shortDescription?: string; period?: { number?: number }; clock?: { displayValue?: string }; awayScore?: number; homeScore?: number; scoringPlay?: boolean }>
  injuries?: Array<{ team?: { displayName?: string }; injuries?: Array<{ athlete?: { displayName?: string }; status?: string; details?: string }> }>
}

type Tab = 'box' | 'comparison' | 'plays' | 'injuries'
type Day = 'yesterday' | 'today' | 'tomorrow'
type Props = { view: 'games' | 'standings' | 'trends'; league: LeaguePayload | null; loading: boolean; error: string; reload: () => void }

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const MATCH_CACHE_MS = 30_000
const matchCache = new Map<string, { expiresAt: number; value: unknown }>()
const fallbackGames: MatchGame[] = [{
  id: 'fallback-por',
  date: new Date().toISOString(),
  status: 'Sample game data',
  statusCode: 0,
  home: { id: '22', name: 'Trail Blazers', abbreviation: 'POR', score: 108, linescores: ['27', '29', '25', '27'] },
  away: { id: '7', name: 'Lakers', abbreviation: 'LAL', score: 104, linescores: ['24', '28', '26', '26'] },
  venue: 'Sample feed preview',
}]

function israelDate(offset = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '01'
  const date = new Date(Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day')) + offset))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function isoDate(date: string): string {
  return date.replace(/-/g, '')
}

function mapGames(payload: unknown): MatchGame[] {
  if (!payload || typeof payload !== 'object') return []
  const events = (payload as { events?: Array<Record<string, unknown>> }).events ?? []
  return events.map((event) => {
    const competition = (event.competitions as Array<Record<string, unknown>> | undefined)?.[0] ?? {}
    const competitors = (competition.competitors as Array<Record<string, unknown>> | undefined) ?? []
    const teamFor = (side: string): GameTeam => {
      const item = competitors.find((competitor) => competitor.homeAway === side) ?? {}
      const team = (item.team as Record<string, unknown> | undefined) ?? {}
      const score = Number(item.score)
      const state = (((event.status as Record<string, unknown> | undefined)?.type as Record<string, unknown> | undefined)?.state)
      const linescores = (item.linescores as Array<{ displayValue?: string; value?: number }> | undefined) ?? []
      const logos = (team.logos as Array<{ href?: string }> | undefined) ?? []
      return {
        id: String(team.id ?? item.id ?? ''),
        name: String(team.displayName ?? team.name ?? team.abbreviation ?? 'Team'),
        abbreviation: String(team.abbreviation ?? 'NBA'),
        score: state === 'pre' || !Number.isFinite(score) ? null : score,
        logo: logos[0]?.href,
        linescores: linescores.map((line) => String(line.displayValue ?? line.value ?? '—')),
        winner: item.winner === true,
      }
    }
    const status = (event.status as Record<string, unknown> | undefined) ?? {}
    const statusType = (status.type as Record<string, unknown> | undefined) ?? {}
    const broadcasts = (competition.broadcasts as Array<{ names?: string[] }> | undefined) ?? []
    const venue = (competition.venue as { fullName?: string } | undefined)?.fullName
    return {
      id: String(event.id ?? ''),
      date: String(competition.date ?? event.date ?? ''),
      status: String(statusType.shortDetail ?? statusType.detail ?? 'Scheduled'),
      statusCode: statusType.state === 'in' ? 2 : statusType.state === 'post' ? 3 : 1,
      period: typeof status.period === 'number' ? status.period : undefined,
      clock: typeof status.displayClock === 'string' ? status.displayClock : undefined,
      venue,
      broadcast: broadcasts.flatMap((item) => item.names ?? []).join(', ') || undefined,
      home: teamFor('home'),
      away: teamFor('away'),
    }
  })
}

function formatTip(date: string): string {
  if (!date) return 'Time unavailable'
  return new Intl.DateTimeFormat('en-IL', { timeZone: 'Asia/Jerusalem', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date)) + ' IST'
}

function formatDate(date: string): string {
  return date ? new Intl.DateTimeFormat('en-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`)) : 'NBA slate'
}

function teamLogo(team: GameTeam | { abbreviation?: unknown; TeamID?: unknown }): string | undefined {
  if ('logo' in team && team.logo) return team.logo
  const abbr = String(team.abbreviation ?? '')
  return abbr ? `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png` : undefined
}

async function fetchMatchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const cached = matchCache.get(url)
  if (cached && cached.expiresAt > Date.now()) return cached.value as T
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`ESPN request failed (${response.status}).`)
  const value = await response.json() as T
  matchCache.set(url, { expiresAt: Date.now() + MATCH_CACHE_MS, value })
  return value
}

function TeamBadge({ team }: { team: GameTeam }) {
  const [failed, setFailed] = useState(false)
  const src = teamLogo(team)
  return src && !failed
    ? <img className="match-team-logo" src={src} alt="" onError={() => setFailed(true)} />
    : <span className="match-team-fallback">{team.abbreviation}</span>
}

function GameCard({ game, onSelect }: { game: MatchGame; onSelect: () => void }) {
  const quarterCount = Math.max(game.away.linescores.length, game.home.linescores.length)
  return <button className="match-game-card" onClick={onSelect}>
    <div className="match-game-meta"><span className={game.statusCode === 2 ? 'match-live' : 'match-status'}>{game.statusCode === 2 && <i />}{game.status}</span><span>{game.broadcast ?? (game.venue ? game.venue : 'NBA')}</span></div>
    {quarterCount > 0 && <div className="match-quarter-header"><span>TEAM</span><span>{Array.from({ length: quarterCount }, (_, index) => index < 4 ? `Q${index + 1}` : 'OT').map((label, index) => <i key={index}>{label}</i>)}</span><b>PTS</b></div>}
    {[game.away, game.home].map((team, index) => <div className={`match-game-team ${index ? 'home-team' : ''}`} key={team.id || team.abbreviation}>
      <TeamBadge team={team} /><strong>{team.name}</strong><span className="match-quarter-line">{team.linescores.map((line, lineIndex) => <i key={lineIndex}>{line}</i>)}</span><b className="match-score">{team.score ?? '—'}</b>
    </div>)}
    <div className="match-game-footer"><span>{formatTip(game.date)}</span><span>BOX SCORE <ChevronRight size={13} /></span></div>
  </button>
}

function useMatchGames(date: string) {
  const [games, setGames] = useState<MatchGame[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sample, setSample] = useState(false)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setSample(false)
    fetchMatchJson<unknown>(`${ESPN}/scoreboard?dates=${isoDate(date)}`, controller.signal)
      .then((payload) => {
        setGames(mapGames(payload))
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'Scoreboard is temporarily unavailable.')
        setGames(date === israelDate() ? fallbackGames : [])
        setSample(date === israelDate())
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [date, nonce])
  return { games, loading, error, sample, reload: () => setNonce((value) => value + 1) }
}

function GameDetails({ game, onClose }: { game: MatchGame; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('box')
  const [summary, setSummary] = useState<GameSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('PTS')
  const [descending, setDescending] = useState(true)
  useEffect(() => {
    if (game.id.startsWith('fallback')) {
      setLoading(false)
      setError('Sample scoreboard fallback: official box-score details are not available.')
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetchMatchJson<GameSummary>(`${ESPN}/summary?event=${encodeURIComponent(game.id)}`, controller.signal)
      .then(setSummary)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Game details are temporarily unavailable.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [game.id])

  const rows = useMemo(() => {
    return (summary?.boxscore?.players ?? []).flatMap((group) => {
      const statGroup = group.statistics?.[0]
      return (statGroup?.athletes ?? []).map((athlete) => {
        const stats: Record<string, string> = {}
        ;(statGroup?.labels ?? []).forEach((label, index) => { stats[label] = athlete.stats?.[index] ?? '—' })
        return { id: athlete.athlete?.id ?? `${group.team?.displayName ?? 'team'}-${athlete.athlete?.displayName ?? 'player'}`, name: athlete.athlete?.displayName ?? 'Player', team: group.team?.displayName ?? 'Team', position: athlete.athlete?.position?.abbreviation ?? '', starter: athlete.starter ?? false, dnp: athlete.didNotPlay ?? false, stats }
      })
    }).sort((left, right) => {
      const a = Number(left.stats[sortKey]?.replace(/[^\d.-]/g, '')) || 0
      const b = Number(right.stats[sortKey]?.replace(/[^\d.-]/g, '')) || 0
      return (descending ? b - a : a - b)
    })
  }, [summary, sortKey, descending])
  const teamStats = summary?.boxscore?.teams ?? []
  const comparisonLabels = ['Field Goal %', 'Three Point %', 'Free Throw %', 'Rebounds', 'Offensive Rebounds', 'Assists', 'Steals', 'Blocks', 'Turnovers', 'Points in Paint', 'Fast Break Points']
  const plays = (summary?.plays ?? []).filter((play) => play.text || play.shortDescription).slice(-24).reverse()
  const injuries = summary?.injuries ?? []

  return <div className="match-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="match-drawer" role="dialog" aria-modal="true" aria-label={`${game.away.name} at ${game.home.name}`}>
      <header className="match-drawer-head"><div><p className="eyebrow">NBA MATCH CENTER · {formatDate(game.date.slice(0, 10))}</p><h2>{game.away.abbreviation} <span>{game.away.score ?? '—'}</span><i>—</i><span>{game.home.score ?? '—'}</span> {game.home.abbreviation}</h2><p>{game.status} · {game.venue ?? 'NBA'}{game.broadcast ? ` · ${game.broadcast}` : ''}</p></div><button className="match-close" onClick={onClose} aria-label="Close game details"><X size={20} /></button></header>
      <div className="match-detail-tabs">{([['box', 'Full box score'], ['comparison', 'Team comparison'], ['plays', 'Play-by-play'], ['injuries', 'Injuries']] as Array<[Tab, string]>).map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
      {loading && <div className="match-loading"><RefreshCw size={17} className="spin" /> Loading official game details…</div>}
      {error && <div className="match-error"><Info size={15} />{error}</div>}
      {tab === 'box' && <div className="match-table-wrap">
        <div className="match-table-title"><strong>Player box score</strong><span>Click a stat header to sort</span></div>
        <div className="match-scroll"><table className="match-box-table"><thead><tr><th>PLAYER</th>{['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', '3PT', 'FT', '+/-'].map((key) => <th key={key}><button onClick={() => { setDescending(sortKey === key ? !descending : true); setSortKey(key) }}>{key}{sortKey === key ? (descending ? ' ↓' : ' ↑') : ''}</button></th>)}</tr></thead><tbody>
          {rows.map((row) => <tr key={row.id} className={row.starter ? 'starter-row' : ''}><td><b>{row.name}</b><small>{row.team} · {row.position}{row.dnp ? ` · DNP ${row.dnp ? '' : ''}` : row.starter ? ' · STARTER' : ' · BENCH'}</small></td>{['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', '3PT', 'FT', '+/-'].map((key) => <td key={key}>{row.stats[key] ?? '—'}</td>)}</tr>)}
          {!rows.length && !loading && <tr><td colSpan={12} className="match-empty">{error ? 'Box score unavailable for this game.' : 'No player statistics published yet.'}</td></tr>}
        </tbody></table></div>
      </div>}
      {tab === 'comparison' && <div className="match-comparison">{comparisonLabels.map((label) => {
        const stats = teamStats.map((team) => team.statistics?.find((item) => item.label === label))
        const values = stats.map((stat) => Number.parseFloat(stat?.displayValue ?? '0') || 0)
        const max = Math.max(...values, 1)
        return <div className="comparison-row" key={label}><div><span>{label}</span>{teamStats.map((team, index) => <b key={`${team.team?.id}-${index}`}>{team.team?.abbreviation}: {stats[index]?.displayValue ?? '—'}</b>)}</div><div className="comparison-bars">{values.map((value, index) => <i key={index} className={index === 0 ? 'away-bar' : 'home-bar'} style={{ width: `${Math.max(3, value / max * 100)}%` }} />)}</div></div>
      })}{!teamStats.length && !loading && <p className="match-empty">Team comparison will appear when ESPN publishes a full box score.</p>}</div>}
      {tab === 'plays' && <div className="match-play-list">{plays.map((play, index) => <article key={play.id ?? index} className={play.scoringPlay ? 'scoring-play' : ''}><span>{play.period?.number ? `Q${play.period.number}` : 'PLAY'}<small>{play.clock?.displayValue ?? ''}</small></span><p>{play.text ?? play.shortDescription}</p><b>{play.awayScore ?? '—'} — {play.homeScore ?? '—'}</b></article>)}{!plays.length && !loading && <p className="match-empty">Play-by-play is not available yet.</p>}</div>}
      {tab === 'injuries' && <div className="match-injuries">{injuries.map((group, index) => <section key={`${group.team?.displayName}-${index}`}><h3>{group.team?.displayName ?? 'Team'}</h3>{(group.injuries ?? []).map((injury, injuryIndex) => <div className="injury-row" key={`${injury.athlete?.displayName}-${injuryIndex}`}><b>{injury.athlete?.displayName ?? 'Player'}</b><span>{injury.status ?? 'Status unavailable'}</span><small>{injury.details ?? ''}</small></div>)}</section>)}{(!injuries.length || injuries.every((group) => !group.injuries?.length)) && <p className="match-empty">{loading ? 'Checking availability…' : 'No injury report is listed for this matchup.'}</p>}</div>}
      <footer className="match-drawer-footer">NBA stats and game information provided by ESPN public data feeds.</footer>
    </section>
  </div>
}

function StandingsTable({ rows, title, conference }: { rows: Row[]; title: string; conference: 'East' | 'West' | 'All' }) {
  const shown = conference === 'All' ? rows : rows.filter((row) => String(row.Conference ?? '').toLowerCase().includes(conference.toLowerCase()))
  return <section className="match-standings-section"><div className="match-subheading"><div><p className="eyebrow">REGULAR SEASON · ESPN</p><h3>{title}</h3></div><span>{shown.length} TEAMS</span></div><div className="match-scroll"><table className="match-standings-table"><thead><tr>{['#', 'TEAM', 'W', 'L', 'PCT', 'GB', 'HOME', 'AWAY', 'DIV', 'CONF', 'PPG', 'OPP PPG', '+/-', 'L10', 'STRK'].map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{shown.map((row, index) => {
    const rank = conference === 'All' ? index + 1 : Number(row.PlayoffRank ?? index + 1)
    const team = { TeamID: row.TeamID, abbreviation: row.Abbreviation }
    const logo = teamLogo(team)
    return <tr key={String(row.TeamID)} className={`${String(row.TeamID) === '22' ? 'portland-row' : ''} ${rank === 7 || rank === 11 ? 'zone-divider' : ''}`}>
      <td><span className={`seed-tag ${conference !== 'All' && rank <= 6 ? 'seed-playoff' : conference !== 'All' && rank <= 10 ? 'seed-playin' : ''}`}>{rank}</span></td>
      <td className="standing-team">{logo && <img src={logo} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />}<b>{String(row.TeamCity ?? '')} {String(row.TeamName ?? '')}</b>{conference === 'All' && <small>{String(row.Conference ?? '')}</small>}{String(row.TeamID) === '22' && <small>POR</small>}</td>
      <td>{String(row.WINS ?? '—')}</td><td>{String(row.LOSSES ?? '—')}</td><td>{typeof row.WinPCT === 'number' ? row.WinPCT.toFixed(3).replace(/^0/, '') : '—'}</td><td>{String(row.ConferenceGamesBack ?? '—')}</td>
      <td>{String(row.HOME ?? '—')}</td><td>{String(row.AWAY ?? '—')}</td><td>{String(row.DIV ?? '—')}</td><td>{String(row.CONF ?? '—')}</td><td>{typeof row.PPG === 'number' ? row.PPG.toFixed(1) : '—'}</td><td>{typeof row.OPPG === 'number' ? row.OPPG.toFixed(1) : '—'}</td><td className={Number(row.DIFF) >= 0 ? 'positive-diff' : 'negative-diff'}>{typeof row.DIFF === 'number' ? `${row.DIFF > 0 ? '+' : ''}${row.DIFF.toFixed(1)}` : '—'}</td><td>{String(row.L10 ?? '—')}</td><td>{String(row.strCurrentStreak ?? '—')}</td>
    </tr>
  })}</tbody></table></div>{conference !== 'All' && <div className="standings-legend"><span><i className="legend-playoff" /> Direct playoffs · 1–6</span><span><i className="legend-playin" /> Play-In · 7–10</span></div>}</section>
}

function TeamScatterMarker(props: { cx?: number; cy?: number; payload?: { abbr?: string } }) {
  const { cx = 0, cy = 0, payload } = props
  return <g><circle cx={cx} cy={cy} r={9} fill="#b7333a" stroke="#f08c90" strokeWidth={1} /><text x={cx} y={cy + 2.5} fill="#fff" fontSize={5.5} fontWeight={700} textAnchor="middle">{payload?.abbr ?? ''}</text></g>
}

function EfficiencyChart({ rows }: { rows: Row[] }) {
  const data = rows.filter((row) => typeof row.PPG === 'number' && typeof row.OPPG === 'number').map((row) => ({
    x: row.PPG as number, y: row.OPPG as number, team: `${String(row.TeamCity ?? '')} ${String(row.TeamName ?? '')}`,
    abbr: String(row.Abbreviation ?? ''), logo: String(row.Logo ?? ''),
  }))
  const avgOffense = data.length ? data.reduce((sum, item) => sum + item.x, 0) / data.length : 115
  const avgDefense = data.length ? data.reduce((sum, item) => sum + item.y, 0) / data.length : 115
  return <section className="match-panel efficiency-panel"><div className="match-subheading"><div><p className="eyebrow">30-TEAM SCATTER</p><h3>Scoring & defense matrix</h3></div><span>PPG vs OPP PPG</span></div>
    {data.length ? <div className="efficiency-chart"><div className="quadrant-label quadrant-contenders">CONTENDERS</div><div className="quadrant-label quadrant-offense">OFFENSIVE JUGGERNAUTS</div><div className="quadrant-label quadrant-defense">DEFENSIVE GRINDERS</div><div className="quadrant-label quadrant-rebuild">REBUILDING</div>
      <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 35, right: 24, bottom: 20, left: 12 }}><CartesianGrid stroke="rgba(255,255,255,.07)" /><XAxis type="number" dataKey="x" name="Points per game" tick={{ fill: '#8893a4', fontSize: 10 }} label={{ value: 'OFFENSIVE PPG →', position: 'insideBottom', fill: '#8994a4', fontSize: 9, offset: -8 }} /><YAxis type="number" dataKey="y" name="Opponent PPG" reversed tick={{ fill: '#8893a4', fontSize: 10 }} label={{ value: '← OPPONENT PPG', angle: -90, position: 'insideLeft', fill: '#8994a4', fontSize: 9 }} /><ZAxis range={[56, 56]} /><Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.length ? <div className="efficiency-tooltip"><b>{payload[0].payload.team}</b><span>{payload[0].payload.x.toFixed(1)} PPG · {payload[0].payload.y.toFixed(1)} OPP PPG</span></div> : null} /><Scatter data={data} fill="#e03a3e" shape={TeamScatterMarker} /></ScatterChart></ResponsiveContainer>
      <div className="scatter-average" style={{ left: `${Math.min(85, Math.max(15, (avgOffense - 95) / 40 * 100))}%`, top: `${Math.min(85, Math.max(15, (avgDefense - 95) / 40 * 100))}%` }} />
    </div> : <div className="match-empty"><CircleHelp size={18} /> ESPN standings do not include team scoring splits in this feed yet. Scatter points appear when the API publishes PPG and opponent PPG.</div>}
  </section>
}

function GamesView({ league }: { league: LeaguePayload | null }) {
  const [date, setDate] = useState(israelDate())
  const [selected, setSelected] = useState<MatchGame | null>(null)
  const [day, setDay] = useState<Day>('today')
  const feed = useMatchGames(date)
  const setOffset = (offset: number, next: Day) => { setDate(israelDate(offset)); setDay(next) }
  const fallbackLeagueGames = date === israelDate() ? (league?.games ?? []).map((game) => ({ ...game, date, home: { ...game.home, linescores: [] }, away: { ...game.away, linescores: [] } } as MatchGame)) : []
  const games = feed.games.length && !feed.sample ? feed.games : fallbackLeagueGames.length ? fallbackLeagueGames : feed.games
  return <>
    <section className="match-hero"><div><p className="eyebrow"><span className="live-dot" /> NBA · MATCH CENTER</p><h1>Every game.<br /><span>Every detail.</span></h1><p>Live scores, quarter-by-quarter lines and full box scores from across the league.</p></div><div className="match-hero-mark">NBA<span>LIVE</span></div></section>
    <div className="match-datebar"><div className="match-date-switch"><button aria-label="Previous day" onClick={() => setOffset(day === 'today' ? -1 : day === 'tomorrow' ? 0 : -2, day === 'today' ? 'yesterday' : day === 'tomorrow' ? 'today' : 'yesterday')}><ChevronLeft size={17} /></button><CalendarDays size={16} /><strong>{formatDate(date)}</strong><button aria-label="Next day" onClick={() => setOffset(day === 'yesterday' ? 0 : day === 'today' ? 1 : 2, day === 'yesterday' ? 'today' : 'tomorrow')}><ChevronRight size={17} /></button></div><div className="segmented">{([['yesterday', 'Yesterday'], ['today', 'Today'], ['tomorrow', 'Tomorrow']] as Array<[Day, string]>).map(([key, label]) => <button key={key} className={day === key ? 'selected' : ''} onClick={() => setOffset(key === 'yesterday' ? -1 : key === 'tomorrow' ? 1 : 0, key)}>{label}</button>)}</div><button className="match-refresh" onClick={feed.reload} disabled={feed.loading}><RefreshCw size={14} className={feed.loading ? 'spin' : ''} /> REFRESH</button></div>
    {feed.error && <div className="match-error"><Info size={15} />{feed.error}{feed.sample && <span> · Showing a sample preview</span>}</div>}
    {feed.loading && <div className="match-loading"><RefreshCw size={17} className="spin" /> Loading games…</div>}
    {!feed.loading && games.length > 0 && <><div className="match-results-meta"><span>{feed.sample ? 'SAMPLE PREVIEW' : `${games.length} NBA ${games.length === 1 ? 'GAME' : 'GAMES'}`}</span><span><Clock3 size={13} /> ALL TIMES ISRAEL TIME</span></div><div className="match-games-grid">{games.map((game) => <GameCard key={game.id} game={game} onSelect={() => setSelected(game)} />)}</div></>}
    {!feed.loading && !games.length && <div className="match-offday"><CalendarDays size={24} /><div><b>No games scheduled</b><span>There are no NBA games on this date. Check another day for the latest slate.</span></div></div>}
    <div className="match-data-note"><Radio size={14} /> Scores update from ESPN’s public NBA feed. Final box score detail depends on game status and ESPN data availability.</div>
    {selected && <GameDetails game={selected} onClose={() => setSelected(null)} />}
  </>
}

function StandingsView({ league, loading, error, reload }: { league: LeaguePayload | null; loading: boolean; error: string; reload: () => void }) {
  const [conference, setConference] = useState<'West' | 'East' | 'League'>('West')
  const rows = league?.standings ?? []
  const west = rows.filter((row) => String(row.Conference ?? '').toLowerCase().includes('west'))
  const east = rows.filter((row) => String(row.Conference ?? '').toLowerCase().includes('east'))
  const displayRows: Row[] = conference === 'League'
    ? [...west.map((row): Row => ({ ...row, Conference: 'West' })), ...east.map((row): Row => ({ ...row, Conference: 'East' }))].sort((a, b) => Number(a.WinPCT ?? 0) - Number(b.WinPCT ?? 0)).reverse()
    : conference === 'West' ? west : east
  return <><section className="match-hero standings-hero"><div><p className="eyebrow"><Trophy size={14} /> NBA · POSTSEASON RACE</p><h1>Every seed.<br /><span>Every scenario.</span></h1><p>Conference standings, team performance and a live Portland playoff simulator.</p></div></section>
    <div className="match-datebar"><div className="segmented">{([['West', 'Western'], ['East', 'Eastern'], ['League', 'League power']] as Array<[typeof conference, string]>).map(([key, label]) => <button key={key} className={conference === key ? 'selected' : ''} onClick={() => setConference(key)}>{label}</button>)}</div><button className="match-refresh" onClick={reload} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> REFRESH</button></div>
    {error && <div className="match-error"><Info size={15} />{error}</div>}
    {league?.sample && <p className="match-sample-note"><Info size={14} /> ESPN standings are unavailable; seed order is illustrative and current records are not shown.</p>}
    {conference === 'League'
      ? <StandingsTable rows={displayRows} conference="All" title="Combined League Power Rankings" />
      : <StandingsTable rows={displayRows} conference={conference} title={`${conference === 'West' ? 'Western' : 'Eastern'} Conference`} />}
    <EfficiencyChart rows={rows} />
  </>
}

function TrendsView({ league }: { league: LeaguePayload | null }) {
  const rows = league?.standings ?? []
  return <><section className="match-hero trends-hero"><div><p className="eyebrow"><Radio size={14} /> NBA · TRENDS & PLAYER LAB</p><h1>Find the<br /><span>competitive edge.</span></h1><p>Team scoring profiles, efficiency quadrants and league-wide player leaderboards.</p></div></section>
    <EfficiencyChart rows={rows} />
    <section className="match-panel trends-leader-note"><div className="match-subheading"><div><p className="eyebrow">PLAYER LAB</p><h3>League leaders & player comparisons</h3></div></div><p>Explore live scoring, playmaking, rebounding, defense and shooting leaders, then compare Portland players in the Deni & Blazers deep-dive.</p><div className="trends-actions"><span>PTS · AST · REB · STL · BLK · 3PM</span><a href="#deni-deep-dive">OPEN PLAYER COMPARISON <ChevronRight size={14} /></a></div></section>
    {league?.sample && <p className="match-sample-note"><Info size={14} /> Efficiency rankings appear when ESPN publishes current team scoring splits.</p>}
  </>
}

export default function MatchCenter({ view, league, loading, error, reload }: Props) {
  if (view === 'games') return <GamesView league={league} />
  if (view === 'standings') return <StandingsView league={league} loading={loading} error={error} reload={reload} />
  return <TrendsView league={league} />
}
