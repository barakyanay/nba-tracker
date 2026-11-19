import type { Row } from './data'

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function utcTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function downloadGameCalendarInvite(game: Row): void {
  const start = new Date(String(game.TIP_TIMESTAMP ?? game.GAME_DATE ?? ''))
  if (Number.isNaN(start.getTime())) throw new Error('The game tip-off time is not available yet.')
  const end = new Date(start.getTime() + 150 * 60_000)
  const opponent = String(game.OPPONENT_NAME ?? 'Portland Trail Blazers game')
  const isHome = game.IS_HOME === true
  const summary = `Portland Trail Blazers ${isHome ? 'vs.' : 'at'} ${opponent}`
  const venueParts = [String(game.VENUE ?? ''), String(game.VENUE_CITY ?? ''), String(game.VENUE_STATE ?? '')].filter(Boolean)
  const location = venueParts.join(', ')
  const description = `Portland Trail Blazers\\n${isHome ? 'Home game' : 'Away game'} vs. ${opponent}\\nTip-off shown in your calendar's local time.`
  const uid = `rip-city-${String(game.GAME_ID ?? start.getTime())}@nba-tracker.github.io`
  const now = utcTimestamp(new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rip City Tracker//NBA Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeCalendarText(uid)}`,
    `DTSTAMP:${now}`,
    `DTSTART:${utcTimestamp(start)}`,
    `DTEND:${utcTimestamp(end)}`,
    `SUMMARY:${escapeCalendarText(summary)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    ...(location ? [`LOCATION:${escapeCalendarText(location)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Portland Trail Blazers game starts in 15 minutes',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const safeOpponent = opponent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game'
  anchor.href = url
  anchor.download = `trail-blazers-${safeOpponent}-${start.toISOString().slice(0, 10)}.ics`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
