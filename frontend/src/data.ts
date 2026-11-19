export type Row = Record<string, unknown>

export type GameRow = Row & {
  GAME_ID?: string
  GAME_DATE?: string
  MATCHUP?: string
  WL?: string
  MIN?: string | number
  PTS?: number
  OPPONENT_PTS?: number
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
  status: string
  statusCode: number
  home: { id: string; name: string; abbreviation: string; score: number | null; logo?: string }
  away: { id: string; name: string; abbreviation: string; score: number | null; logo?: string }
  period?: number
  clock?: string
}

export type PlayerPayload = {
  player: { name: string; team: string }
  season: string
  averages: Row
  games: GameRow[]
  trend: Row[]
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
}

export type LeaguePayload = {
  date: string
  games: ScoreGame[]
  standings: Row[]
}

export type ApiResult<T> = {
  data: T
  error: string
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
  }>
}

type EspnCompetitor = {
  id?: string
  homeAway?: string
  score?: string | number | { value?: number; displayValue?: string }
  winner?: boolean
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
}

export const FALLBACK_LIVE: LivePayload = {
  isLive: false,
  game: null,
  stats: null,
  message: 'A live score is not available right now.',
}

export const FALLBACK_TEAM: TeamPayload = {
  season: SEASON,
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
    status: eventStatus(event).type?.shortDetail
      ?? eventStatus(event).type?.detail
      ?? eventStatus(event).type?.description
      ?? 'Status unavailable',
    statusCode,
    home: mapCompetitor(home, statusCode),
    away: mapCompetitor(away, statusCode),
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
    WL: portland.score === null || opponent.score === null ? undefined : won ? 'W' : 'L',
  }
}

function trendRow(game: GameRow, index: number): Row {
  const fieldGoalAttempts = game.FGA ?? 0
  const threePointAttempts = game.FG3A ?? 0
  return {
    game: index + 1,
    date: game.GAME_DATE ?? '',
    opponent: game.MATCHUP ?? '',
    points: game.PTS ?? null,
    rebounds: game.REB ?? null,
    assists: game.AST ?? null,
    fgPct: fieldGoalAttempts ? ((game.FGM ?? 0) / fieldGoalAttempts) * 100 : null,
    threePct: threePointAttempts ? ((game.FG3M ?? 0) / threePointAttempts) * 100 : null,
    minutes: typeof game.MIN === 'number' ? game.MIN : Number(game.MIN) || null,
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
    standings?: { entries?: Array<{ team?: { id?: string; location?: string; name?: string }; stats?: Array<{ name?: string; value?: number; displayValue?: string }> }> }
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
        const streak = stats.get('streak')
        return {
          TeamID: team.id,
          TeamCity: team.location,
          TeamName: team.name,
          Conference: conference.abbreviation,
          PlayoffRank: index + 1,
          WINS: stats.get('wins'),
          LOSSES: stats.get('losses'),
          WinPCT: stats.get('leagueWinPercent'),
          ConferenceGamesBack: stats.get('gamesBehind'),
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
      roster: rosterResult.roster,
      recent: schedule.recent,
      upcoming: schedule.upcoming,
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
  const standings = standingsResult.status === 'fulfilled' ? mapStandings(standingsResult.value) : []
  if (scoreboardResult.status === 'rejected') errors.push(errorText(scoreboardResult.reason))
  if (standingsResult.status === 'rejected') errors.push(errorText(standingsResult.reason))
  return {
    data: { date: nbaDate(), games, standings },
    error: [...new Set(errors)].join(' '),
  }
}
