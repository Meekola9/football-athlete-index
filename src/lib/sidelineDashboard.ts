// ---------------------------------------------------------------------------
// Sideline dashboard — the six in-game numbers plus the auto alerts a coach
// manages the game from. Everything here is derived from already-tagged data
// (film plays + impact/havoc events); nothing new is invented.
//
// Convention for a charted game: FilmPlay.side is read from OUR perspective —
// 'offense' = we have the ball, 'defense' = the opponent has the ball. `gain`
// is yards for whoever ran the play (positive downfield). Plays with no `side`
// are treated as our offense (the common default when charting our own tape).
// ---------------------------------------------------------------------------
import type { FilmPlay, PlayEvent } from '../types'
import { buildTendencyReport, distanceBucket, DISTANCE_BUCKET_LABEL, labelFor } from './filmAnalysis'
import { PLAY_TYPE_BY_KEY } from './impact'

/** Tunable thresholds (high-school defaults). */
export const SIDELINE_DEFAULTS = {
  /** Success = gain ≥ this share of the distance, by down. */
  successByDown: { 1: 0.5, 2: 0.7, 3: 1, 4: 1 } as Record<number, number>,
  explosiveRunYds: 12,
  explosivePassYds: 16,
  /** A run into ≤ this many box defenders counts as a light-box (advantage) run. */
  lightBox: 6,
}

function isOffense(play: FilmPlay): boolean {
  return (play.side ?? 'offense') === 'offense'
}
function isDefense(play: FilmPlay): boolean {
  return play.side === 'defense'
}
function isPassCall(call?: string): boolean {
  return call === 'pass' || call === 'screen'
}
function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Did the play gain enough for the down/distance? null when we can't tell. */
export function playSuccess(play: FilmPlay): boolean | null {
  if (!num(play.down) || !num(play.distance) || !num(play.gain)) return null
  const share = SIDELINE_DEFAULTS.successByDown[play.down] ?? 1
  return play.gain >= share * play.distance
}

export function isExplosive(play: FilmPlay): boolean {
  if (!num(play.gain)) return false
  const need = isPassCall(play.call) ? SIDELINE_DEFAULTS.explosivePassYds : SIDELINE_DEFAULTS.explosiveRunYds
  return play.gain >= need
}

export interface SidelineNumber {
  key: string
  label: string
  /** Formatted value for the tile (e.g. "58%", "+4", "-12 yds"). */
  display: string
  /** Raw numeric for sorting/coloring; sign is "good for us". */
  value: number
  /** How many plays fed it — 0 means "no data yet". */
  sample: number
  hint: string
}

export interface SidelineAlert {
  key: string
  label: string
  detail: string
}

export interface SidelineReport {
  opponent?: string
  offensiveSnaps: number
  defensiveSnaps: number
  numbers: SidelineNumber[]
  alerts: SidelineAlert[]
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

/** Build the six numbers + the two auto alerts for a game (optionally one opponent). */
export function buildSidelineReport(
  filmPlays: FilmPlay[],
  plays: PlayEvent[],
  opponent?: string,
): SidelineReport {
  const gamePlays = opponent ? filmPlays.filter((p) => (p.opponent ?? '') === opponent) : filmPlays
  const scrimmage = gamePlays.filter((p) => p.call !== 'special')
  const offense = scrimmage.filter(isOffense)
  const defense = scrimmage.filter(isDefense)
  const measuredOffense = offense.filter((p) => num(p.gain))
  const measuredDefense = defense.filter((p) => num(p.gain))
  const explosiveOffense = measuredOffense.filter((p) => Boolean(p.call))
  const explosiveDefense = measuredDefense.filter((p) => Boolean(p.call))
  const hasExplosiveMargin = explosiveOffense.length > 0 && explosiveDefense.length > 0
  const hasNegativeMargin = measuredOffense.length > 0 && measuredDefense.length > 0

  // 1. Offensive success rate
  const scored = offense.map(playSuccess).filter((s): s is boolean => s !== null)
  const successRate = scored.length ? scored.filter(Boolean).length / scored.length : 0

  // 2. Explosive-play margin (ours on offense − allowed on defense)
  const ourExplosive = explosiveOffense.filter(isExplosive).length
  const allowedExplosive = explosiveDefense.filter(isExplosive).length
  const explosiveMargin = ourExplosive - allowedExplosive

  // 3. Negative-play margin (forced on defense − suffered on offense)
  const forcedNeg = defense.filter((p) => num(p.gain) && p.gain! < 0).length
  const ourNeg = offense.filter((p) => num(p.gain) && p.gain! < 0).length
  const negativeMargin = forcedNeg - ourNeg

  // 4. Box-count / run advantage — share of our runs into a light box
  const ourRuns = offense.filter((p) => !isPassCall(p.call) && p.call && p.call !== 'special' && num(p.boxCount))
  const lightBoxRuns = ourRuns.filter((p) => (p.boxCount as number) <= SIDELINE_DEFAULTS.lightBox).length
  const runAdvantage = ourRuns.length ? lightBoxRuns / ourRuns.length : 0

  // 5. Defensive havoc rate — positive havoc events / our defensive snaps
  const gameEvents = opponent ? plays.filter((p) => (p.opponent ?? '') === opponent) : plays
  const havocEvents = gameEvents.filter((p) => {
    const t = PLAY_TYPE_BY_KEY.get(p.type)
    return t?.category === 'havoc' && (t?.points ?? 0) > 0
  }).length
  const havocRate = defense.length ? havocEvents / defense.length : 0

  // 6. Hidden-yardage margin — sum of signed hidden yards (already our-favor)
  const hiddenPlays = gamePlays.filter((p) => num(p.hiddenYards))
  const hiddenMargin = hiddenPlays.reduce((sum, p) => sum + (p.hiddenYards as number), 0)

  const numbers: SidelineNumber[] = [
    {
      key: 'success', label: 'Offensive success rate',
      display: scored.length ? pct(successRate) : '—', value: successRate, sample: scored.length,
      hint: '≥50% of the yards on 1st, 70% on 2nd, 100% on 3rd/4th',
    },
    {
      key: 'explosive', label: 'Explosive-play margin',
      display: hasExplosiveMargin ? signed(explosiveMargin) : '—', value: explosiveMargin, sample: hasExplosiveMargin ? explosiveOffense.length + explosiveDefense.length : 0,
      hint: `runs ≥${SIDELINE_DEFAULTS.explosiveRunYds}, passes ≥${SIDELINE_DEFAULTS.explosivePassYds}; ours − allowed. Requires call and gain on both sides`,
    },
    {
      key: 'negative', label: 'Negative-play margin',
      display: hasNegativeMargin ? signed(negativeMargin) : '—', value: negativeMargin, sample: hasNegativeMargin ? measuredOffense.length + measuredDefense.length : 0,
      hint: 'plays behind the line: forced on defense − suffered on offense. Requires gain on both sides',
    },
    {
      key: 'box', label: 'Box / run advantage',
      display: ourRuns.length ? pct(runAdvantage) : '—', value: runAdvantage, sample: ourRuns.length,
      hint: `share of our runs into a light box (≤${SIDELINE_DEFAULTS.lightBox} defenders)`,
    },
    {
      key: 'havoc', label: 'Havoc events per snap',
      display: defense.length ? havocRate.toFixed(2) : '—',
      value: havocRate, sample: defense.length,
      hint: `${havocEvents} positive havoc events / ${defense.length} charted defensive snaps. Separate logs; multiple events may describe one snap.`,
    },
    {
      key: 'hidden', label: 'Hidden-yardage margin',
      display: hiddenPlays.length ? `${signed(Math.round(hiddenMargin))} yds` : '—',
      value: hiddenMargin, sample: hiddenPlays.length,
      hint: 'special teams, penalties, turnover field position (+ in our favor)',
    },
  ]

  return {
    opponent,
    offensiveSnaps: offense.length,
    defensiveSnaps: defense.length,
    numbers,
    alerts: buildAlerts(offense, defense),
  }
}

/** Highest-success formation/concept we ran, and the opponent's strongest lean. */
function buildAlerts(offense: FilmPlay[], defense: FilmPlay[]): SidelineAlert[] {
  const alerts: SidelineAlert[] = []

  // Best offensive matchup — our formation with the best success rate (min 3 snaps).
  const byFormation = new Map<string, { s: number; n: number }>()
  for (const p of offense) {
    if (!p.formation) continue
    const ok = playSuccess(p)
    if (ok === null) continue
    const rec = byFormation.get(p.formation) ?? { s: 0, n: 0 }
    rec.s += ok ? 1 : 0
    rec.n += 1
    byFormation.set(p.formation, rec)
  }
  const best = [...byFormation.entries()]
    .filter(([, r]) => r.n >= 3)
    .map(([k, r]) => ({ k, rate: r.s / r.n, n: r.n }))
    .sort((a, b) => b.rate - a.rate)[0]
  if (best) {
    alerts.push({
      key: 'best-matchup',
      label: 'Best offensive matchup',
      detail: `${labelFor('formation', best.k)} — ${pct(best.rate)} success on ${best.n} snaps. Keep going back to it.`,
    })
  }

  // Strongest opponent tendency — the most lopsided run/pass situation they show.
  if (defense.length >= 4) {
    const report = buildTendencyReport(defense)
    const groups = [...report.byDownDistance, ...report.byFormation]
      .filter((g) => g.plays >= 3)
      .map((g) => ({ g, lean: Math.max(g.runShare, g.passShare) }))
      .sort((a, b) => b.lean - a.lean)[0]
    if (groups && groups.lean >= 0.6) {
      const run = groups.g.runShare >= groups.g.passShare
      alerts.push({
        key: 'opp-tendency',
        label: 'Strongest opponent tendency',
        detail: `${groups.g.label}: ${pct(groups.lean)} ${run ? 'run' : 'pass'} (${groups.g.plays} snaps). Sit on it.`,
      })
    }
  }

  return alerts
}

/** Distance-bucket label helper re-export for the page. */
export function distanceLabel(distance?: number): string {
  const b = distanceBucket(distance)
  return b ? DISTANCE_BUCKET_LABEL[b] : '—'
}
