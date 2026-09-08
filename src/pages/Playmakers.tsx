import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { stepCountUp } from '../lib/animation'
import { useStore } from '../store/useStore'
import { Avatar, Card, Pill, SectionTitle } from '../components/ui'
import { GameDayBadgeArtwork } from '../components/GameDayBadges'
import GameImpactImport from '../components/GameImpactImport'
import GameScores from '../components/GameScores'
import {
  HAVOC_TYPES,
  HAVOC_NEGATIVES,
  PLAYMAKER_TYPES,
  PLAYMAKER_NEGATIVES,
  PLAY_TYPE_BY_KEY,
  buildImpact,
  type AthleteImpact,
} from '../lib/impact'
import {
  NEGATIVE_GAME_DAY_BADGES,
  POSITIVE_GAME_DAY_BADGES,
  activeTeamGameDayBadgeAwards,
  athleteGameDayBadgeSummary,
  gameDayBadgeForType,
  isGameDayBadgeType,
} from '../lib/gameDayBadges'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

// Jagged lightning-bolt shapes drawn in a 0–100 box.
const BOLT_PATHS = [
  '50,0 43,24 57,28 38,52 58,56 44,80 52,100',
  '52,0 60,22 46,26 62,50 44,54 58,78 48,100',
  '48,0 42,20 56,24 40,46 60,52 46,74 54,100',
  '50,0 58,26 44,30 60,54 42,58 56,82 50,100',
]

function Bolt({
  leftPct,
  color,
  delay,
  scale,
}: {
  leftPct: number
  color: string
  delay: number
  scale: number
}) {
  const path = BOLT_PATHS[Math.floor(leftPct) % BOLT_PATHS.length]
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      className="animate-bolt pointer-events-none absolute top-0 h-full"
      style={{
        left: `${leftPct}%`,
        width: `${18 * scale}%`,
        transform: 'translateX(-50%)',
        animationDelay: `${delay}s`,
        filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 14px ${color})`,
      }}
    >
      <polyline points={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      <polyline points={path} fill="none" stroke="#ffffff" strokeWidth={0.9} strokeLinejoin="round" />
    </svg>
  )
}

const BOLT_COLORS = ['#38bdf8', '#a855f7', '#22d3ee', '#818cf8', '#60a5fa']

/** Animate a number up to its target with an ease-out; snaps for reduced-motion. */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    const from = fromRef.current
    const reduce =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || from === target) {
      setValue(target)
      fromRef.current = target
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = (now - start) / durationMs
      setValue(stepCountUp(from, target, progress))
      if (progress < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])
  return value
}

function HavocMeter({ total, fill, plays }: { total: number; fill: number; plays: number }) {
  const shown = useCountUp(total)
  const boltCount = 3 + Math.min(5, Math.floor(total / 8))
  const bolts = Array.from({ length: boltCount }, (_, index) => ({
    leftPct: 8 + (index * 84) / Math.max(1, boltCount - 1),
    color: BOLT_COLORS[index % BOLT_COLORS.length],
    delay: (index * 0.27) % 1.6,
    scale: 0.75 + ((index * 37) % 60) / 100,
  }))
  return (
    <div className="relative overflow-hidden rounded-2xl border border-down/30 bg-gradient-to-b from-[#160a12] to-[#0a0710] p-5">
      <div className="field-grid absolute inset-0 opacity-60" aria-hidden />
      <div className="animate-pulse-layer absolute inset-0" aria-hidden>
        {total > 0 && bolts.map((bolt, index) => <Bolt key={index} {...bolt} />)}
      </div>
      <div className="pointer-events-none absolute -inset-8 animate-volt bg-[radial-gradient(circle_at_50%_45%,rgba(239,68,68,0.22),transparent_62%)]" aria-hidden />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-down">⚡ Havoc Meter</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Defense · Chaos</span>
        </div>
        <div className="mt-6 text-center">
          <div className="relative inline-block">
            <div className="animate-volt absolute inset-0 -z-0 blur-2xl" style={{ background: 'radial-gradient(circle,#38bdf8,transparent 70%)', opacity: 0.5 }} aria-hidden />
            <div className="nums relative text-7xl font-black leading-none text-chalk drop-shadow-[0_0_18px_rgba(56,189,248,0.55)]">
              {shown}
            </div>
          </div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-muted">Chaos Created</div>
        </div>

        <div className="relative mt-6 h-3 w-full overflow-hidden rounded-full border border-line bg-black/50">
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-down/70 via-[#38bdf8] to-[#a855f7] transition-[width] duration-700 ease-out"
            style={{ width: `${clamp(fill, 0.04, 1) * 100}%` }}
          >
            <div className="animate-charge absolute inset-0 text-white/70" />
            <div className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_4px_rgba(56,189,248,0.9)]" />
          </div>
        </div>
        <div className="mt-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
          {plays} defensive impact {plays === 1 ? 'event' : 'events'} logged
        </div>
      </div>
    </div>
  )
}

function PlaymakerMeter({ total, fill, plays }: { total: number; fill: number; plays: number }) {
  const shown = useCountUp(total)
  // Paparazzi camera flashes — scattered, staggered bright pops for the stars.
  const flashes = Array.from({ length: 12 }, (_, index) => ({
    left: `${(index * 37 + 7) % 92}%`,
    top: `${(index * 53 + 11) % 82}%`,
    delay: `${((index * 41) % 220) / 100}s`,
    size: 6 + ((index * 13) % 12),
  }))
  return (
    <div className="relative overflow-hidden rounded-2xl border border-up/30 bg-gradient-to-b from-[#07140c] to-[#050b09] p-5">
      <div className="field-grid absolute inset-0 opacity-60" aria-hidden />
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        {total > 0 &&
          flashes.map((flash, index) => (
            <span
              key={index}
              className="animate-flash absolute rounded-full"
              style={{
                left: flash.left,
                top: flash.top,
                width: `${flash.size}px`,
                height: `${flash.size}px`,
                background:
                  'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0.65) 35%, transparent 70%)',
                animationDelay: flash.delay,
                filter: 'drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 12px rgba(34,197,94,0.8))',
              }}
            />
          ))}
      </div>
      <div className="pointer-events-none absolute -inset-8 animate-volt bg-[radial-gradient(circle_at_50%_45%,rgba(34,197,94,0.2),transparent_62%)]" aria-hidden />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-up">🚀 Playmaker Meter</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Offense · ST</span>
        </div>
        <div className="mt-6 text-center">
          <div className="relative inline-block">
            <div className="animate-volt absolute inset-0 -z-0 blur-2xl" style={{ background: 'radial-gradient(circle,#22c55e,transparent 70%)', opacity: 0.5 }} aria-hidden />
            <div className="nums relative text-7xl font-black leading-none text-chalk drop-shadow-[0_0_18px_rgba(34,197,94,0.55)]">
              {shown}
            </div>
          </div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-muted">Playmaker Points</div>
        </div>

        <div className="relative mt-6 h-3 w-full overflow-hidden rounded-full border border-line bg-black/50">
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-up/70 via-up to-[#a3e635] transition-[width] duration-700 ease-out"
            style={{ width: `${clamp(fill, 0.04, 1) * 100}%` }}
          >
            <div className="animate-charge absolute inset-0 text-white/70" />
            <div className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_4px_rgba(34,197,94,0.9)]" />
          </div>
        </div>
        <div className="mt-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
          {plays} offensive impact {plays === 1 ? 'event' : 'events'} logged
        </div>
      </div>
    </div>
  )
}

function HeroStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-center">
      <div className={`nums text-4xl font-black leading-none ${tone}`}>{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{label}</div>
    </div>
  )
}

function ContributorChips({ items, pointsOf, tone }: { items: AthleteImpact[]; pointsOf: (i: AthleteImpact) => number; tone: string }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {items.slice(0, 4).map((item, index) => (
        <Link
          key={item.athlete.id}
          to={`/athletes/${item.athlete.id}`}
          className="flex items-center gap-2 rounded-full border border-line bg-panel-2/60 py-1 pl-1 pr-3 transition hover:border-fai/40"
        >
          <span className={`grid h-6 w-6 place-items-center rounded-full bg-black/50 text-[11px] font-black ${tone}`}>{index + 1}</span>
          <Avatar name={item.athlete.name} photoUrl={item.athlete.photoUrl} size={22} />
          <span className="text-xs font-bold text-chalk">{item.athlete.name.split(' ').slice(-1)[0]}</span>
          <span className={`text-xs font-black nums ${tone}`}>{pointsOf(item)}</span>
        </Link>
      ))}
    </div>
  )
}

function LevelCard({ item, rank }: { item: AthleteImpact; rank: number }) {
  const { level } = item
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-b from-panel-2/70 to-panel p-4">
      <div className="flex items-center gap-3">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-gold/50 bg-gradient-to-b from-gold/25 to-gold/5 text-gold">
          <span className="text-[8px] font-bold uppercase leading-none tracking-wider">Lvl</span>
          <span className="text-2xl font-black leading-none">{level.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-muted">#{rank}</span>
            <Link to={`/athletes/${item.athlete.id}`} className="truncate text-sm font-black text-chalk hover:text-fai">
              {item.athlete.name}
            </Link>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            {item.havocPoints > 0 && <Pill tone="down">💥 {item.havocPoints}</Pill>}
            {item.playmakerPoints > 0 && <Pill tone="up">⚡ {item.playmakerPoints}</Pill>}
            {item.boostPct > 0 && <Pill tone="gold">📈 +{item.boostPct}% overall</Pill>}
            {item.efficiencyBoostPct > 0 && <Pill tone="up">🎯 {item.efficiency}% positive impact · +{item.efficiencyBoostPct}%</Pill>}
            {item.efficiencyBoostPct < 0 && <Pill tone="down">🎯 {item.efficiency}% positive impact · {item.efficiencyBoostPct}%</Pill>}
            <span title="Positive points divided by the total magnitude of positive and negative points; based only on logged impact events.">{item.playCount} logged events</span>
            {item.negativePoints > 0 && <Pill tone="down">⚠️ −{item.negativePoints}</Pill>}
          </div>
        </div>
        <div className="text-right">
          <div className="nums text-2xl font-black text-fai">{item.totalPoints}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted">pts</div>
        </div>
      </div>
      <div className="relative mt-3 h-2 w-full overflow-hidden rounded-full bg-black/50">
        <div className="h-full rounded-full bg-gradient-to-r from-fai to-gold" style={{ width: `${Math.round(level.progress * 100)}%` }} />
        <div className="animate-shine absolute inset-y-0 w-8 skew-x-12 bg-white/25" />
      </div>
      <div className="mt-1 text-right text-[10px] text-muted">
        {level.next > level.floor
          ? `${item.totalPoints - level.floor}/${level.next - level.floor} to Lvl ${level.level + 1}`
          : 'Max level'}
      </div>
    </div>
  )
}

export default function Playmakers() {
  const { data, canEdit, addPlay, deletePlay } = useStore()
  const summary = useMemo(() => buildImpact(data.plays, data.athletes), [data.plays, data.athletes])

  const [athleteId, setAthleteId] = useState('')
  const [playType, setPlayType] = useState(HAVOC_TYPES[0].key)
  const [date, setDate] = useState(todayIso())
  const [opponent, setOpponent] = useState('')

  const roster = useMemo(() => [...data.athletes].sort((a, b) => a.name.localeCompare(b.name)), [data.athletes])
  const athleteById = useMemo(() => new Map(data.athletes.map((a) => [a.id, a])), [data.athletes])
  const impactPlays = useMemo(() => data.plays.filter((play) => !isGameDayBadgeType(play.type)), [data.plays])
  const badgePlays = useMemo(() => data.plays.filter((play) => isGameDayBadgeType(play.type)), [data.plays])
  const activeBadgeAwards = useMemo(
    () => activeTeamGameDayBadgeAwards(data.plays, data.athletes),
    [data.plays, data.athletes],
  )
  const seasonBadgeLeaders = useMemo(
    () => data.athletes
      .map((athlete) => ({ athlete, summary: athleteGameDayBadgeSummary(data.plays, athlete.id, 2026) }))
      .filter((item) => item.summary.seasonTotal > 0)
      .sort((a, b) => b.summary.seasonTotal - a.summary.seasonTotal || a.athlete.name.localeCompare(b.athlete.name)),
    [data.athletes, data.plays],
  )
  const recentLogs = useMemo(
    () => [...data.plays]
      .sort((a, b) => `${b.date}${b.createdAt ?? ''}`.localeCompare(`${a.date}${a.createdAt ?? ''}`))
      .slice(0, 16),
    [data.plays],
  )

  const havocLeaders = summary.athletes.filter((item) => item.havocPoints > 0).sort((a, b) => b.havocPoints - a.havocPoints || a.athlete.name.localeCompare(b.athlete.name))
  const playLeaders = [...summary.athletes]
    .filter((item) => item.playmakerPoints > 0)
    .sort((a, b) => b.playmakerPoints - a.playmakerPoints)

  const scale = Math.max(summary.teamHavoc, summary.teamPlaymaker, 20)
  const havocPlays = impactPlays.filter((play) => PLAY_TYPE_BY_KEY.get(play.type)?.category === 'havoc').length
  const playmakerPlays = impactPlays.length - havocPlays
  const selectedBadge = gameDayBadgeForType(playType)

  function logPlay() {
    if (!athleteId) return
    addPlay({ athleteId, type: playType, date, opponent: opponent.trim() || undefined })
    setOpponent('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-chalk">
          Playmakers <span className="text-down">&amp;</span> Havoc
        </h1>
        <div className="mt-1 text-xs text-muted">Make plays. Create chaos. Earn game-day badges.</div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-panel/70 px-4 py-4 sm:grid-cols-4">
        <HeroStat label="Havoc Pts" value={summary.teamHavoc} tone="text-down" />
        <HeroStat label="Playmaker Pts" value={summary.teamPlaymaker} tone="text-up" />
        <HeroStat label="Impact Plays" value={impactPlays.length} tone="text-fai" />
        <HeroStat label="Game Badges" value={badgePlays.length} tone="text-gold" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <HavocMeter total={summary.teamHavoc} fill={summary.teamHavoc / scale} plays={havocPlays} />
          <ContributorChips items={havocLeaders} pointsOf={(item) => item.havocPoints} tone="text-down" />
        </div>
        <div className="space-y-3">
          <PlaymakerMeter total={summary.teamPlaymaker} fill={summary.teamPlaymaker / scale} plays={playmakerPlays} />
          <ContributorChips items={playLeaders} pointsOf={(item) => item.playmakerPoints} tone="text-up" />
        </div>
      </div>

      <GameScores />

      {canEdit && (
        <Card className="p-5">
          <SectionTitle>Log a Play or Award a Badge</SectionTitle>
          <div className="mt-2 text-xs leading-relaxed text-muted">
            Game-day badges stay visible for seven days and remain in the 2026 season total. Badge awards do not change impact points.
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              value={athleteId}
              onChange={(event) => setAthleteId(event.target.value)}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold text-chalk outline-none focus:border-fai"
            >
              <option value="">Select athlete…</option>
              {roster.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>{athlete.name}</option>
              ))}
            </select>
            <select
              value={playType}
              onChange={(event) => setPlayType(event.target.value)}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold text-chalk outline-none focus:border-fai"
            >
              <optgroup label="Positive game-day badges">
                {POSITIVE_GAME_DAY_BADGES.map((badge) => (
                  <option key={badge.key} value={badge.key}>{badge.name} — {badge.earnedBy}</option>
                ))}
              </optgroup>
              <optgroup label="Negative game-day badges">
                {NEGATIVE_GAME_DAY_BADGES.map((badge) => (
                  <option key={badge.key} value={badge.key}>{badge.name} — {badge.earnedBy}</option>
                ))}
              </optgroup>
              <optgroup label="Havoc (defense)">
                {HAVOC_TYPES.map((play) => (
                  <option key={play.key} value={play.key}>{play.emoji} {play.label} (+{play.points})</option>
                ))}
              </optgroup>
              <optgroup label="Defensive mistakes">
                {HAVOC_NEGATIVES.map((play) => (
                  <option key={play.key} value={play.key}>{play.emoji} {play.label} ({play.points})</option>
                ))}
              </optgroup>
              <optgroup label="Playmaker (offense / ST)">
                {PLAYMAKER_TYPES.map((play) => (
                  <option key={play.key} value={play.key}>{play.emoji} {play.label} (+{play.points})</option>
                ))}
              </optgroup>
              <optgroup label="Offensive mistakes">
                {PLAYMAKER_NEGATIVES.map((play) => (
                  <option key={play.key} value={play.key}>{play.emoji} {play.label} ({play.points})</option>
                ))}
              </optgroup>
            </select>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold text-chalk outline-none focus:border-fai"
            />
            <input
              value={opponent}
              onChange={(event) => setOpponent(event.target.value)}
              placeholder="Opponent (optional)"
              className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold text-chalk outline-none placeholder:text-muted focus:border-fai"
            />
          </div>
          {selectedBadge && (
            <div className={`mt-3 flex items-center gap-3 rounded-xl border p-3 ${selectedBadge.tone === 'positive' ? 'border-fai/25 bg-fai/5' : 'border-down/30 bg-down/5'}`}>
              <GameDayBadgeArtwork badge={selectedBadge} size={48} />
              <div>
                <div className="text-sm font-black text-chalk">{selectedBadge.name}</div>
                <div className="text-xs text-muted">{selectedBadge.earnedBy}</div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={logPlay}
            disabled={!athleteId}
            className="mt-3 rounded-lg bg-fai px-5 py-2 text-sm font-bold text-ink disabled:opacity-40"
          >
            {selectedBadge ? '+ Award Game-Day Badge' : '+ Log Play'}
          </button>
        </Card>
      )}

      {canEdit && <GameImpactImport />}

      <Card className="p-5">
        <SectionTitle>Active Game-Day Badges · This Week</SectionTitle>
        <div className="mb-3 text-xs text-muted">Awards disappear from the active display after seven days, but remain in the season count.</div>
        {activeBadgeAwards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-panel-2/25 p-5 text-center text-sm text-muted">No badges are active this week.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeBadgeAwards.map((award) => (
              <Link
                key={award.play.id}
                to={`/athletes/${award.athlete.id}`}
                className={`flex items-center gap-3 rounded-xl border p-3 transition hover:border-fai/50 ${award.badge.tone === 'positive' ? 'border-fai/25 bg-fai/5' : 'border-down/30 bg-down/5'}`}
              >
                <GameDayBadgeArtwork badge={award.badge} size={56} />
                <div className="min-w-0 flex-1">
                  <div className={`text-[10px] font-black uppercase tracking-wider ${award.badge.tone === 'positive' ? 'text-fai' : 'text-down'}`}>{award.badge.name}</div>
                  <div className="truncate text-sm font-black text-chalk">{award.athlete.name}</div>
                  <div className="text-[11px] text-muted">{award.play.date}{award.play.opponent ? ` · vs ${award.play.opponent}` : ''}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle>2026 Game-Day Badge Totals</SectionTitle>
        <div className="mb-3 text-xs text-muted">Season count includes every positive and negative badge awarded.</div>
        {seasonBadgeLeaders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-panel-2/25 p-5 text-center text-sm text-muted">No 2026 game-day badges have been awarded.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seasonBadgeLeaders.map(({ athlete, summary: badgeSummary }, index) => (
              <Link key={athlete.id} to={`/athletes/${athlete.id}`} className="rounded-xl border border-line bg-panel-2/35 p-3 transition hover:border-fai/40">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-black/40 text-sm font-black nums text-muted">{index + 1}</span>
                  <Avatar name={athlete.name} photoUrl={athlete.photoUrl} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-chalk">{athlete.name}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      <span className="text-fai">{badgeSummary.positiveTotal} positive</span> · <span className="text-down">{badgeSummary.negativeTotal} negative</span>
                    </div>
                  </div>
                  <div className="text-2xl font-black nums text-gold">{badgeSummary.seasonTotal}</div>
                </div>
                <div className="mt-2 flex -space-x-1">
                  {badgeSummary.seasonCounts.slice(0, 5).map((item) => (
                    <GameDayBadgeArtwork key={item.badge.key} badge={item.badge} size={32} />
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle>Level Up</SectionTitle>
        <div className="mb-3 text-xs text-muted">Every athlete ranked by total impact points earned. Game-day badges are tracked separately.</div>
        {summary.athletes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-panel-2/30 p-6 text-center text-sm text-muted">
            No impact plays logged yet.{canEdit ? ' Use “Log a Play or Award a Badge” above to charge up the meters.' : ''}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.athletes.map((item, index) => (
              <LevelCard key={item.athlete.id} item={item} rank={index + 1} />
            ))}
          </div>
        )}
      </Card>

      {canEdit && recentLogs.length > 0 && (
        <Card className="p-5">
          <SectionTitle>Recent Plays &amp; Badge Awards</SectionTitle>
          <div className="mt-3 space-y-1.5">
            {recentLogs.map((play) => {
              const badge = gameDayBadgeForType(play.type)
              const type = PLAY_TYPE_BY_KEY.get(play.type)
              const athlete = athleteById.get(play.athleteId)
              const points = type?.points ?? 0
              const isNegative = badge ? badge.tone === 'negative' : points < 0
              return (
                <div
                  key={play.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isNegative ? 'bg-down/10 ring-1 ring-inset ring-down/20' : 'bg-panel-2/40'}`}
                >
                  {badge ? <GameDayBadgeArtwork badge={badge} size={34} /> : <span className="text-base">{type?.emoji ?? '•'}</span>}
                  <span className="font-bold text-chalk">{athlete?.name ?? 'Unknown'}</span>
                  <span className="text-muted">{badge?.name ?? type?.label ?? play.type}</span>
                  <span className="text-xs text-muted">
                    {badge ? (
                      <span className={`font-bold ${badge.tone === 'positive' ? 'text-fai' : 'text-down'}`}>Game-day badge</span>
                    ) : (
                      <span className={`font-bold ${isNegative ? 'text-down' : 'text-up'}`}>{points >= 0 ? `+${points}` : points}</span>
                    )}{' '}
                    · {play.date}{play.opponent ? ` · vs ${play.opponent}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => deletePlay(play.id)}
                    className="ml-auto rounded-md border border-line px-2 py-0.5 text-xs font-bold text-muted hover:border-down/40 hover:text-down"
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
