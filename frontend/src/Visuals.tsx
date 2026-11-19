import { useState, type CSSProperties } from 'react'

const TEAM_CODES: Record<string, string> = {
  UTA: 'utah',
  NOP: 'no',
  GSW: 'gs',
  NYK: 'ny',
  SAS: 'sa',
  WAS: 'wsh',
}

const TEAM_COLORS: Record<string, string> = {
  ATL: '#E03A3E', BOS: '#008348', BKN: '#FFFFFF', CHA: '#1D1160', CHI: '#CE1141',
  CLE: '#6F263D', DAL: '#00538C', DEN: '#0E2240', DET: '#C8102E', GSW: '#1D428A',
  HOU: '#CE1141', IND: '#002D62', LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9',
  MIA: '#98002E', MIL: '#00471B', MIN: '#0C2340', NOP: '#0C2340', NYK: '#F58426',
  OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#E56020', POR: '#E03A3E',
  SAC: '#5A2D81', SAS: '#C4CED4', TOR: '#CE1141', UTA: '#002B5C', WAS: '#002B5C',
}

function normalizeTeamCode(value: string): string {
  const code = value.trim().toUpperCase()
  return code === 'NO' ? 'NOP' : code === 'SA' ? 'SAS' : code === 'UTAH' ? 'UTA' : code === 'WSH' ? 'WAS' : code === 'NY' ? 'NYK' : code === 'GS' ? 'GSW' : code
}

export function teamImageUrl(abbr: string): string {
  const code = abbr.trim().toUpperCase()
  const path = TEAM_CODES[code] ?? code.toLowerCase()
  return `https://a.espncdn.com/i/teamlogos/nba/500/${path}.png`
}

export function teamColor(abbr: string): string {
  return TEAM_COLORS[normalizeTeamCode(abbr)] ?? '#64748B'
}

export function TeamLogo({ abbr, size = 32, className = '' }: { abbr: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const code = normalizeTeamCode(abbr) || 'NBA'
  return <span
    className={`team-logo ${className}`}
    style={{ width: size, height: size, '--team-color': teamColor(code) } as CSSProperties}
    title={code}
    aria-label={`${code} team logo`}
  >
    {!failed && code !== 'NBA'
      ? <img src={teamImageUrl(code)} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <b>{code}</b>}
  </span>
}

export function PlayerAvatar({ playerId, name, teamAbbr = 'POR', size = 52, className = '' }: {
  playerId?: string | number
  name: string
  teamAbbr?: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(!playerId)
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'NBA'
  return <span
    className={`player-avatar ${className}`}
    style={{ width: size, height: size, '--team-color': teamColor(teamAbbr) } as CSSProperties}
    title={name}
    aria-label={`${name} portrait`}
  >
    {!failed && playerId
      ? <img src={`https://a.espncdn.com/i/headshots/nba/players/full/${encodeURIComponent(String(playerId))}.png`} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <b>{initials}</b>}
  </span>
}
