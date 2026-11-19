export type Row = Record<string, unknown>

export type GameRow = Row & {
  GAME_ID?: string
  GAME_DATE?: string
  MATCHUP?: string
  WL?: string
  TEAM_SCORE?: number
  OPPONENT_SCORE?: number
  MIN?: string | number
  PTS?: number
  OPPONENT_PTS?: number
  OPPONENT_ABBREVIATION?: string
  OPPONENT_LOGO?: string
  AST_TO?: number
  TS_PCT?: number
  REB?: number
  OREB?: number
  DREB?: number
  AST?: number
  STL?: number
  BLK?: number
  FGM?: number
  FGA?: number
  FG3M?: number
  FG3A?: number
  FTM?: number
  FTA?: number
  TOV?: number
  PF?: number
  PLUS_MINUS?: number
}

export type ScoreGame = {
  id: string
  date?: string
  status: string
  statusCode: number
  home: { id: string; name: string; abbreviation: string; score: number | null; logo?: string; linescores?: string[] }
  away: { id: string; name: string; abbreviation: string; score: number | null; logo?: string; linescores?: string[] }
  period?: number
  clock?: string
  venue?: string
  broadcast?: string
}

export type PlayerPayload = {
  player: { name: string; team: string }
  season: string
  averages: Row
  games: GameRow[]
  trend: Row[]
  sample?: boolean
}

export type LivePayload = {
  isLive: boolean
  game: ScoreGame | null
  stats: GameRow | null
  message: string | null
}

export type TeamPayload = {
  season: string
  record: {
    wins?: number
    losses?: number
    conference?: string
    rank?: number
    streak?: string | number
    streakType?: string
  }
  roster: Row[]
  recent: GameRow[]
  upcoming: Row[]
  sample?: boolean
}

export type LeaguePayload = {
  date: string
  games: ScoreGame[]
  standings: Row[]
  sample?: boolean
}

export type LeagueLeader = {
  id: string
  name: string
  team: string
  teamName: string
  headshot: string
  value: number
  displayValue: string
  category: string
}

export type OutlierPerformance = {
  id: string
  playerId: string
  player: string
  team: string
  opponent: string
  date: string
  points: number
  rebounds: number
  assists: number
  steals: number
  blocks: number
  headshot: string
  reason: string
  gameTitle: string
}

export type InsightsPayload = {
  leaders: Record<string, LeagueLeader[]>
  anomalies: OutlierPerformance[]
  sample?: boolean
}

export type ApiResult<T> = {
  data: T
  error: string
}

export function latestPlayerGame(games: GameRow[]): GameRow | undefined {
  return games.find((game) => game.MIN !== 'DNP' && typeof game.PTS === 'number')
    ?? games.find((game) => game.MIN !== 'DNP')
    ?? games[0]
}

type EspnEvent = {
  id: string
  name?: string
  shortName?: string
  date?: string
  status?: {
    displayClock?: string
    period?: number
    type?: {
      state?: string
      completed?: boolean
      detail?: string
      shortDetail?: string
      description?: string
    }
  }
  competitions?: Array<{
    id?: string
    date?: string
    status?: EspnEvent['status']
    competitors?: EspnCompetitor[]
    venue?: { fullName?: string; address?: { city?: string; state?: string } }
    broadcasts?: Array<{ names?: string[] }>
  }>
}

type EspnCompetitor = {
  id?: string
  homeAway?: string
  score?: string | number | { value?: number; displayValue?: string }
  winner?: boolean
  linescores?: Array<{ displayValue?: string; value?: number }>
  team?: {
    id?: string
    location?: string
    name?: string
    displayName?: string
    abbreviation?: string
    logos?: Array<{ href?: string }>
  }
}

type EspnAthlete = {
  id: string
  fullName?: string
  displayName?: string
  displayHeight?: string
  displayWeight?: string
  experience?: { years?: number }
  jersey?: string
  position?: { abbreviation?: string }
  active?: boolean
}

class EspnApiError extends Error {
  constructor(readonly status: number, path: string) {
    super(`ESPN returned ${status} for ${path}`)
    this.name = 'EspnApiError'
  }
}

const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba'
const PORTLAND_ID = '22'
const DENI_ID = '4683021'
const LIVE_CACHE_MS = 30_000
const SEASON_CACHE_MS = 15 * 60_000
const MAX_ACTIVE_REQUESTS = 6
const responseCache = new Map<string, { expiresAt: number; value: unknown }>()
const pendingRequests = new Map<string, Promise<unknown>>()
const requestQueue: Array<() => void> = []
let activeRequests = 0

const SEASON_YEAR = getSeasonYear()
const SEASON = `${SEASON_YEAR - 1}-${String(SEASON_YEAR).slice(-2)}`

export const FALLBACK_PLAYER: PlayerPayload = {
  player: { name: 'Deni Avdija', team: 'Portland Trail Blazers' },
  season: SEASON,
  averages: {},
  games: [],
  trend: [],
  sample: true,
}

export const FALLBACK_LIVE: LivePayload = {
  isLive: false,
  game: null,
  stats: null,
  message: 'A live score is not available right now.',
}

export const FALLBACK_TEAM: TeamPayload = {
  season: SEASON,
  sample: true,
  record: { conference: 'Western Conference' },
  roster: ['Deni Avdija', 'Shaedon Sharpe', 'Anfernee Simons', 'Scoot Henderson', 'Toumani Camara', 'Donovan Clingan']
    .map((PLAYER, index) => ({
      PLAYER_ID: `sample-${index}`,
      PLAYER,
      POSITION: '—',
      HEIGHT: '—',
      WEIGHT: '—',
      EXP: '—',
      PTS: null,
      REB: null,
      AST: null,
      MIN: null,
      SAMPLE: true,
    })),
  recent: [],
  upcoming: [],
}

export const FALLBACK_LEAGUE: LeaguePayload = {
  date: nbaDate(),
  games: [],
  standings: [
    ...[
      ['Oklahoma City', 'Thunder'], ['Houston', 'Rockets'], ['Denver', 'Nuggets'],
      ['Golden State', 'Warriors'], ['LA', 'Clippers'], ['Portland', 'Trail Blazers'],
      ['Minnesota', 'Timberwolves'], ['Phoenix', 'Suns'], ['Sacramento', 'Kings'],
      ['Dallas', 'Mavericks'], ['Memphis', 'Grizzlies'], ['New Orleans', 'Pelicans'],
      ['San Antonio', 'Spurs'], ['Utah', 'Jazz'], ['Los Angeles', 'Lakers'],
    ].map(([TeamCity, TeamName], index) => ({
      TeamID: TeamCity === 'Portland' ? PORTLAND_ID : `sample-west-${index}`,
      TeamCity,
      TeamName,
      Conference: 'West',
      PlayoffRank: index + 1,
      WINS: null,
      LOSSES: null,
      WinPCT: null,
      ConferenceGamesBack: null,
      GAMES_PLAYED: null,
      REMAINING: null,
      strCurrentStreak: '—',
      SAMPLE: true,
    })),
    ...[
      ['Boston', 'Celtics'], ['New York', 'Knicks'], ['Cleveland', 'Cavaliers'],
      ['Milwaukee', 'Bucks'], ['Orlando', 'Magic'], ['Philadelphia', '76ers'],
      ['Indiana', 'Pacers'], ['Miami', 'Heat'], ['Atlanta', 'Hawks'],
      ['Chicago', 'Bulls'], ['Brooklyn', 'Nets'], ['Toronto', 'Raptors'],
      ['Detroit', 'Pistons'], ['Charlotte', 'Hornets'], ['Washington', 'Wizards'],
    ].map(([TeamCity, TeamName], index) => ({
      TeamID: `sample-east-${index}`,
      TeamCity,
      TeamName,
      Conference: 'East',
      PlayoffRank: index + 1,
      WINS: null,
      LOSSES: null,
      WinPCT: null,
      ConferenceGamesBack: null,
      GAMES_PLAYED: null,
      REMAINING: null,
      strCurrentStreak: '—',
      SAMPLE: true,
    })),
  ],
}

const LEADER_CATEGORIES = [
  { key: 'points', labels: ['points per game', 'pointspergame'], stat: ['avgPoints', 'points'] },
  { key: 'assists', labels: ['assists per game', 'assistspergame'], stat: ['avgAssists', 'assists'] },
  { key: 'rebounds', labels: ['rebounds per game', 'reboundspergame'], stat: ['avgRebounds', 'rebounds'] },
  { key: 'steals', labels: ['steals per game', 'stealspergame'], stat: ['avgSteals', 'steals'] },
  { key: 'blocks', labels: ['blocks per game', 'blockspergame'], stat: ['avgBlocks', 'blocks'] },
  { key: '3pm', labels: ['average 3-point field goals made', '3pointsmadepergame'], stat: ['avgThreePointFieldGoalsMade', 'threePointFieldGoalsMade'] },
] as const

function sampleLeaders(key: string, values: Array<[string, string, number]>): LeagueLeader[] {
  return values.map(([name, team, value], index) => ({
    id: `sample-${key}-${index}`,
    name,
    team,
    teamName: 'Sample standings',
    headshot: '',
    value,
    displayValue: value.toFixed(1),
    category: key,
  }))
}

export const FALLBACK_INSIGHTS: InsightsPayload = {
  sample: true,
  leaders: {
    points: sampleLeaders('points', [['League leader sample', 'NBA', 31.2], ['Scoring sample', 'NBA', 28.4], ['Deni Avdija', 'POR', 24.2]]),
    assists: sampleLeaders('assists', [['Playmaking sample', 'NBA', 10.1], ['Guard sample', 'NBA', 8.8], ['Deni Avdija', 'POR', 6.1]]),
    rebounds: sampleLeaders('rebounds', [['Rebounding sample', 'NBA', 12.4], ['Center sample', 'NBA', 10.8], ['Deni Avdija', 'POR', 6.2]]),
    steals: sampleLeaders('steals', [['Defense sample', 'NBA', 2.1], ['Guard sample', 'NBA', 1.8], ['Deni Avdija', 'POR', 1.0]]),
    blocks: sampleLeaders('blocks', [['Rim protector sample', 'NBA', 2.3], ['Big sample', 'NBA', 1.9], ['Deni Avdija', 'POR', 0.6]]),
    '3pm': sampleLeaders('3pm', [['Shooter sample', 'NBA', 4.2], ['Wing sample', 'NBA', 3.6], ['Deni Avdija', 'POR', 2.4]]),
  },
  anomalies: [],
}

function getSeasonYear(): number {
  const now = new Date()
  const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(now))
  const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric' }).format(now))
  return month >= 10 ? year + 1 : year
}

function nbaDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function seasonStatsUrl(athleteId: string): string {
  return `${ESPN_CORE}/seasons/${SEASON_YEAR}/types/2/athletes/${athleteId}/statistics/0?lang=en&region=us`
}

function acquireRequestSlot(): Promise<void> {
  if (activeRequests < MAX_ACTIVE_REQUESTS) {
    activeRequests += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    requestQueue.push(() => {
      activeRequests += 1
      resolve()
    })
  })
}

function releaseRequestSlot(): void {
  activeRequests -= 1
  requestQueue.shift()?.()
}

async function fetchJson<T>(url: string, ttl = SEASON_CACHE_MS): Promise<T> {
  const cached = responseCache.get(url)
  if (cached && cached.expiresAt > Date.now()) return cached.value as T

  const pending = pendingRequests.get(url)
  if (pending) return pending as Promise<T>

  const request = (async () => {
    await acquireRequestSlot()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new EspnApiError(response.status, new URL(url).pathname)
      const value: unknown = await response.json()
      responseCache.set(url, { expiresAt: Date.now() + ttl, value })
      return value
    } finally {
      clearTimeout(timeout)
      releaseRequestSlot()
      pendingRequests.delete(url)
    }
  })()

  pendingRequests.set(url, request)
  return request as Promise<T>
}

function errorText(reason: unknown): string {
  if (reason instanceof Error && reason.name === 'AbortError') return 'ESPN data request timed out.'
  return reason instanceof Error ? reason.message : 'ESPN data is temporarily unavailable.'
}

function statValues(categories: Array<{ stats?: Array<{ name?: string; value?: number }> }> = []): Map<string, number> {
  return new Map(
    categories.flatMap((category) =>
      (category.stats ?? []).flatMap((stat) =>
        stat.name && typeof stat.value === 'number' ? [[stat.name, stat.value] as [string, number]] : [],
      ),
    ),
  )
}

type EspnSeasonStats = {
  splits?: { categories?: Array<{ stats?: Array<{ name?: string; value?: number }> }> }
}

function mapSeasonStats(response: EspnSeasonStats): Row {
  const values = statValues(response.splits?.categories)
  const gamesPlayed = values.get('gamesPlayed') ?? 0
  const points = values.get('avgPoints') ?? null
  const fieldGoalAttempts = values.get('avgFieldGoalsAttempted') ?? null
  const freeThrowAttempts = values.get('avgFreeThrowsAttempted') ?? null
  const assists = values.get('avgAssists') ?? null
  const turnovers = values.get('avgTurnovers') ?? null
  const trueShootingAttempts = fieldGoalAttempts === null || freeThrowAttempts === null
    ? null
    : fieldGoalAttempts + 0.44 * freeThrowAttempts
  return {
    PTS: points,
    REB: values.get('avgRebounds') ?? null,
    AST: values.get('avgAssists') ?? null,
    STL: values.get('avgSteals') ?? null,
    BLK: values.get('avgBlocks') ?? null,
    FG_PCT: values.has('fieldGoalPct') ? (values.get('fieldGoalPct') ?? 0) / 100 : null,
    FG3_PCT: values.has('threePointFieldGoalPct') ? (values.get('threePointFieldGoalPct') ?? 0) / 100 : null,
    FT_PCT: values.has('freeThrowPct') ? (values.get('freeThrowPct') ?? 0) / 100 : null,
    MIN: values.get('avgMinutes') ?? null,
    PLUS_MINUS: gamesPlayed ? (values.get('plusMinus') ?? 0) / gamesPlayed : null,
    TS_PCT: trueShootingAttempts && points !== null ? points / (2 * trueShootingAttempts) : null,
    AST_TO: turnovers ? (assists ?? 0) / turnovers : null,
    FGA: fieldGoalAttempts,
    FTA: freeThrowAttempts,
    FG3M: values.get('avgThreePointFieldGoalsMade') ?? null,
  }
}

function eventList(value: unknown): EspnEvent[] {
  if (Array.isArray(value)) return value as EspnEvent[]
  if (value && typeof value === 'object' && 'events' in value && Array.isArray(value.events)) {
    return value.events as EspnEvent[]
  }
  return []
}

function eventCompetition(event: EspnEvent): NonNullable<EspnEvent['competitions']>[number] {
  return event.competitions?.[0] ?? {}
}

function eventStatus(event: EspnEvent): NonNullable<EspnEvent['status']> {
  return eventCompetition(event).status ?? event.status ?? {}
}

function eventDate(event: EspnEvent): string {
  return eventCompetition(event).date ?? event.date ?? ''
}

function eventTeams(event: EspnEvent): ScoreGame {
  const competition = eventCompetition(event)
  const competitors = competition.competitors ?? []
  const home = competitors.find((competitor) => competitor.homeAway === 'home')
  const away = competitors.find((competitor) => competitor.homeAway === 'away')
  const state = eventStatus(event).type?.state
  const statusCode = state === 'in' ? 2 : state === 'post' ? 3 : 1
  return {
    id: competition.id ?? event.id,
    date: eventDate(event),
    status: eventStatus(event).type?.shortDetail
      ?? eventStatus(event).type?.detail
      ?? eventStatus(event).type?.description
      ?? 'Status unavailable',
    statusCode,
    home: mapCompetitor(home, statusCode),
    away: mapCompetitor(away, statusCode),
    period: eventStatus(event).period,
    clock: eventStatus(event).displayClock,
    venue: competition.venue?.fullName,
    broadcast: competition.broadcasts?.flatMap((broadcast) => broadcast.names ?? []).join(', '),
  }
}

function mapCompetitor(competitor: EspnCompetitor | undefined, statusCode: number): ScoreGame['home'] {
  const team = competitor?.team
  const score = competitor?.score
  const scoreValue = typeof score === 'object' && score !== null ? score.value : score
  return {
    id: String(competitor?.id ?? team?.id ?? ''),
    name: team?.displayName ?? [team?.location, team?.name].filter(Boolean).join(' '),
    abbreviation: team?.abbreviation ?? '',
    score: statusCode === 1 || scoreValue === undefined || scoreValue === null || scoreValue === '' ? null : Number(scoreValue),
    logo: competitor?.team?.logos?.[0]?.href ?? '',
    linescores: competitor?.linescores?.map((line) => String(line.displayValue ?? line.value ?? '—')) ?? [],
  }
}

function teamEvents(value: unknown): EspnEvent[] {
  if (Array.isArray(value)) return value as EspnEvent[]
  if (value && typeof value === 'object') {
    const payload = value as { events?: unknown; schedule?: unknown }
    if (Array.isArray(payload.events)) return payload.events as EspnEvent[]
    if (Array.isArray(payload.schedule)) return payload.schedule as EspnEvent[]
  }
  return []
}

function parseStat(value: string | undefined): number | undefined {
  if (value === undefined || value === '' || value === '--') return undefined
  const parsed = Number(value.replace(/^\+/, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseMadeAttempted(value: string | undefined): [number | undefined, number | undefined] {
  if (!value) return [undefined, undefined]
  const [made, attempted] = value.split('-')
  return [parseStat(made), parseStat(attempted)]
}

function mapBoxScorePlayer(boxscore: unknown, athleteId: string): GameRow | null {
  if (!boxscore || typeof boxscore !== 'object' || !('players' in boxscore)) return null
  const groups = (boxscore as { players?: Array<{ statistics?: Array<{ labels?: string[]; athletes?: Array<{ athlete?: { id?: string }; stats?: string[]; didNotPlay?: boolean }> }> }> }).players ?? []
  for (const team of groups) {
    const statistics = team.statistics?.[0]
    const player = statistics?.athletes?.find((item) => item.athlete?.id === athleteId)
    if (!player) continue
    const values = new Map((statistics?.labels ?? []).map((label, index) => [label, player.stats?.[index] ?? '']))
    const [FGM, FGA] = parseMadeAttempted(values.get('FG'))
    const [FG3M, FG3A] = parseMadeAttempted(values.get('3PT'))
    const [FTM, FTA] = parseMadeAttempted(values.get('FT'))
    return {
      MIN: player.didNotPlay ? 'DNP' : values.get('MIN'),
      PTS: parseStat(values.get('PTS')),
      REB: parseStat(values.get('REB')),
      OREB: parseStat(values.get('OREB')),
      DREB: parseStat(values.get('DREB')),
      AST: parseStat(values.get('AST')),
      STL: parseStat(values.get('STL')),
      BLK: parseStat(values.get('BLK')),
      FGM,
      FGA,
      FG3M,
      FG3A,
      FTM,
      FTA,
      TOV: parseStat(values.get('TO')),
      PF: parseStat(values.get('PF')),
      PLUS_MINUS: parseStat(values.get('+/-')),
    }
  }
  return null
}

async function playerGame(event: EspnEvent): Promise<GameRow> {
  const summary = await fetchJson<{ boxscore?: unknown }>(
    `${ESPN_SITE}/summary?event=${encodeURIComponent(event.id)}`,
  )
  const score = eventTeams(event)
  const player = mapBoxScorePlayer(summary.boxscore, DENI_ID) ?? {}
  const portlandHome = score.home.id === PORTLAND_ID
  const portland = portlandHome ? score.home : score.away
  const opponent = portlandHome ? score.away : score.home
  const won = (portland.score ?? 0) > (opponent.score ?? 0)
  return {
    ...player,
    GAME_ID: event.id,
    GAME_DATE: eventDate(event),
    MATCHUP: portlandHome ? `POR vs. ${opponent.abbreviation}` : `POR @ ${opponent.abbreviation}`,
    OPPONENT_ABBREVIATION: opponent.abbreviation,
    OPPONENT_LOGO: opponent.logo,
    WL: portland.score === null || opponent.score === null ? undefined : won ? 'W' : 'L',
    TEAM_SCORE: portland.score ?? undefined,
    OPPONENT_SCORE: opponent.score ?? undefined,
  }
}

function trendRow(game: GameRow, index: number): Row {
  const fieldGoalAttempts = game.FGA ?? 0
  const threePointAttempts = game.FG3A ?? 0
  const freeThrowAttempts = game.FTA ?? 0
  const trueShootingAttempts = fieldGoalAttempts + 0.44 * freeThrowAttempts
  const minutes = typeof game.MIN === 'number'
    ? game.MIN
    : typeof game.MIN === 'string' && game.MIN.includes(':')
      ? Number(game.MIN.split(':')[0]) + Number(game.MIN.split(':')[1]) / 60
      : Number(game.MIN) || null
  return {
    game: index + 1,
    date: game.GAME_DATE ?? '',
    opponent: game.MATCHUP ?? '',
    points: game.PTS ?? null,
    rebounds: game.REB ?? null,
    assists: game.AST ?? null,
    tsPct: trueShootingAttempts && game.PTS !== undefined ? (game.PTS / (2 * trueShootingAttempts)) * 100 : null,
    fgPct: fieldGoalAttempts ? ((game.FGM ?? 0) / fieldGoalAttempts) * 100 : null,
    threePct: threePointAttempts ? ((game.FG3M ?? 0) / threePointAttempts) * 100 : null,
    minutes,
  }
}

export async function loadPlayerData(): Promise<ApiResult<PlayerPayload>> {
  const scheduleUrl = `${ESPN_SITE}/teams/por/schedule?season=${SEASON_YEAR}`
  const [statsResult, scheduleResult] = await Promise.allSettled([
    fetchJson<EspnSeasonStats>(seasonStatsUrl(DENI_ID)),
    fetchJson<unknown>(scheduleUrl),
  ])
  const errors: string[] = []
  const averages = statsResult.status === 'fulfilled' ? mapSeasonStats(statsResult.value) : FALLBACK_PLAYER.averages
  if (statsResult.status === 'rejected') errors.push(errorText(statsResult.reason))

  let games: GameRow[] = []
  if (scheduleResult.status === 'fulfilled') {
    const completed = teamEvents(scheduleResult.value)
      .filter((event) => eventStatus(event).type?.completed)
      .sort((left, right) => Date.parse(eventDate(right)) - Date.parse(eventDate(left)))
      .slice(0, 15)
    const results = await Promise.allSettled(completed.map(playerGame))
    games = results.flatMap((result) => {
      if (result.status === 'fulfilled') return [result.value]
      errors.push(errorText(result.reason))
      return []
    })
  } else {
    errors.push(errorText(scheduleResult.reason))
  }

  return {
    data: {
      player: FALLBACK_PLAYER.player,
      season: SEASON,
      averages,
      games,
      trend: games.slice().reverse().map(trendRow),
      sample: statsResult.status === 'rejected' || scheduleResult.status === 'rejected',
    },
    error: errors.length ? [...new Set(errors)].join(' ') : '',
  }
}

async function loadScoreboard(): Promise<ScoreGame[]> {
  const scoreboard = await fetchJson<unknown>(
    `${ESPN_SITE}/scoreboard?dates=${nbaDate().replace(/-/g, '')}`,
    LIVE_CACHE_MS,
  )
  return eventList(scoreboard).map(eventTeams)
}

export async function loadLiveData(): Promise<ApiResult<LivePayload>> {
  try {
    const scoreboard = await fetchJson<unknown>(
      `${ESPN_SITE}/scoreboard?dates=${nbaDate().replace(/-/g, '')}`,
      LIVE_CACHE_MS,
    )
    const portlandGame = eventList(scoreboard).find((event) =>
      eventCompetition(event).competitors?.some((competitor) => String(competitor.team?.id ?? competitor.id) === PORTLAND_ID),
    )
    if (!portlandGame) {
      return {
        data: { ...FALLBACK_LIVE, message: 'Portland is not playing today.' },
        error: '',
      }
    }

    const game = eventTeams(portlandGame)
    if (game.statusCode !== 2) {
      const state = eventStatus(portlandGame).type?.state
      return {
        data: {
          isLive: false,
          game,
          stats: null,
          message: state === 'post' ? 'Portland’s game is final.' : `Tip-off is scheduled for ${game.status}.`,
        },
        error: '',
      }
    }

    const summary = await fetchJson<{ boxscore?: unknown }>(
      `${ESPN_SITE}/summary?event=${encodeURIComponent(game.id)}`,
      LIVE_CACHE_MS,
    )
    const stats = mapBoxScorePlayer(summary.boxscore, DENI_ID)
    return {
      data: {
        isLive: true,
        game,
        stats,
        message: stats ? null : 'Deni’s live box score is not available yet.',
      },
      error: '',
    }
  } catch (reason) {
    return {
      data: FALLBACK_LIVE,
      error: errorText(reason),
    }
  }
}

type TeamResponse = {
  team?: {
    record?: { items?: Array<{ stats?: Array<{ name?: string; value?: number }>; summary?: string; type?: string }> }
    athletes?: EspnAthlete[]
  }
}

type StandingsResponse = {
  children?: Array<{
    abbreviation?: string
    standings?: { entries?: Array<{ team?: { id?: string; location?: string; name?: string; abbreviation?: string; logos?: Array<{ href?: string }> }; stats?: Array<{ name?: string; value?: number; displayValue?: string }> }> }
  }>
}

function mapStandings(response: StandingsResponse): Row[] {
  return (response.children ?? []).flatMap((conference) => {
    const entries = conference.standings?.entries ?? []
    return entries
      .slice()
      .sort((left, right) => {
        const leftWin = statValues([left]).get('leagueWinPercent') ?? 0
        const rightWin = statValues([right]).get('leagueWinPercent') ?? 0
        return rightWin - leftWin
      })
      .map((entry, index) => {
        const stats = statValues([entry])
        const team = entry.team ?? {}
        const detail = new Map((entry.stats ?? []).map((stat) => [stat.name ?? '', stat.displayValue ?? (typeof stat.value === 'number' ? String(stat.value) : '—')]))
        const streak = stats.get('streak')
        return {
          TeamID: team.id,
          TeamCity: team.location,
          TeamName: team.name,
          Abbreviation: team.abbreviation,
          Logo: team.logos?.[0]?.href,
          Conference: conference.abbreviation,
          PlayoffRank: index + 1,
          WINS: stats.get('wins'),
          LOSSES: stats.get('losses'),
          WinPCT: stats.get('leagueWinPercent'),
          ConferenceGamesBack: stats.get('gamesBehind'),
          HOME: detail.get('Home'),
          AWAY: detail.get('Road'),
          DIV: detail.get('vs. Div.'),
          CONF: detail.get('vs. Conf.'),
          L10: detail.get('Last Ten Games'),
          PPG: stats.get('avgPointsFor'),
          OPPG: stats.get('avgPointsAgainst'),
          DIFF: stats.get('differential'),
          GAMES_PLAYED: stats.get('gamesPlayed') ?? ((stats.get('wins') ?? 0) + (stats.get('losses') ?? 0)),
          REMAINING: Math.max(0, 82 - (stats.get('gamesPlayed') ?? ((stats.get('wins') ?? 0) + (stats.get('losses') ?? 0)))),
          strCurrentStreak: typeof streak === 'number' && streak !== 0
            ? `${streak > 0 ? 'W' : 'L'} ${Math.abs(streak)}`
            : '—',
        }
      })
  })
}

function mapTeamRecord(response: TeamResponse, standings: Row[]): TeamPayload['record'] {
  const record = response.team?.record?.items?.find((item) => item.type === 'total')
  const stats = statValues(record ? [record] : [])
  const portlandStanding = standings.find((row) => String(row.TeamID) === PORTLAND_ID)
  const streak = stats.get('streak') ?? 0
  return {
    wins: stats.get('wins'),
    losses: stats.get('losses'),
    conference: 'Western Conference',
    rank: typeof portlandStanding?.PlayoffRank === 'number' ? portlandStanding.PlayoffRank : undefined,
    streak: streak ? `${streak > 0 ? 'W' : 'L'} ${Math.abs(streak)}` : '—',
    streakType: streak ? `${streak > 0 ? 'W' : 'L'} ${Math.abs(streak)}` : '—',
  }
}

function mapTeamSchedule(events: EspnEvent[]): { recent: GameRow[]; upcoming: Row[] } {
  const now = Date.now()
  const portlandEvents = events.filter((event) =>
    eventCompetition(event).competitors?.some((competitor) => String(competitor.team?.id ?? competitor.id) === PORTLAND_ID),
  )
  const completed = portlandEvents
    .filter((event) => eventStatus(event).type?.completed)
    .sort((left, right) => Date.parse(eventDate(right)) - Date.parse(eventDate(left)))
    .slice(0, 5)
    .map((event) => {
      const score = eventTeams(event)
      const home = score.home.id === PORTLAND_ID
      const portland = home ? score.home : score.away
      const opponent = home ? score.away : score.home
      return {
        GAME_ID: event.id,
        GAME_DATE: eventDate(event),
        MATCHUP: event.shortName ?? event.name ?? '',
        OPPONENT_ABBREVIATION: opponent.abbreviation,
        OPPONENT_LOGO: opponent.logo,
        WL: portland.score === null || opponent.score === null ? undefined : (portland.score > opponent.score ? 'W' : 'L'),
        PTS: portland.score ?? undefined,
        OPPONENT_PTS: opponent.score ?? undefined,
      }
    })
  const upcoming = portlandEvents
    .filter((event) => !eventStatus(event).type?.completed && Date.parse(eventDate(event)) >= now)
    .sort((left, right) => Date.parse(eventDate(left)) - Date.parse(eventDate(right)))
    .slice(0, 5)
    .map((event) => {
      const score = eventTeams(event)
      const home = score.home.id === PORTLAND_ID
      const opponent = home ? score.away : score.home
      return {
        GAME_ID: event.id,
        GAME_DATE: eventDate(event),
        GAME_STATUS_TEXT: new Intl.DateTimeFormat('en-IL', {
          hour: 'numeric',
          minute: '2-digit',
          hourCycle: 'h23',
          timeZone: 'Asia/Jerusalem',
        }).format(new Date(eventDate(event))),
        OPPONENT_LOGO: opponent.logo,
        OPPONENT_ABBREVIATION: opponent.abbreviation,
        VENUE: event.competitions?.[0]?.venue?.fullName ?? '',
        VENUE_CITY: event.competitions?.[0]?.venue?.address?.city ?? '',
        VENUE_STATE: event.competitions?.[0]?.venue?.address?.state ?? '',
        TIP_TIMESTAMP: eventDate(event),
        IS_ISRAEL_FRIENDLY: isIsraelFriendly(eventDate(event)),
        HOME_TEAM_ID: home ? PORTLAND_ID : opponent.id,
        HOME_TEAM_NAME: home ? 'Portland Trail Blazers' : opponent.name,
        VISITOR_TEAM_ID: home ? opponent.id : PORTLAND_ID,
        VISITOR_TEAM_NAME: home ? opponent.name : 'Portland Trail Blazers',
        OPPONENT_NAME: opponent.name,
        IS_HOME: home,
      }
    })
  return { recent: completed.reverse(), upcoming }
}

function isIsraelFriendly(timestamp: string): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestamp)))
  const minute = Number(new Intl.DateTimeFormat('en-IL', {
    timeZone: 'Asia/Jerusalem',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestamp)))
  return hour >= 19 || (hour === 0 && minute <= 30)
}

async function mapRoster(athletes: EspnAthlete[]): Promise<{ roster: Row[]; error: string }> {
  const errors: string[] = []
  const roster = await Promise.all(athletes.map(async (athlete) => {
    try {
      const response = await fetchJson<EspnSeasonStats>(seasonStatsUrl(athlete.id))
      const stats = mapSeasonStats(response)
      return {
        PLAYER_ID: athlete.id,
        PLAYER: athlete.fullName ?? athlete.displayName ?? 'Player',
        POSITION: athlete.position?.abbreviation ?? '—',
        HEIGHT: athlete.displayHeight ?? '—',
        WEIGHT: athlete.displayWeight?.replace(' lbs', '') ?? '—',
        EXP: athlete.experience?.years ?? '—',
        PTS: stats.PTS,
        REB: stats.REB,
        AST: stats.AST,
        MIN: stats.MIN,
        FG_PCT: stats.FG_PCT,
        FG3_PCT: stats.FG3_PCT,
        STL: stats.STL,
        BLK: stats.BLK,
      }
    } catch (reason) {
      if (!(reason instanceof EspnApiError && reason.status === 404)) errors.push(errorText(reason))
      return {
        PLAYER_ID: athlete.id,
        PLAYER: athlete.fullName ?? athlete.displayName ?? 'Player',
        POSITION: athlete.position?.abbreviation ?? '—',
        HEIGHT: athlete.displayHeight ?? '—',
        WEIGHT: athlete.displayWeight?.replace(' lbs', '') ?? '—',
        EXP: athlete.experience?.years ?? '—',
        PTS: null,
        REB: null,
        AST: null,
        MIN: null,
      }
    }
  }))
  return { roster, error: [...new Set(errors)].join(' ') }
}

export async function loadTeamData(): Promise<ApiResult<TeamPayload>> {
  const [teamResult, scheduleResult, standingsResult] = await Promise.allSettled([
    fetchJson<TeamResponse>(`${ESPN_SITE}/teams/por?enable=roster,stats`),
    fetchJson<unknown>(`${ESPN_SITE}/teams/por/schedule?season=${SEASON_YEAR}`),
    fetchJson<StandingsResponse>('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings'),
  ])
  const errors: string[] = []
  const standings = standingsResult.status === 'fulfilled' ? mapStandings(standingsResult.value) : []
  if (standingsResult.status === 'rejected') errors.push(errorText(standingsResult.reason))

  const team = teamResult.status === 'fulfilled' ? teamResult.value : null
  if (teamResult.status === 'rejected') errors.push(errorText(teamResult.reason))
  const schedule = scheduleResult.status === 'fulfilled' ? mapTeamSchedule(teamEvents(scheduleResult.value)) : { recent: [], upcoming: [] }
  if (scheduleResult.status === 'rejected') errors.push(errorText(scheduleResult.reason))

  const rosterResult = team ? await mapRoster(team.team?.athletes ?? []) : { roster: [], error: '' }
  if (rosterResult.error) errors.push(rosterResult.error)

  return {
    data: {
      season: SEASON,
      record: team ? mapTeamRecord(team, standings) : FALLBACK_TEAM.record,
      roster: rosterResult.roster.length ? rosterResult.roster : FALLBACK_TEAM.roster,
      recent: schedule.recent,
      upcoming: schedule.upcoming,
      sample: !team || !rosterResult.roster.length || scheduleResult.status === 'rejected' || standings.length === 0,
    },
    error: [...new Set(errors)].join(' '),
  }
}

export async function loadLeagueData(): Promise<ApiResult<LeaguePayload>> {
  const [scoreboardResult, standingsResult] = await Promise.allSettled([
    loadScoreboard(),
    fetchJson<StandingsResponse>('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings'),
  ])
  const errors: string[] = []
  const games = scoreboardResult.status === 'fulfilled' ? scoreboardResult.value : []
  const mappedStandings = standingsResult.status === 'fulfilled' ? mapStandings(standingsResult.value) : []
  const standings = mappedStandings.length ? mappedStandings : FALLBACK_LEAGUE.standings
  if (scoreboardResult.status === 'rejected') errors.push(errorText(scoreboardResult.reason))
  if (standingsResult.status === 'rejected') errors.push(errorText(standingsResult.reason))
  return {
    data: { date: nbaDate(), games, standings, sample: scoreboardResult.status === 'rejected' || mappedStandings.length === 0 },
    error: [...new Set(errors)].join(' '),
  }
}

type EspnLeaderEntry = {
  athlete?: {
    $ref?: string
    id?: string
    displayName?: string
    fullName?: string
    headshot?: { href?: string }
    team?: { $ref?: string; abbreviation?: string; displayName?: string }
  }
  team?: { $ref?: string; abbreviation?: string; displayName?: string }
  value?: number
  displayValue?: string
  statistics?: Array<{ name?: string; value?: number; displayValue?: string }>
}

type EspnLeaderAthlete = NonNullable<EspnLeaderEntry['athlete']>
type EspnLeaderCategory = { name?: string; displayName?: string; leaders?: EspnLeaderEntry[] }

function leaderCategories(payload: unknown): EspnLeaderCategory[] {
  if (!payload || typeof payload !== 'object') return []
  const response = payload as { categories?: unknown; leaders?: unknown }
  if (Array.isArray(response.categories)) return response.categories as EspnLeaderCategory[]
  if (Array.isArray(response.leaders)) return response.leaders as EspnLeaderCategory[]
  return []
}

const ESPN_TEAM_IDENTITIES: Record<string, [string, string]> = {
  '1': ['ATL', 'Atlanta Hawks'], '2': ['BOS', 'Boston Celtics'], '3': ['NO', 'New Orleans Pelicans'],
  '4': ['CHI', 'Chicago Bulls'], '5': ['CLE', 'Cleveland Cavaliers'], '6': ['DAL', 'Dallas Mavericks'],
  '7': ['DEN', 'Denver Nuggets'], '8': ['DET', 'Detroit Pistons'], '9': ['GS', 'Golden State Warriors'],
  '10': ['HOU', 'Houston Rockets'], '11': ['IND', 'Indiana Pacers'], '12': ['LAC', 'LA Clippers'],
  '13': ['LAL', 'Los Angeles Lakers'], '14': ['MIA', 'Miami Heat'], '15': ['MIL', 'Milwaukee Bucks'],
  '16': ['MIN', 'Minnesota Timberwolves'], '17': ['BKN', 'Brooklyn Nets'], '18': ['NY', 'New York Knicks'],
  '19': ['ORL', 'Orlando Magic'], '20': ['PHI', 'Philadelphia 76ers'], '21': ['PHX', 'Phoenix Suns'],
  '22': ['POR', 'Portland Trail Blazers'], '23': ['SAC', 'Sacramento Kings'], '24': ['SA', 'San Antonio Spurs'],
  '25': ['OKC', 'Oklahoma City Thunder'], '26': ['UTAH', 'Utah Jazz'], '27': ['WSH', 'Washington Wizards'],
  '28': ['TOR', 'Toronto Raptors'], '29': ['MEM', 'Memphis Grizzlies'], '30': ['CHA', 'Charlotte Hornets'],
}

async function mapLeagueLeaders(
  payload: unknown,
  requestedCategories: readonly (typeof LEADER_CATEGORIES)[number][] = LEADER_CATEGORIES,
): Promise<{ leaders: Record<string, LeagueLeader[]>; error: string }> {
  const categories = leaderCategories(payload)
  const errors: string[] = []
  const leaderGroups = await Promise.all(requestedCategories.map(async ({ key, labels }) => {
    const category = categories.find((item) => {
      const name = `${item.name ?? ''} ${item.displayName ?? ''}`.toLowerCase().replace(/[^a-z0-9]/g, '')
      return labels.some((label) => name.includes(label.replace(/[^a-z0-9]/g, '')))
    })
    const leaders = await Promise.all((category?.leaders ?? []).slice(0, 10).map(async (entry, index) => {
      let athlete = entry.athlete
      if ((!athlete?.displayName && !athlete?.fullName) && athlete?.$ref) {
        try {
          const reference = athlete.$ref.replace(/^http:/, 'https:')
          athlete = await fetchJson<EspnLeaderAthlete>(reference)
        } catch (reason) {
          errors.push(errorText(reason))
        }
      }
      if (!athlete) return null
      const id = athlete.id ?? athlete.$ref?.match(/\/athletes\/(\d+)/)?.[1] ?? `${key}-${index}`
      const teamReference = entry.team?.$ref ?? athlete.team?.$ref ?? ''
      const teamId = teamReference.match(/\/teams\/(\d+)/)?.[1]
      const identity = teamId ? ESPN_TEAM_IDENTITIES[teamId] : undefined
      const value = typeof entry.value === 'number' ? entry.value : Number(entry.displayValue)
      if (!Number.isFinite(value)) return null
      const mappedLeader: LeagueLeader = {
        id,
        name: athlete.displayName ?? athlete.fullName ?? `Player ${id}`,
        team: entry.team?.abbreviation ?? athlete.team?.abbreviation ?? identity?.[0] ?? 'NBA',
        teamName: entry.team?.displayName ?? athlete.team?.displayName ?? identity?.[1] ?? '',
        headshot: athlete.headshot?.href ?? '',
        value,
        displayValue: entry.displayValue ?? value.toFixed(1),
        category: key,
      }
      return mappedLeader
    }))
    return [key, leaders.filter((leader) => leader !== null)] as const
  }))
  return { leaders: Object.fromEntries(leaderGroups), error: [...new Set(errors)].join(' ') }
}

export async function loadLeagueLeaderCategory(key: LeagueLeader['category']): Promise<ApiResult<LeagueLeader[]>> {
  const category = LEADER_CATEGORIES.find((item) => item.key === key)
  const fallback = FALLBACK_INSIGHTS.leaders[key] ?? []
  if (!category) return { data: fallback, error: `Unknown NBA leader category: ${key}` }
  try {
    const response = await fetchJson<unknown>(`${ESPN_CORE}/seasons/${SEASON_YEAR}/types/2/leaders?limit=10`)
    const result = await mapLeagueLeaders(response, [category])
    const leaders = result.leaders[key] ?? []
    if (leaders.length) return { data: leaders, error: result.error }
    return {
      data: fallback,
      error: result.error || 'ESPN returned no leaders for this category.',
    }
  } catch (reason) {
    return { data: fallback, error: errorText(reason) }
  }
}

type EspnBoxscoreAthlete = {
  athlete?: {
    id?: string
    displayName?: string
    fullName?: string
    headshot?: string | { href?: string }
  }
  stats?: string[]
}

function recentScoreboardDates(dayCount = 2): string[] {
  const today = nbaDate()
  const [year, month, day] = today.split('-').map(Number)
  return Array.from({ length: dayCount }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1, day - offset))
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
  })
}

async function mapGamePerformances(event: EspnEvent): Promise<OutlierPerformance[]> {
  const live = eventStatus(event).type?.state === 'in'
  const summary = await fetchJson<{ boxscore?: { players?: Array<{ team?: { abbreviation?: string }; statistics?: Array<{ labels?: string[]; athletes?: EspnBoxscoreAthlete[] }> }> } }>(
    `${ESPN_SITE}/summary?event=${encodeURIComponent(event.id)}`,
    live ? LIVE_CACHE_MS : SEASON_CACHE_MS,
  )
  const score = eventTeams(event)
  const competitors = eventCompetition(event).competitors ?? []
  const teams = summary.boxscore?.players ?? []
  const performances: OutlierPerformance[] = []
  for (const teamGroup of teams) {
    const statistics = teamGroup.statistics?.[0]
    if (!statistics) continue
    const team = teamGroup.team?.abbreviation ?? ''
    const opponent = competitors
      .map((competitor) => competitor.team?.abbreviation ?? '')
      .find((abbreviation) => abbreviation && abbreviation !== team) ?? 'NBA'
    for (const athlete of statistics.athletes ?? []) {
      const athleteId = athlete.athlete?.id ?? ''
      const values = new Map((statistics.labels ?? []).map((label, index) => [label.toUpperCase(), parseStat(athlete.stats?.[index]) ?? 0]))
      const points = values.get('PTS') ?? 0
      const rebounds = values.get('REB') ?? 0
      const assists = values.get('AST') ?? 0
      const steals = values.get('STL') ?? 0
      const blocks = values.get('BLK') ?? 0
      const reasons = [
        points >= 40 ? `${points} PTS • Elite scoring night` : '',
        assists >= 15 ? `${assists} AST • Floor general alert` : '',
        rebounds >= 18 ? `${rebounds} REB • Glass dominator` : '',
        steals >= 5 ? `${steals} STL • Defensive disruption` : '',
        blocks >= 5 ? `${blocks} BLK • Rim protection alert` : '',
        [points, rebounds, assists, steals, blocks].filter((stat) => stat >= 10).length >= 3 ? 'Triple-double • All-around masterclass' : '',
      ].filter(Boolean)
      const headshot = athlete.athlete?.headshot
      performances.push({
        id: `${event.id}-${athleteId}`,
        playerId: athleteId,
        player: athlete.athlete?.displayName ?? athlete.athlete?.fullName ?? 'NBA Player',
        team,
        opponent,
        date: eventDate(event),
        points,
        rebounds,
        assists,
        steals,
        blocks,
        headshot: typeof headshot === 'string' ? headshot : headshot?.href ?? '',
        reason: reasons.join(' · '),
        gameTitle: `${team} vs ${opponent} · ${score.status}`,
      })
    }
  }
  return performances
}

async function mapGameOutliers(event: EspnEvent): Promise<OutlierPerformance[]> {
  return (await mapGamePerformances(event)).filter((performance) => performance.reason !== '')
}

export async function loadWeeklyTopPerformer(): Promise<ApiResult<OutlierPerformance | null>> {
  const scoreboardResults = await Promise.allSettled(recentScoreboardDates(7).map((date) =>
    fetchJson<unknown>(`${ESPN_SITE}/scoreboard?dates=${date}&limit=100`, date === nbaDate() ? LIVE_CACHE_MS : SEASON_CACHE_MS),
  ))
  const errors: string[] = []
  const events = scoreboardResults.flatMap((result) => {
    if (result.status === 'fulfilled') return eventList(result.value)
    errors.push(errorText(result.reason))
    return []
  }).filter((event) => eventStatus(event).type?.state === 'post')
  const gameResults = await Promise.allSettled(events.map(mapGamePerformances))
  const performances = gameResults.flatMap((result) => {
    if (result.status === 'fulfilled') return result.value
    errors.push(errorText(result.reason))
    return []
  }).filter((performance) => performance.points > 0)
  const top = performances.sort((left, right) => right.points - left.points)[0] ?? null
  return { data: top, error: [...new Set(errors)].join(' ') }
}

export async function loadInsights(): Promise<ApiResult<InsightsPayload>> {
  const scoreboardResults = await Promise.allSettled(recentScoreboardDates().map((date) =>
      fetchJson<unknown>(`${ESPN_SITE}/scoreboard?dates=${date}&limit=100`, date === nbaDate() ? LIVE_CACHE_MS : SEASON_CACHE_MS),
    ))
  const errors: string[] = []
  let anomalies = FALLBACK_INSIGHTS.anomalies
  const availableScoreboards = scoreboardResults.flatMap((result) => {
    if (result.status === 'fulfilled') return eventList(result.value)
    errors.push(errorText(result.reason))
    return []
  })
  if (availableScoreboards.length) {
    const events = availableScoreboards
      .filter((event) => ['in', 'post'].includes(eventStatus(event).type?.state ?? ''))
      .sort((left, right) => Date.parse(eventDate(right)) - Date.parse(eventDate(left)))
    const results = await Promise.allSettled(events.map(mapGameOutliers))
    anomalies = results.flatMap((result) => {
      if (result.status === 'fulfilled') return result.value
      errors.push(errorText(result.reason))
      return []
    }).sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
  }
  return {
    data: { leaders: {}, anomalies, sample: false },
    error: [...new Set(errors)].join(' '),
  }
}
