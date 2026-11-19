import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpRight, Info, Shield, Sparkles, Target } from 'lucide-react'
import type { GameRow, PlayerPayload, Row } from './data'
import { PlayerAvatar } from './Visuals'

function finite(value: unknown): number | null {
  const parsed = Number(value)
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed) ? null : parsed
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null)
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null
}

function boxGameScore(game: GameRow): number | null {
  const pts = finite(game.PTS)
  if (pts === null) return null
  const fgm = finite(game.FGM)
  const fga = finite(game.FGA)
  const ftm = finite(game.FTM)
  const fta = finite(game.FTA)
  return pts + .4 * (fgm ?? 0) - .7 * (fga ?? 0) - .4 * Math.max(0, (fta ?? 0) - (ftm ?? 0))
    + .7 * (finite(game.OREB) ?? 0) + .3 * (finite(game.DREB) ?? 0)
    + (finite(game.STL) ?? 0) + .7 * (finite(game.AST) ?? 0) + .7 * (finite(game.BLK) ?? 0)
    - .4 * (finite(game.PF) ?? 0) - (finite(game.TOV) ?? 0)
}

function gameTs(game: GameRow): number | null {
  const points = finite(game.PTS)
  const attempts = finite(game.FGA)
  const freeThrows = finite(game.FTA)
  if (points === null || attempts === null) return null
  const denominator = 2 * (attempts + .44 * (freeThrows ?? 0))
  return denominator > 0 ? points / denominator : null
}

function signed(value: number | null, digits = 1): string {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`
}

function pct(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

export function ScoutingReport({ player }: { player: PlayerPayload | null }) {
  const averages = player?.averages ?? {}
  const recent = (player?.games ?? []).filter((game) => game.MIN !== 'DNP' && finite(game.PTS) !== null).slice(0, 5)
  const recentPoints = average(recent.map((game) => finite(game.PTS)))
  const recentRebounds = average(recent.map((game) => finite(game.REB)))
  const recentAssists = average(recent.map((game) => finite(game.AST)))
  const recentMinutes = average(recent.map((game) => finite(game.MIN)))
  const recentTs = average(recent.map(gameTs))
  const recentScore = average(recent.map(boxGameScore))
  const recentTov = recent.reduce((sum, game) => sum + (finite(game.TOV) ?? 0), 0)
  const recentAst = recent.reduce((sum, game) => sum + (finite(game.AST) ?? 0), 0)
  const recentAstTo = recentTov > 0 ? recentAst / recentTov : null
  const deltas = {
    points: recentPoints === null || finite(averages.PTS) === null ? null : recentPoints - Number(averages.PTS),
    rebounds: recentRebounds === null || finite(averages.REB) === null ? null : recentRebounds - Number(averages.REB),
    assists: recentAssists === null || finite(averages.AST) === null ? null : recentAssists - Number(averages.AST),
    minutes: recentMinutes === null || finite(averages.MIN) === null ? null : recentMinutes - Number(averages.MIN),
  }
  const tsBaseline = finite(averages.TS_PCT)
  const seasonAstTo = finite(averages.AST_TO)
  const insights = [
    deltas.points === null
      ? 'נתוני הניקוד האחרונים עדיין לא מספיקים להשוואה.'
      : Math.abs(deltas.points) < .75
        ? `הניקוד יציב: ${recentPoints!.toFixed(1)} נק׳ למשחק בחמשת המשחקים האחרונים, כמעט בדיוק בקצב העונתי.`
        : deltas.points > 0
          ? `מגמת ניקוד חיובית: ${recentPoints!.toFixed(1)} נק׳ בחמשת המשחקים האחרונים, ${deltas.points.toFixed(1)} מעל ממוצע העונה.`
          : `הניקוד התמתן: ${Math.abs(deltas.points).toFixed(1)} נק׳ פחות מממוצע העונה בחמשת המשחקים האחרונים.`,
    recentTs === null
      ? 'יעילות הקליעה תופיע עם הצטברות נתוני זריקות מלאים.'
      : tsBaseline === null
        ? `אחוז TS משוקלל בחמשת המשחקים האחרונים: ${pct(recentTs)}.`
        : recentTs >= tsBaseline + .025
          ? `יעילות הקליעה במגמת עלייה: TS של ${pct(recentTs)} בחמשת האחרונים, מעל ${pct(tsBaseline)} בעונה.`
          : recentTs <= tsBaseline - .025
            ? `יעילות הקליעה למעקב: TS של ${pct(recentTs)} בחמשת האחרונים, מתחת ל-${pct(tsBaseline)} בעונה.`
            : `יעילות יציבה: TS של ${pct(recentTs)} בחמשת המשחקים האחרונים, קרוב לבסיס העונתי.`,
    deltas.assists === null
      ? 'עומס ניהול המשחק יתבהר עם עוד נתוני משחק.'
      : `יצירת מצבים: ${recentAssists!.toFixed(1)} אס׳ למשחק בחמשת האחרונים (${signed(deltas.assists)} מול העונה)${recentAstTo !== null ? `, יחס אס׳/איבודים ${recentAstTo.toFixed(2)}` : ''}${seasonAstTo !== null ? ` לעומת ${seasonAstTo.toFixed(2)} בעונה` : ''}.`,
    deltas.rebounds === null
      ? 'תרומת הריבאונד תתעדכן לאחר משחקים נוספים.'
      : deltas.rebounds >= 1
        ? `נוכחות חזקה בריבאונד: ${recentRebounds!.toFixed(1)} למשחק, ${deltas.rebounds.toFixed(1)} מעל ממוצע העונה.`
        : deltas.rebounds <= -1
          ? `נקודת מעקב: ${Math.abs(deltas.rebounds).toFixed(1)} ריבאונדים פחות מממוצע העונה בחמשת האחרונים.`
          : `תרומת הריבאונד קרובה לבסיס העונתי (${recentRebounds!.toFixed(1)} למשחק לאחרונה).`,
  ]
  const reportStats = [
    { label: 'GAME SCORE · LAST 5', value: recentScore?.toFixed(1) ?? '—' },
    { label: 'TRUE SHOOTING · LAST 5', value: pct(recentTs) },
    { label: 'AST / TO · LAST 5', value: recentAstTo?.toFixed(2) ?? '—' },
    { label: 'LAST 5 VS BASELINE · PTS', value: signed(deltas.points) },
  ]
  const ready = recent.length > 0
  return <section className="scouting-report surface" dir="rtl">
    <div className="scouting-heading"><span className="scouting-icon"><Sparkles size={17} /></span><div><p className="eyebrow">DENI AVDIJA · DATA-DRIVEN</p><h2>ניתוח סקאוטינג אוטומטי</h2></div><span className="scouting-sample">{ready ? `${recent.length} משחקים במדגם` : 'ממתין לנתונים'}</span></div>
    <div className="scouting-metrics" dir="ltr">{reportStats.map((stat) => <div key={stat.label}><small>{stat.label}</small><b>{stat.value}</b></div>)}</div>
    {ready ? <ul className="scouting-insights">{insights.map((insight, index) => <li key={index}><span>{index === 0 ? <Activity size={14} /> : index === 1 ? <Target size={14} /> : index === 2 ? <ArrowUpRight size={14} /> : <Shield size={14} />}</span><p>{insight}</p></li>)}</ul> : <p className="scouting-empty">דוח הסקאוטינג יתעדכן אוטומטית עם טעינת יומן המשחקים.</p>}
    <div className="scouting-method"><Info size={13} /><span>Game Score לפי נוסחת Hollinger; TS% מחושב מזריקות שדה וזריקות עונשין. ניתוח אינפורמטיבי, לא תחזית.</span></div>
  </section>
}

const LINEUP_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
type LineupPosition = (typeof LINEUP_POSITIONS)[number]

const POSITION_MATCH: Record<LineupPosition, RegExp> = {
  PG: /PG|point guard/i,
  SG: /SG|shooting guard/i,
  SF: /SF|small forward/i,
  PF: /PF|power forward/i,
  C: /C|center/i,
}

function initialLineup(roster: Row[]): string[] {
  const unused = [...roster]
  return LINEUP_POSITIONS.map((position) => {
    const index = unused.findIndex((player) => POSITION_MATCH[position].test(String(player.POSITION ?? '')))
    const selected = unused.splice(index >= 0 ? index : 0, 1)[0]
    return selected ? String(selected.PLAYER_ID ?? selected.PLAYER) : ''
  })
}

export function LineupBuilder({ roster, loading }: { roster: Row[]; loading: boolean }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  useEffect(() => {
    if (roster.length && !selectedIds.length) setSelectedIds(initialLineup(roster))
  }, [roster, selectedIds.length])

  const lineup = useMemo(() => LINEUP_POSITIONS.map((position, index) => ({
    position,
    player: roster.find((item) => String(item.PLAYER_ID ?? item.PLAYER) === selectedIds[index]),
  })), [roster, selectedIds])
  const selected = lineup.flatMap((slot) => slot.player ? [slot.player] : [])
  const sumStat = (key: string) => selected.reduce((total, player) => total + (finite(player[key]) ?? 0), 0)
  const validThrees = selected.map((player) => finite(player.FG3_PCT)).filter((value): value is number => value !== null)
  const spacing = average(validThrees)
  const points = sumStat('PTS')
  const rebounds = sumStat('REB')
  const assists = sumStat('AST')
  const steals = sumStat('STL')
  const blocks = sumStat('BLK')
  const defensiveEstimate = selected.length === 5
    ? Math.max(96, Math.min(125, 115 - steals * .75 - blocks * .65 - (rebounds - 35) * .12))
    : null

  function changePlayer(index: number, id: string) {
    setSelectedIds((current) => LINEUP_POSITIONS.map((_, slot) => slot === index ? id : current[slot] ?? ''))
  }

  return <section className="lineup-builder surface">
    <div className="lineup-heading"><div><p className="eyebrow">PORTLAND · LINEUP LAB</p><h2>בונה חמישיות <span>· LINEUP BUILDER</span></h2></div><span className="lineup-count">{selected.length}/5 PLAYERS</span></div>
    <p className="lineup-intro" dir="rtl">בחרו חמישה שחקנים מסגל פורטלנד והרכיבו חמישייה. התחזיות מבוססות על ממוצעי העונה הזמינים.</p>
    {roster.length ? <>
      <div className="lineup-court" role="group" aria-label="Starting lineup positions">
        <div className="court-key"><span>FRONT COURT</span><span>BACK COURT</span></div>
        <div className="court-arc" />
        <div className="lineup-slots">{lineup.map(({ position, player }, index) => <label className="lineup-slot" key={position}>
          <span className="lineup-position">{position}</span>
          {player ? <PlayerAvatar playerId={String(player.PLAYER_ID ?? '')} name={String(player.PLAYER ?? 'Player')} teamAbbr="POR" size={49} /> : <span className="lineup-empty-avatar">+</span>}
          <select aria-label={`Select ${position} player`} value={selectedIds[index] ?? ''} onChange={(event) => changePlayer(index, event.target.value)}>
            <option value="">Select player</option>
            {roster.filter((item) => !selectedIds.some((id, slot) => slot !== index && id === String(item.PLAYER_ID ?? item.PLAYER))).map((item) => <option key={String(item.PLAYER_ID ?? item.PLAYER)} value={String(item.PLAYER_ID ?? item.PLAYER)}>{String(item.PLAYER ?? 'Player')}</option>)}
          </select>
        </label>)}</div>
        <div className="court-center-circle" />
      </div>
      <div className="lineup-metrics" dir="ltr">
        <div><small>PROJECTED OFFENSE</small><b>{selected.length ? points.toFixed(1) : '—'}</b><span>combined PPG</span></div>
        <div><small>REBOUND POWER</small><b>{selected.length ? rebounds.toFixed(1) : '—'}</b><span>REB per game</span></div>
        <div><small>PLAYMAKING INDEX</small><b>{selected.length ? assists.toFixed(1) : '—'}</b><span>AST per game</span></div>
        <div><small>3-POINT SPACING</small><b>{spacing === null ? '—' : `${(spacing * 100).toFixed(1)}%`}</b><span>mean roster 3P%</span></div>
        <div><small>DEFENSIVE RATING*</small><b>{defensiveEstimate === null ? '—' : defensiveEstimate.toFixed(1)}</b><span>estimated team proxy</span></div>
      </div>
      <p className="lineup-method"><Info size={13} /> *Estimated defensive rating proxy (lower is better), derived from lineup steals, blocks and rebounds. Not an official NBA rating.</p>
    </> : <div className="lineup-empty">{loading ? 'Loading the Portland roster and player averages…' : 'Portland roster data is unavailable. Try refreshing ESPN data.'}</div>}
  </section>
}
