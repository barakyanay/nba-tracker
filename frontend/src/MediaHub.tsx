import { useEffect, useState } from 'react'
import { CalendarDays, Check, Copy, ExternalLink, ImageDown, Play, Share2, Video, X } from 'lucide-react'
import { latestPlayerGame, type GameRow, type PlayerPayload } from './data'

type CardMode = 'latest' | 'season'

function formatted(value: unknown, digits = 1): string {
  const parsed = Number(value)
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed) ? '—' : parsed.toFixed(digits)
}

function minutesValue(value: unknown): number {
  if (typeof value === 'string' && value.includes(':')) {
    const [minutes, seconds] = value.split(':').map(Number)
    return Number.isFinite(minutes) ? minutes + (Number.isFinite(seconds) ? seconds / 60 : 0) : NaN
  }
  return Number(value)
}

function percentage(value: unknown): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : '—'
}

function createShareImage(mode: CardMode, player: PlayerPayload): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1350
    const context = canvas.getContext('2d')
    if (!context) {
      reject(new Error('Your browser could not create the share graphic.'))
      return
    }

    const game = latestPlayerGame(player.games)
    const stats = mode === 'season' ? player.averages : game ?? player.averages
    const date = mode === 'season'
      ? `${player.season.replace('-', '–')} SEASON`
      : game?.GAME_DATE
        ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(new Date(game.GAME_DATE))
        : 'LATEST GAME'
    const matchup = mode === 'season' ? 'SEASON AVERAGES' : game?.MATCHUP ?? 'PORTLAND TRAIL BLAZERS'
    const fgPct = mode === 'season'
      ? Number(stats.FG_PCT) * 100
      : Number(game?.FGA) > 0 ? (Number(game?.FGM ?? 0) / Number(game?.FGA)) * 100 : NaN
    const threePct = mode === 'season'
      ? Number(stats.FG3_PCT) * 100
      : Number(game?.FG3A) > 0 ? (Number(game?.FG3M ?? 0) / Number(game?.FG3A)) * 100 : NaN
    const minutes = minutesValue(stats.MIN)
    const background = context.createLinearGradient(0, 0, 1080, 1350)
    background.addColorStop(0, '#131b2e')
    background.addColorStop(1, '#0b101b')
    context.fillStyle = background
    context.fillRect(0, 0, 1080, 1350)

    context.fillStyle = '#e11d48'
    context.beginPath()
    context.moveTo(820, 0)
    context.lineTo(1080, 0)
    context.lineTo(1080, 1350)
    context.lineTo(490, 1350)
    context.closePath()
    context.globalAlpha = 0.12
    context.fill()
    context.globalAlpha = 1
    context.fillStyle = '#e11d48'
    context.fillRect(72, 74, 10, 106)
    context.fillStyle = '#eff2f7'
    context.font = '700 31px "Plus Jakarta Sans", Arial, sans-serif'
    context.fillText('DENI AVDIJA', 110, 108)
    context.fillStyle = '#a8afbb'
    context.font = '500 18px Heebo, Arial, sans-serif'
    context.fillText('PORTLAND TRAIL BLAZERS  •  #8', 110, 145)
    context.textAlign = 'right'
    context.fillStyle = '#d5a35b'
    context.font = '600 17px Heebo, Arial, sans-serif'
    context.fillText(date.toUpperCase(), 1008, 102)
    context.fillStyle = '#c1c6d0'
    context.font = '500 18px Heebo, Arial, sans-serif'
    context.fillText(matchup.toUpperCase(), 1008, 137)
    context.textAlign = 'left'

    context.fillStyle = '#f4f6fa'
    context.font = '900 94px "Plus Jakarta Sans", Arial, sans-serif'
    context.fillText(mode === 'season' ? 'SEASON' : 'GAME', 72, 310)
    context.fillStyle = '#e11d48'
    context.fillText(mode === 'season' ? 'AVERAGES' : 'REPORT', 72, 410)

    const heroStats = [
      ['PTS', formatted(stats.PTS, mode === 'season' ? 1 : 0)],
      ['REB', formatted(stats.REB, mode === 'season' ? 1 : 0)],
      ['AST', formatted(stats.AST, mode === 'season' ? 1 : 0)],
    ]
    heroStats.forEach(([label, value], index) => {
      const x = 72 + index * 322
      context.fillStyle = index === 0 ? '#2b1b2b' : '#1a243b'
      context.fillRect(x, 490, 294, 268)
      context.strokeStyle = index === 0 ? '#9a304d' : '#3a4963'
      context.lineWidth = 2
      context.strokeRect(x, 490, 294, 268)
      context.fillStyle = '#9da6b4'
      context.font = '700 21px Heebo, Arial, sans-serif'
      context.fillText(label, x + 24, 540)
      context.fillStyle = '#f4f6fa'
      context.font = '900 100px "Plus Jakarta Sans", Arial, sans-serif'
      context.fillText(value, x + 23, 676)
    })

    const secondary = [
      ['STL', formatted(stats.STL, 0)],
      ['BLK', formatted(stats.BLK, 0)],
      ['FG%', Number.isFinite(fgPct) ? `${fgPct.toFixed(1)}%` : '—'],
      ['3P%', Number.isFinite(threePct) ? `${threePct.toFixed(1)}%` : '—'],
      ['MIN', Number.isFinite(minutes) ? minutes.toFixed(1) : '—'],
    ]
    secondary.forEach(([label, value], index) => {
      const x = 72 + index * 198
      context.fillStyle = '#1a243b'
      context.fillRect(x, 800, 176, 150)
      context.fillStyle = '#8993a2'
      context.font = '700 17px Heebo, Arial, sans-serif'
      context.fillText(label, x + 18, 846)
      context.fillStyle = '#f1f3f6'
      context.font = '800 31px "Plus Jakarta Sans", Arial, sans-serif'
      context.fillText(value, x + 18, 903)
    })

    if (mode === 'latest' && game) {
      const teamScore = Number(game.TEAM_SCORE)
      const opponentScore = Number(game.OPPONENT_SCORE)
      context.fillStyle = '#c4cad4'
      context.font = '600 19px Heebo, Arial, sans-serif'
      context.fillText('FINAL SCORE', 74, 1040)
      context.fillStyle = '#f4f6fa'
      context.font = '800 34px "Plus Jakarta Sans", Arial, sans-serif'
      context.fillText(`${Number.isFinite(teamScore) ? teamScore : '—'}  —  ${Number.isFinite(opponentScore) ? opponentScore : '—'}`, 74, 1092)
      const result = game.WL ?? (Number.isFinite(teamScore) && Number.isFinite(opponentScore) ? teamScore > opponentScore ? 'W' : 'L' : '—')
      context.fillStyle = result === 'W' ? '#1f4539' : '#40262c'
      context.fillRect(840, 1031, 168, 64)
      context.fillStyle = result === 'W' ? '#86dfb5' : '#f0969c'
      context.font = '800 27px "Plus Jakarta Sans", Arial, sans-serif'
      context.textAlign = 'center'
      context.fillText(result === '—' ? 'RESULT —' : result === 'W' ? 'WIN' : 'LOSS', 924, 1072)
      context.textAlign = 'left'
    } else {
      context.fillStyle = '#8792a1'
      context.font = '500 18px Heebo, Arial, sans-serif'
      context.fillText('Regular season per-game averages', 74, 1062)
    }
    context.strokeStyle = '#343b47'
    context.beginPath()
    context.moveTo(72, 1206)
    context.lineTo(1008, 1206)
    context.stroke()
    context.fillStyle = '#9ca5b2'
    context.font = '600 17px Heebo, Arial, sans-serif'
    context.fillText('LIVE NBA ANALYTICS  •  GITHUB PAGES', 72, 1253)
    context.fillStyle = '#e11d48'
    context.fillRect(72, 1285, 936, 4)
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The PNG could not be generated.')), 'image/png')
  })
}

function downloadBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'deni-avdija-stats.png'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DeniShareCard({ player }: { player: PlayerPayload }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<CardMode>('latest')
  const [message, setMessage] = useState('')
  const game = latestPlayerGame(player.games)
  const stats = mode === 'season' ? player.averages : game ?? player.averages
  const date = game?.GAME_DATE ? new Intl.DateTimeFormat('en-IL', { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(new Date(game.GAME_DATE)) : 'Latest game'
  const summary = mode === 'season'
    ? `Deni Avdija: ${formatted(stats.PTS)} PTS, ${formatted(stats.REB)} REB, ${formatted(stats.AST)} AST per game`
    : `${date} ${game?.MATCHUP ?? 'Portland'}: ${formatted(stats.PTS, 0)} נק׳, ${formatted(stats.REB, 0)} ריב׳, ${formatted(stats.AST, 0)} אס׳`

  async function shareImage() {
    setMessage('')
    try {
      const blob = await createShareImage(mode, player)
      const file = new File([blob], 'deni-avdija-stats.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'Deni Avdija Stats', text: summary })
        setMessage('נפתח תפריט השיתוף של המכשיר.')
      } else {
        downloadBlob(blob)
        const text = `${summary} | ${window.location.href}`
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
        setMessage('התמונה הורדה. אפשר לצרף אותה ב-WhatsApp.')
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return
      setMessage(reason instanceof Error ? reason.message : 'לא ניתן לשתף את הכרטיס כרגע.')
    }
  }

  return (
    <>
      <button className="share-card-trigger" dir="rtl" lang="he" onClick={() => { setOpen(true); setMessage('') }}><Share2 size={15} /> שתף כרטיס משחק (WhatsApp / תמונה)</button>
      {open && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
        <section className="share-modal glass-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
          <button className="modal-close" aria-label="Close share card" onClick={() => setOpen(false)}><X size={19} /></button>
          <p className="eyebrow">RIP CITY · SHARE CARD</p><h2 id="share-title">Deni Avdija</h2>
          <div className="share-mode-switch">
            <button dir="rtl" lang="he" className={mode === 'latest' ? 'active' : ''} onClick={() => setMode('latest')}>המשחק האחרון</button>
            <button dir="rtl" lang="he" className={mode === 'season' ? 'active' : ''} onClick={() => setMode('season')}>ממוצעי העונה</button>
          </div>
          <div className="share-preview">
            <div className="share-preview-top"><b>DENI AVDIJA</b><span>{mode === 'season' ? `${player.season} SEASON` : date}</span><small>{mode === 'season' ? 'PORTLAND TRAIL BLAZERS' : game?.MATCHUP ?? 'PORTLAND TRAIL BLAZERS'}</small></div>
            <div className="share-preview-hero">{[['PTS', stats.PTS], ['REB', stats.REB], ['AST', stats.AST]].map(([label, value]) => <div key={String(label)}><small>{String(label)}</small><strong>{formatted(value, mode === 'season' ? 1 : 0)}</strong></div>)}</div>
            <div className="share-preview-secondary">{[['STL', stats.STL], ['BLK', stats.BLK], ['FG%', mode === 'season' ? percentage(stats.FG_PCT) : Number(game?.FGA) > 0 ? `${((Number(game?.FGM ?? 0) / Number(game?.FGA)) * 100).toFixed(1)}%` : '—'], ['3P%', mode === 'season' ? percentage(stats.FG3_PCT) : Number(game?.FG3A) > 0 ? `${((Number(game?.FG3M ?? 0) / Number(game?.FG3A)) * 100).toFixed(1)}%` : '—'], ['MIN', stats.MIN]].map(([label, value]) => <div key={String(label)}><small>{String(label)}</small><b>{String(label) === 'MIN' ? formatted(minutesValue(value)) : formatted(value, typeof value === 'string' ? 0 : 1)}</b></div>)}</div>
            {mode === 'latest' && game && <div className="share-final-score"><span>FINAL SCORE</span><strong>{game.TEAM_SCORE ?? '—'} — {game.OPPONENT_SCORE ?? '—'}</strong><b className={game.WL === 'W' ? 'positive' : 'negative'}>{game.WL ?? '—'}</b></div>}
            <footer>LIVE NBA ANALYTICS · GITHUB PAGES</footer>
          </div>
          <div className="share-actions"><button dir="rtl" lang="he" onClick={async () => { try { downloadBlob(await createShareImage(mode, player)); setMessage('הכרטיס נשמר כתמונה PNG.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'ההורדה נכשלה.') } }}><ImageDown size={16} /> הורד PNG</button><button dir="rtl" lang="he" className="primary-share" onClick={() => void shareImage()}><Share2 size={16} /> שתף ב-WhatsApp</button></div>
          {message && <p className="share-feedback" role="status">{message}</p>}
        </section>
      </div>}
    </>
  )
}

type Highlight = { title: string; link: string; videoId?: string; date: string; description: string }

const CURATED_HIGHLIGHTS: Highlight[] = [
  { title: 'Deni Avdija · Season highlights', link: 'https://www.youtube.com/results?search_query=Deni+Avdija+2025-26+season+highlights', date: 'SEASON EDIT', description: 'Scoring, playmaking and two-way moments' },
  { title: 'Deni Avdija · Portland highlights', link: 'https://www.youtube.com/results?search_query=Deni+Avdija+Portland+Trail+Blazers+highlights', date: 'RIP CITY', description: 'Trail Blazers highlights and best plays' },
  { title: 'Portland Trail Blazers · Game highlights', link: 'https://www.youtube.com/results?search_query=Portland+Trail+Blazers+official+game+highlights', date: 'BLAZERS', description: 'Recent Portland game recaps and plays' },
]

function videoIdFromLink(link: string): string | undefined {
  try {
    const url = new URL(link)
    if (url.searchParams.get('v')) return url.searchParams.get('v') ?? undefined
    return url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]
      ?? (url.hostname === 'youtu.be' ? url.pathname.slice(1) : undefined)
  } catch {
    return undefined
  }
}

export function HighlightsHub({ latestGame }: { latestGame?: GameRow }) {
  const [items, setItems] = useState<Highlight[]>(CURATED_HIGHLIGHTS)
  const [selected, setSelected] = useState<Highlight>(CURATED_HIGHLIGHTS[0])
  const [toast, setToast] = useState('')
  const stats = latestGame
    ? `${formatted(latestGame.PTS, 0)} PTS · ${formatted(latestGame.REB, 0)} REB · ${formatted(latestGame.AST, 0)} AST`
    : 'Portland Trail Blazers · Deni Avdija'

  useEffect(() => {
    const rssUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCXk66yyzXo7-2M1BMqLhltQ'
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`
    const controller = new AbortController()
    void fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Highlights feed is temporarily unavailable.')
        return response.json() as Promise<{ items?: Array<{ title?: string; link?: string; pubDate?: string; description?: string }> }>
      })
      .then((feed) => {
        const clips = (feed.items ?? [])
          .filter((item) => /deni|avdija|blazers|trail blazers/i.test(item.title ?? ''))
          .map((item) => ({
            title: item.title ?? 'Trail Blazers highlight',
            link: item.link ?? 'https://www.youtube.com/@trailblazers/videos',
            videoId: videoIdFromLink(item.link ?? ''),
            date: item.pubDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(item.pubDate)) : 'RECENT',
            description: (item.description ?? '').replace(/<[^>]*>/g, '').slice(0, 120),
          }))
        if (clips.length) {
          setItems([...clips, ...CURATED_HIGHLIGHTS])
          setSelected(clips[0])
        }
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof Error && reason.name === 'AbortError')) setToast('Showing curated searches; the live video feed is unavailable.')
      })
    return () => controller.abort()
  }, [])

  const shareUrl = selected.videoId ? `https://www.youtube.com/watch?v=${selected.videoId}` : selected.link
  const shareText = `היילייטס: ${selected.title}\n${stats}\n${shareUrl}\n${window.location.href}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setToast('הקישור הועתק!')
    } catch {
      setToast('לא ניתן לגשת ללוח. אפשר להעתיק את הקישור מ-YouTube.')
    }
    window.setTimeout(() => setToast(''), 3500)
  }

  return (
    <section className="media-hub">
      <div className="media-heading"><div><p className="eyebrow">PLAY OF THE NIGHT · RIP CITY</p><h2>Highlights &amp; Plays <span dir="rtl" lang="he">(היילייטס ומהלכים)</span></h2></div><Video size={21} /></div>
      <div className="media-feature surface">
        <div className="video-frame">{selected.videoId
          ? <iframe title={selected.title} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selected.videoId)}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
          : <div className="video-placeholder"><span><Play size={22} fill="currentColor" /></span><b>WATCH THE LATEST PLAYS</b><small>Choose a clip below or open the curated YouTube search.</small><a href={selected.link} target="_blank" rel="noreferrer">OPEN ON YOUTUBE <ExternalLink size={13} /></a></div>}
        </div>
        <div className="media-feature-info"><p className="eyebrow">{selected.date} · {selected.title}</p><h3>{selected.title}</h3><p>{stats}</p><div className="media-actions"><a className="media-action" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"><Share2 size={14} /> שתף לחברים ב-WhatsApp</a><button className="media-action" onClick={() => void copyLink()}><Copy size={14} /> העתק קישור</button><a className="media-action" href={selected.link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> YouTube</a></div></div>
      </div>
      <div className="highlight-grid">{items.map((item, index) => <button className={`highlight-card surface ${selected.link === item.link ? 'highlight-card-active' : ''}`} key={`${item.link}-${index}`} onClick={() => { setSelected(item); setToast('') }}><span className="highlight-thumb"><Play size={18} fill="currentColor" /></span><span className="highlight-copy"><small>{item.date} · VIDEO</small><b>{item.title}</b><span>{item.description}</span></span></button>)}</div>
      {toast && <div className="media-toast" role="status"><Check size={14} />{toast}</div>}
      {latestGame?.GAME_DATE && <p className="media-game-search"><CalendarDays size={15} /> Latest game · {latestGame.MATCHUP ?? 'Portland'} · {stats}<a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`Deni Avdija ${latestGame.MATCHUP ?? 'Portland'} ${latestGame.GAME_DATE} Full Highlights`)}`} target="_blank" rel="noreferrer">חפש היילייטס ב-YouTube למשחק זה <ExternalLink size={13} /></a></p>}
    </section>
  )
}

export function GameHighlightLink({ game }: { game: GameRow }) {
  const query = `Deni Avdija ${game.MATCHUP ?? 'Portland'} ${game.GAME_DATE ?? ''} Full Highlights`
  return <a className="game-highlight-link" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer" aria-label={`Watch Deni Avdija highlights: ${query}`}><Play size={12} /> Highlights</a>
}
