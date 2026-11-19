import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, Award, CalendarDays, Flame, Radio, TrendingUp } from 'lucide-react'
import { latestPlayerGame, loadLeagueLeaderCategory, loadWeeklyTopPerformer, type InsightsPayload, type LeaguePayload, type LeagueLeader, type OutlierPerformance, type PlayerPayload, type TeamPayload } from './data'

const LEADER_TABS = [
  { key: 'points', label: 'POINTS', stat: 'PTS', suffix: 'PPG' },
  { key: 'assists', label: 'ASSISTS', stat: 'AST', suffix: 'APG' },
  { key: 'rebounds', label: 'REBOUNDS', stat: 'REB', suffix: 'RPG' },
  { key: 'steals', label: 'STEALS', stat: 'STL', suffix: 'SPG' },
  { key: 'blocks', label: 'BLOCKS', stat: 'BLK', suffix: 'BPG' },
  { key: '3pm', label: '3PM', stat: 'FG3M', suffix: '3PM' },
] as const

function average(values: number[]): number | null {
  const valid = values.filter(Number.isFinite)
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null
}

function nice(value: unknown, digits = 1): string {
  const parsed = Number(value)
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed) ? '—' : parsed.toFixed(digits)
}

function day(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric', timeZone: 'Asia/Jerusalem' }).format(date)
}

export function LeagueLeadersHub({ insights, player, error }: {
  insights: InsightsPayload | null
  player: PlayerPayload | null
  error: string
}) {
  const [active, setActive] = useState<(typeof LEADER_TABS)[number]['key']>('points')
  const [categoryLeaders, setCategoryLeaders] = useState<Record<string, LeagueLeader[]>>({})
  const [categoryError, setCategoryError] = useState('')
  const [categoryLoading, setCategoryLoading] = useState(false)
  const category = LEADER_TABS.find((item) => item.key === active) ?? LEADER_TABS[0]
  const leaders = categoryLeaders[active] ?? insights?.leaders[active] ?? []
  const deniStat = Number(player?.averages[category.stat])
  const deniRank = leaders.findIndex((leader) => leader.id === '4683021' || /deni avdija/i.test(leader.name))
  const benchmark = leaders[0]?.value
  const share = Number.isFinite(deniStat) && benchmark && benchmark > 0 ? Math.min(100, (deniStat / benchmark) * 100) : null

  useEffect(() => {
    if (categoryLeaders[active]?.length) {
      setCategoryError('')
      setCategoryLoading(false)
      return
    }
    let activeRequest = true
    setCategoryLoading(true)
    setCategoryError('')
    void loadLeagueLeaderCategory(active).then((result) => {
      if (!activeRequest) return
      setCategoryLeaders((current) => ({ ...current, [active]: result.data }))
      setCategoryError(result.error)
    }).finally(() => {
      if (activeRequest) setCategoryLoading(false)
    })
    return () => { activeRequest = false }
  }, [active, categoryLeaders])

  return (
    <section className="leaders-hub">
      <div className="leaders-hero glass-panel">
        <div><p className="eyebrow"><Award size={14} /> THE LEAGUE’S BEST</p><h1>NBA League <span>Leaders</span></h1><p>Season production, tracked live from ESPN.</p></div>
        <div className="leader-benchmark"><span>DENI’S {category.label} PACE</span><strong>{nice(deniStat)} <small>{category.suffix}</small></strong><div className="benchmark-track"><i style={{ width: `${share ?? 0}%` }} /></div><small>{share === null ? 'League benchmark unavailable' : `${share.toFixed(0)}% of current #1`}</small></div>
      </div>
      <nav className="leader-tabs" aria-label="League leader categories">{LEADER_TABS.map((tab) => <button key={tab.key} className={active === tab.key ? 'active' : ''} onClick={() => setActive(tab.key)}>{tab.label}</button>)}</nav>
      {categoryError && <p className="insights-note"><Radio size={14} /> ESPN leader data is unavailable; illustrative fallback values are shown.</p>}
      {error && <p className="insights-note"><Radio size={14} /> Some recent-game feeds are unavailable; showing the data currently available.</p>}
      <div className="leader-grid">
        {leaders.length ? leaders.map((leader, index) => <article className={`leader-card glass-panel ${leader.id === '4683021' || /deni avdija/i.test(leader.name) ? 'leader-deni' : ''}`} key={`${active}-${leader.id}`}>
          <div className="leader-rank">{String(index + 1).padStart(2, '0')}</div>
          {leader.headshot ? <img className="leader-headshot" src={leader.headshot} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="leader-headshot leader-initial">{leader.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>}
          <div className="leader-player"><strong>{leader.name}</strong><span><b>{leader.team}</b> {leader.teamName}</span></div>
          <div className="leader-value"><strong>{leader.displayValue || nice(leader.value)}</strong><small>{category.suffix}</small></div>
        </article>) : <div className="quiet-empty leaders-empty">{categoryLoading ? 'Loading the top 10 from ESPN…' : categoryError ? 'ESPN’s league-leader feed is temporarily unavailable. Try refreshing when the service responds.' : 'League leaders will appear here when the season statistics endpoint is available.'}</div>}
      </div>
      <div className="leader-deni-benchmark glass-panel"><div className="benchmark-player"><span>DENI AVDIJA</span><strong>{nice(deniStat)} <small>{category.suffix}</small></strong><i>SEASON AVERAGE</i></div><div className="benchmark-main"><div className="benchmark-title"><span>TOP 10 BENCHMARK · {category.label}</span><b>{deniRank >= 0 ? `DENI RANK #${deniRank + 1}` : 'COMPARE TO LEAGUE #1'}</b></div><div className="benchmark-track"><i style={{ width: `${share ?? 0}%` }} /></div><div className="benchmark-labels"><span>0</span><span>{benchmark ? `${nice(benchmark)} ${category.suffix} · LEAGUE LEADER` : 'LEADER DATA UNAVAILABLE'}</span></div></div></div>
    </section>
  )
}

const MILESTONES = [
  { date: 'May 5, 1977', title: 'Portland’s first championship', text: 'The Trail Blazers closed out the NBA Finals in Game 6 to claim the franchise’s first title.', tag: 'BLAZERS HISTORY' },
  { date: 'March 2, 1962', title: 'Wilt Chamberlain scores 100', text: 'One of basketball’s defining single-game scoring records was set in Hershey, Pennsylvania.', tag: 'NBA HISTORY' },
  { date: 'January 22, 2006', title: 'Kobe Bryant’s 81-point game', text: 'The second-highest single-game scoring total in NBA history, behind Wilt’s 100.', tag: 'NBA HISTORY' },
  { date: 'June 2024', title: 'Deni Avdija joins Rip City', text: 'Portland acquired the Israeli forward from Washington, opening a new chapter in his NBA career.', tag: 'DENI · PORTLAND' },
]

export function HistoryFeed({ insights, player, error }: { insights: InsightsPayload | null; player: PlayerPayload | null; error: string }) {
  const deniAnomalies = insights?.anomalies.filter((item) => item.playerId === '4683021') ?? []
  const anomalies = insights?.anomalies ?? []
  const latestGame = player ? latestPlayerGame(player.games) : undefined

  return (
    <section className="history-hub">
      <div className="history-hero glass-panel"><div><p className="eyebrow"><Activity size={14} /> LIVE GAME SCAN</p><h1>Anomalies <span>&amp; History</span></h1><p>Rare stat lines from recent NBA box scores, alongside the moments that shaped the game.</p></div><span className="history-pulse"><i /> ESPN SCAN · LAST 48 HOURS</span></div>
      {deniAnomalies.length > 0 ? <div className="deni-alert glass-panel"><div className="alert-icon"><Flame size={18} /></div><div><span>DENI AVDIJA · SEASON-HIGH WATCH</span><strong>{deniAnomalies[0].reason}</strong><small>{deniAnomalies[0].gameTitle} · {day(deniAnomalies[0].date)}</small></div></div> : latestGame ? <div className="deni-alert glass-panel"><div className="alert-icon"><TrendingUp size={18} /></div><div><span>DENI AVDIJA · SEASON TRACKER</span><strong>Latest: {nice(latestGame.PTS, 0)} PTS · {nice(latestGame.REB, 0)} REB · {nice(latestGame.AST, 0)} AST</strong><small>Season high watch compares recent game logs; career highs require a complete historical archive.</small></div></div> : null}
      <div className="history-section-title"><div><p className="eyebrow">THE LAST 48 HOURS</p><h2>Outlier performances</h2></div><span className="history-count">{anomalies.length} ALERT{anomalies.length === 1 ? '' : 'S'}</span></div>
      <div className="outlier-grid">{anomalies.length ? anomalies.slice(0, 18).map((item) => <article className="outlier-card glass-panel" key={item.id}>
        {item.headshot ? <img src={item.headshot} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="outlier-avatar">{item.player.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>}
        <div className="outlier-main"><div className="outlier-meta"><b>{item.player}</b><span>{item.team} · {day(item.date)}</span></div><div className="outlier-line"><b>{item.points} PTS</b><span>{item.rebounds} REB</span><span>{item.assists} AST</span><span>{item.steals} STL</span><span>{item.blocks} BLK</span></div><div className="outlier-reason">{item.reason}</div></div>
      </article>) : <div className="quiet-empty full-width">{error ? 'ESPN’s recent scoreboard or box-score scan is temporarily unavailable. Recent games will be checked again automatically.' : insights ? 'No qualifying outlier performances in the recent completed/live game boxes. Thresholds: 40+ PTS, 15+ AST, 18+ REB, 5+ STL/BLK, or a triple-double.' : 'Connect to ESPN to scan recent NBA box scores.'}</div>}</div>
      <div className="history-section-title milestones-title"><div><p className="eyebrow">ON THIS DAY · NBA ARCHIVE</p><h2>Milestones in the game</h2></div><CalendarDays size={18} /></div>
      <div className="milestone-grid">{MILESTONES.map((item) => <article className="milestone-card glass-panel" key={item.title}><span>{item.tag}</span><small>{item.date}</small><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
    </section>
  )
}

export function WeeklyDigestModal({ player, team, league, insights, onClose }: {
  player: PlayerPayload | null
  team: TeamPayload | null
  league: LeaguePayload | null
  insights: InsightsPayload | null
  onClose: () => void
}) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const weeklyGames = useMemo(() => (player?.games ?? []).filter((game) => Date.parse(String(game.GAME_DATE ?? '')) >= cutoff), [player, cutoff])
  const averages = [
    { key: 'PTS', label: 'POINTS' },
    { key: 'REB', label: 'REBOUNDS' },
    { key: 'AST', label: 'ASSISTS' },
  ]
  const weeklyTeamGames = (team?.recent ?? []).filter((game) => Date.parse(String(game.GAME_DATE ?? '')) >= cutoff)
  const wins = weeklyTeamGames.filter((game) => game.WL === 'W').length
  const seed = league?.standings.find((row) => String(row.TeamID) === '22')?.PlayoffRank
  const [startingSeed, setStartingSeed] = useState<number | null>(null)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(weeklyStandingsKey())
      const snapshot = saved ? JSON.parse(saved) as { seed?: number } : null
      setStartingSeed(typeof snapshot?.seed === 'number' ? snapshot.seed : null)
    } catch {
      setStartingSeed(null)
    }
  }, [])
  const recentStar = [...(insights?.anomalies ?? [])]
    .filter((item) => Date.parse(item.date) >= cutoff)
    .sort((a, b) => b.points - a.points)[0]
  const [weeklyStar, setWeeklyStar] = useState<OutlierPerformance | undefined>(recentStar)
  const [weeklyLoading, setWeeklyLoading] = useState(true)
  const [weeklyError, setWeeklyError] = useState('')

  useEffect(() => {
    let active = true
    void loadWeeklyTopPerformer().then((result) => {
      if (!active) return
      if (result.data) setWeeklyStar(result.data)
      setWeeklyError(result.error)
    }).finally(() => {
      if (active) setWeeklyLoading(false)
    })
    return () => { active = false }
  }, [])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="digest-modal glass-modal" role="dialog" aria-modal="true" aria-labelledby="digest-title">
      <button className="modal-close" aria-label="Close weekly digest" onClick={onClose}>×</button>
      <div className="digest-cover"><p className="eyebrow">THE WEEK IN RIP CITY · {new Intl.DateTimeFormat('en-IL', { month: 'long', day: 'numeric', timeZone: 'Asia/Jerusalem' }).format(new Date())}</p><h2 id="digest-title">Weekly <span>Digest</span></h2><p>Seven days. Every possession that mattered.</p></div>
      <div className="digest-story"><span className="digest-index">01</span><div><p className="eyebrow">DENI · LAST 7 DAYS</p><div className="digest-stats">{averages.map(({ key, label }) => {
        const recent = weeklyGames.map((game) => Number(game[key])).filter(Number.isFinite)
        const weeklyAverage = average(recent)
        const baseline = Number(player?.averages[key])
        const delta = weeklyAverage !== null && Number.isFinite(baseline) ? weeklyAverage - baseline : null
        return <div key={key}><small>{label}</small><strong>{nice(weeklyAverage)}</strong><span className={delta === null ? '' : delta >= 0 ? 'digest-up' : 'digest-down'}>{delta === null ? 'NO WEEK DATA' : <>{delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(delta).toFixed(1)} VS SEASON</>}</span></div>
      })}</div><p className="digest-subtext">{weeklyGames.length ? `${weeklyGames.length} game${weeklyGames.length === 1 ? '' : 's'} in the last seven days, measured against Deni’s season averages.` : 'No Deni game logs were found in the last seven days.'}</p></div></div>
      <div className="digest-story"><span className="digest-index">02</span><div><p className="eyebrow">PORTLAND · WEEKLY RUN</p><h3>{weeklyTeamGames.length ? `${wins}–${weeklyTeamGames.length - wins} this week` : 'No completed Portland games this week'}</h3><p className="digest-subtext">{seed ? `Current position: #${seed} in the Western Conference.` : 'Current conference seed is unavailable.'} {startingSeed && seed ? `Seed movement since this week's first visit: ${Number(startingSeed) - Number(seed) > 0 ? `up ${Number(startingSeed) - Number(seed)}` : Number(startingSeed) - Number(seed) < 0 ? `down ${Math.abs(Number(startingSeed) - Number(seed))}` : 'unchanged'}.` : 'Seed-movement tracking starts with this week’s first visit.'}</p></div></div>
      <div className="digest-story"><span className="digest-index">03</span><div><p className="eyebrow">NBA · STAT LINE OF THE WEEK</p><h3>{weeklyStar ? `${weeklyStar.player} · ${weeklyStar.points} points` : weeklyLoading ? 'Scanning the last 7 NBA days…' : 'No completed player box scores found this week'}</h3><p className="digest-subtext">{weeklyStar ? `${weeklyStar.team} · ${weeklyStar.rebounds} REB · ${weeklyStar.assists} AST · ${day(weeklyStar.date)}${weeklyError ? ' · partial feed' : ''}` : weeklyError ? 'ESPN’s weekly game archive is temporarily unavailable.' : 'The weekly league scan includes completed games with published player box scores.'}</p></div></div>
      <footer className="digest-footer">PERSONALIZED FROM ESPN DATA · UPDATED WHEN YOU OPEN THE DASHBOARD</footer>
    </section>
  </div>
}

export function weeklyDigestKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value)
  const date = new Date(Date.UTC(part('year'), part('month') - 1, part('day')))
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7))
  const weekYear = date.getUTCFullYear()
  const weekNumber = Math.ceil(((date.getTime() - Date.UTC(weekYear, 0, 1)) / 86_400_000 + 1) / 7)
  return `rip-city-weekly-digest:${weekYear}-W${String(weekNumber).padStart(2, '0')}`
}

export function weeklyStandingsKey(): string {
  return `${weeklyDigestKey()}:standings`
}
