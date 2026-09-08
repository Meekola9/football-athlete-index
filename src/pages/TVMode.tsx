import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { ALL_LEADERBOARDS, positionGroupBoards, type LeaderRow } from '../lib/leaderboards'
import type { AthleteResult } from '../types'
import { Avatar } from '../components/ui'
import { rosterForScope, resultsForRoster, ROSTER_SEASON_ID } from '../lib/rosterScope'
import { OverallRatingName } from '../components/OverallRatingName'

const ROTATE_MS = 9000

function trendGlyph(v: number, hasPrev: boolean) {
  if (!hasPrev) return { g: '—', c: 'text-flat' }
  if (v > 0.05) return { g: '▲', c: 'text-up' }
  if (v < -0.05) return { g: '▼', c: 'text-down' }
  return { g: '—', c: 'text-flat' }
}

interface Slide {
  id: string
  title: string
  subtitle: string
  rows: (results: AthleteResult[]) => LeaderRow[]
  metricLabel: string
  official: boolean
  groups?: boolean
}

const boardRows = (id: string) => (results: AthleteResult[]) => {
  // Defensive: a stale/renamed board id must never blank the whole TV screen.
  const board = ALL_LEADERBOARDS.find((item) => item.id === id)
  return board ? board.rows(results) : []
}

const SLIDE_DEFS: Slide[] = [
  {
    id: 'fai',
    title: 'Overall FAI',
    subtitle: 'Official · complete testing batteries only',
    rows: boardRows('fai'),
    metricLabel: 'FAI',
    official: true,
  },
  {
    id: 'improved',
    title: 'Most Improved',
    subtitle: 'Official FAI gains · complete batteries only',
    rows: boardRows('improved'),
    metricLabel: 'FAI Gain',
    official: true,
  },
  {
    id: 'best40',
    title: 'Fastest 40',
    subtitle: 'Available measurements · partial batteries included',
    rows: boardRows('test-best40'),
    metricLabel: '40 Dash',
    official: false,
  },
  {
    id: 'bestFly',
    title: 'Fastest 10 Fly',
    subtitle: 'Available measurements · partial batteries included',
    rows: boardRows('test-bestFly'),
    metricLabel: '10 Fly',
    official: false,
  },
  {
    id: 'topSpeed',
    title: 'Top Speed',
    subtitle: 'MPH from the best 10-yard fly · partial batteries included',
    rows: boardRows('test-topSpeed'),
    metricLabel: 'MPH',
    official: false,
  },
  {
    id: 'bench',
    title: 'Best Bench',
    subtitle: 'Available measurements · partial batteries included',
    rows: boardRows('test-benchMax'),
    metricLabel: 'Bench',
    official: false,
  },
  {
    id: 'squat',
    title: 'Best Squat',
    subtitle: 'Available measurements · partial batteries included',
    rows: boardRows('test-squatMax'),
    metricLabel: 'Squat',
    official: false,
  },
  {
    id: 'powerClean',
    title: 'Best Power Clean',
    subtitle: 'Available measurements · partial batteries included',
    rows: boardRows('test-powerCleanMax'),
    metricLabel: 'Power Clean',
    official: false,
  },
  {
    id: 'broad',
    title: 'Best Broad Jump',
    subtitle: 'Available measurements · partial batteries included',
    rows: boardRows('test-broadJump'),
    metricLabel: 'Broad',
    official: false,
  },
  {
    id: 'vert',
    title: 'Best Vertical',
    subtitle: 'Available measurements · partial batteries included',
    rows: boardRows('test-verticalJump'),
    metricLabel: 'Vertical',
    official: false,
  },
  {
    id: 'shuttle',
    title: 'Best Shuttle',
    subtitle: 'Available measurements · partial batteries included',
    rows: boardRows('test-best20Shuttle'),
    metricLabel: '20 Shuttle',
    official: false,
  },
  {
    id: 'cond',
    title: 'Best Conditioning',
    subtitle: 'Available category measurements · partial batteries included',
    rows: boardRows('conditioning'),
    metricLabel: 'COND',
    official: false,
  },
  {
    id: 'groups',
    title: 'Position Group Leaders',
    subtitle: 'Official · complete testing batteries only',
    rows: () => [],
    metricLabel: 'FAI',
    official: true,
    groups: true,
  },
]

export default function TVMode() {
  const { data, resultsForEvent } = useStore()
  const results = useMemo(() => resultsForRoster(resultsForEvent(ROSTER_SEASON_ID), rosterForScope(data.athletes, data.sessions)), [data.athletes, data.sessions, resultsForEvent])
  const nav = useNavigate()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const slides = useMemo(() => SLIDE_DEFS.filter((slide) => {
    if (slide.groups) return positionGroupBoards(results).length > 0
    return slide.rows(results).length > 0
  }), [results])

  const slide = slides[index] ?? slides[0]

  const advance = useCallback(
    (dir: 1 | -1) => setIndex((current) => (current + dir + slides.length) % slides.length),
    [slides.length],
  )

  useEffect(() => {
    if (paused || slides.length <= 1) return
    const timer = setInterval(() => setIndex((current) => (current + 1) % slides.length), ROTATE_MS)
    return () => clearInterval(timer)
  }, [paused, slides.length])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') advance(1)
      else if (event.key === 'ArrowLeft') advance(-1)
      else if (event.key === ' ') { event.preventDefault(); setPaused((current) => !current) }
      else if (event.key === 'Escape') nav('/')
      else if (event.key.toLowerCase() === 'f') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, nav])

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  if (!results.length || !slide) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink text-center">
        <div>
          <div className="text-2xl font-black text-muted">No data to display</div>
          <button onClick={() => nav('/data')} className="mt-4 rounded-lg bg-fai px-5 py-2 font-bold text-ink">
            Load Data
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1400px_700px_at_50%_-10%,rgba(34,211,238,0.14),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-fai via-flame to-fai" />

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-xl border-2 border-fai/50 bg-fai/10 text-xl font-black text-fai">
              FAI
            </div>
            <div>
              <div className="text-[13px] font-bold uppercase tracking-[0.35em] text-fai">
                Football Athlete Index
              </div>
              <div className="text-4xl font-black leading-none tracking-tight text-chalk 2xl:text-5xl">
                {slide.title}
              </div>
              <div className="mt-1 text-sm font-semibold uppercase tracking-widest text-muted">
                {slide.subtitle}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {slides.map((item, slideIndex) => (
                <button
                  key={item.id}
                  onClick={() => setIndex(slideIndex)}
                  className={`h-2 rounded-full transition-all ${
                    slideIndex === index ? 'w-8 bg-fai' : 'w-2 bg-line hover:bg-muted'
                  }`}
                  aria-label={item.title}
                />
              ))}
            </div>
            <button onClick={() => setPaused((current) => !current)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-muted hover:text-chalk">
              {paused ? '▶ Play' : '❚❚ Pause'}
            </button>
            <button onClick={toggleFullscreen} className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-muted hover:text-chalk">
              ⛶ Full
            </button>
            <button onClick={() => nav('/')} className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-muted hover:text-chalk">
              ✕ Exit
            </button>
          </div>
        </div>

        <div key={slide.id} className="animate-slide mt-6 flex-1">
          {slide.groups ? (
            <GroupGrid results={results} />
          ) : (
            <LeaderGrid rows={slide.rows(results)} metricLabel={slide.metricLabel} official={slide.official} />
          )}
        </div>

        <div className="mt-4 text-center text-xs font-semibold uppercase tracking-widest text-muted/60">
          ← → change board · space to pause · F fullscreen · Esc exit
        </div>
      </div>
    </div>
  )
}

function BigCard({
  row,
  rank,
  metricLabel,
  official,
}: {
  row: LeaderRow
  rank: number
  metricLabel: string
  official: boolean
}) {
  const { gradeLabelFor } = useStore()
  const result = row.result
  const athlete = result.athlete
  const trend = trendGlyph(result.faiImprovement, !!result.previous)
  const podium = rank <= 3
  const position = athlete.position
  const group = athlete.positionGroup

  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border px-5 py-4 ${
        rank === 1
          ? 'border-gold/50 bg-gradient-to-r from-gold/15 to-transparent'
          : podium
            ? 'border-fai/40 bg-fai/5'
            : 'border-line bg-panel/70'
      }`}
    >
      <div
        className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl text-2xl font-black nums ${
          rank === 1 ? 'bg-gold/25 text-gold' : podium ? 'bg-fai/20 text-fai' : 'bg-panel-2 text-muted'
        }`}
      >
        {rank}
      </div>
      <Avatar name={athlete.name} photoUrl={athlete.photoUrl} size={56} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-2xl font-black tracking-tight text-chalk">{athlete.name}</div>
        <div className="text-sm font-semibold uppercase tracking-wide text-muted">
          {position} · {group} · {gradeLabelFor(athlete)}
        </div>
        <div className="mt-0.5 text-xs font-semibold text-muted/80">
          {official
            ? `Team #${result.teamRank} · ${group} #${result.groupRank}`
            : `${result.rankEligible ? 'Complete battery' : 'Partial battery'} · available measurement`}
        </div>
      </div>
      {official && metricLabel !== 'FAI' && (
        <div className="hidden text-right sm:block">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted">FAI</div>
          <div className="text-2xl font-black nums text-fai">{result.current.fai.toFixed(1)}</div>
          <div className="mt-1 flex justify-end"><OverallRatingName score={result.current.fai} compact /></div>
          <div className={`mt-1 text-sm font-black nums ${trend.c}`}>
            {trend.g} {result.previous ? `${result.faiImprovement >= 0 ? '+' : ''}${result.faiImprovement.toFixed(1)}` : ''}
          </div>
        </div>
      )}
      <div className="w-28 shrink-0 text-right">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{metricLabel}</div>
        <div className="text-3xl font-black nums text-chalk">{row.display}</div>
      </div>
    </div>
  )
}

function LeaderGrid({ rows, metricLabel, official }: { rows: LeaderRow[]; metricLabel: string; official: boolean }) {
  const top = rows.slice(0, 10)
  const left = top.slice(0, 5)
  const right = top.slice(5, 10)
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-3">
        {left.map((row) => (
          <BigCard key={row.result.athlete.id} row={row} rank={row.rank} metricLabel={metricLabel} official={official} />
        ))}
      </div>
      <div className="space-y-3">
        {right.map((row) => (
          <BigCard key={row.result.athlete.id} row={row} rank={row.rank} metricLabel={metricLabel} official={official} />
        ))}
      </div>
    </div>
  )
}

function GroupGrid({ results }: { results: AthleteResult[] }) {
  const { gradeLabelFor } = useStore()
  const boards = positionGroupBoards(results)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => {
        const leader = board.rows[0]
        const athlete = leader.result.athlete
        const trend = trendGlyph(leader.result.faiImprovement, !!leader.result.previous)
        return (
          <div key={board.group} className="rounded-2xl border border-line bg-panel/70 p-5">
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-flame/20 px-3 py-1 text-lg font-black text-flame">{board.group}</span>
              <span className="text-xs font-semibold uppercase text-muted">{board.rows.length} athletes</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={athlete.name} photoUrl={athlete.photoUrl} size={52} />
              <div className="min-w-0">
                <div className="truncate text-xl font-black text-chalk">{athlete.name}</div>
                <div className="text-xs font-semibold uppercase text-muted">
                  {athlete.position} · {gradeLabelFor(athlete)}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">FAI</div>
                <div className="text-4xl font-black nums text-fai">{leader.result.current.fai.toFixed(1)}</div>
                <div className="mt-1"><OverallRatingName score={leader.result.current.fai} compact /></div>
              </div>
              <div className={`text-lg font-black nums ${trend.c}`}>
                {trend.g} {leader.result.previous ? `${leader.result.faiImprovement >= 0 ? '+' : ''}${leader.result.faiImprovement.toFixed(1)}` : ''}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
