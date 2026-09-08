// ---------------------------------------------------------------------------
// Progress tracking, official rankings, and event-specific result selection.
// ---------------------------------------------------------------------------

import type {
  AthleteResult,
  Category,
  ComputedSession,
} from '../types'
import { METRICS_BY_CATEGORY, SCORED_METRICS } from '../data/scoring'
import { CATEGORIES } from '../data/constants'
import { athleteTimeline, clamp, round1 } from './compute'

export type Trend = 'improved' | 'same' | 'regressed'

export interface MetricProgress {
  key: string
  label: string
  category: Category
  unit: string
  higherBetter: boolean
  previousRaw?: number
  currentRaw?: number
  rawImprovement?: number
  previousScore?: number
  currentScore?: number
  scoreImprovement?: number
  trend: Trend
}

export interface CategoryProgress {
  category: Category
  previous?: number
  current?: number
  improvement: number
  trend: Trend
}

export interface AthleteProgress {
  metrics: MetricProgress[]
  categories: CategoryProgress[]
  biggestImprovement?: MetricProgress
  biggestWeakness?: CategoryProgress
  suggestedFocus?: Category
}

const EPSILON = 0.05

function trendFrom(improvement: number | undefined, epsilon = EPSILON): Trend {
  if (improvement === undefined) return 'same'
  if (improvement > epsilon) return 'improved'
  if (improvement < -epsilon) return 'regressed'
  return 'same'
}

export function computeProgress(
  current: ComputedSession,
  previous?: ComputedSession,
): AthleteProgress {
  const metrics: MetricProgress[] = SCORED_METRICS.map((metric) => {
    const currentRaw = current.metrics[metric.key]
    const previousRaw = previous?.metrics[metric.key]
    const currentScore = current.normalized[metric.key]
    const previousScore = previous?.normalized[metric.key]

    let rawImprovement: number | undefined
    if (typeof currentRaw === 'number' && typeof previousRaw === 'number') {
      rawImprovement = metric.higherBetter
        ? currentRaw - previousRaw
        : previousRaw - currentRaw
      rawImprovement = round1000(rawImprovement)
    }

    const scoreImprovement =
      typeof currentScore === 'number' && typeof previousScore === 'number'
        ? round1(currentScore - previousScore)
        : undefined

    return {
      key: metric.key,
      label: metric.label,
      category: metric.category,
      unit: metric.unit,
      higherBetter: metric.higherBetter,
      previousRaw,
      currentRaw,
      rawImprovement,
      previousScore,
      currentScore,
      scoreImprovement,
      trend: trendFrom(rawImprovement, 0),
    }
  })

  const categories: CategoryProgress[] = CATEGORIES.map((category) => {
    const hasCurrent = METRICS_BY_CATEGORY(category).some(
      (metric) => typeof current.normalized[metric.key] === 'number',
    )
    const hasPrevious = previous
      ? METRICS_BY_CATEGORY(category).some(
          (metric) => typeof previous.normalized[metric.key] === 'number',
        )
      : false
    const currentValue = hasCurrent ? current.categories[category] : undefined
    const previousValue = hasPrevious ? previous?.categories[category] : undefined
    const improvement =
      typeof currentValue === 'number' && typeof previousValue === 'number'
        ? round1(currentValue - previousValue)
        : 0
    return {
      category,
      previous: previousValue,
      current: currentValue,
      improvement,
      trend: trendFrom(improvement),
    }
  })

  const comparable = metrics.filter(
    (metric) => typeof metric.scoreImprovement === 'number',
  )
  const biggestImprovement = comparable.length
    ? comparable.reduce((best, metric) =>
        (metric.scoreImprovement ?? -Infinity) > (best.scoreImprovement ?? -Infinity)
          ? metric
          : best,
      )
    : undefined

  const scoredCategories = categories.filter(
    (category) => typeof category.current === 'number',
  )
  const biggestWeakness = scoredCategories.length
    ? scoredCategories.reduce((worst, category) =>
        (category.current ?? Infinity) < (worst.current ?? Infinity) ? category : worst,
      )
    : undefined

  return {
    metrics,
    categories,
    biggestImprovement:
      biggestImprovement && (biggestImprovement.scoreImprovement ?? 0) > 0
        ? biggestImprovement
        : undefined,
    biggestWeakness,
    suggestedFocus: biggestWeakness?.category,
  }
}

export function strengths(current: ComputedSession, threshold = 60): Category[] {
  return CATEGORIES.filter((category) => {
    const hasData = METRICS_BY_CATEGORY(category).some(
      (metric) => typeof current.normalized[metric.key] === 'number',
    )
    return hasData && current.categories[category] >= threshold
  }).sort((a, b) => current.categories[b] - current.categories[a])
}

export function weaknesses(current: ComputedSession, threshold = 45): Category[] {
  return CATEGORIES.filter((category) => {
    const hasData = METRICS_BY_CATEGORY(category).some(
      (metric) => typeof current.normalized[metric.key] === 'number',
    )
    return hasData && current.categories[category] < threshold
  }).sort((a, b) => current.categories[a] - current.categories[b])
}

/**
 * Build current results or reconstruct a historical event leaderboard.
 * Only complete scores receive official team and position-group ranks.
 */
export function buildResults(
  computed: ComputedSession[],
  eventId?: string,
  boostByAthlete?: Map<string, number>,
  awarenessBoostByAthlete?: Map<string, number>,
  efficiencyBoostByAthlete?: Map<string, number>,
): AthleteResult[] {
  const athleteIds = new Set(computed.map((result) => result.session.athleteId))
  const results: AthleteResult[] = []

  for (const athleteId of athleteIds) {
    const timeline = athleteTimeline(computed, athleteId)
    if (!timeline.length) continue
    const currentIndex = eventId
      ? timeline.findIndex((result) => result.event.id === eventId)
      : timeline.length - 1
    if (currentIndex < 0) continue

    const baseCurrent = timeline[currentIndex]
    const previous = currentIndex > 0 ? timeline[currentIndex - 1] : undefined

    // A Playmaker/Havoc level and a high awareness-quiz score each lift the
    // athlete's overall FAI. Stack both on the tested base and bake the result
    // into current.fai so every ranking and display picks it up, keeping the base.
    const impactBoostPct = boostByAthlete?.get(athleteId) ?? 0
    const awarenessBoostPct = awarenessBoostByAthlete?.get(athleteId) ?? 0
    // Efficiency is signed — it can lift or reduce the overall.
    const efficiencyBoostPct = efficiencyBoostByAthlete?.get(athleteId) ?? 0
    const totalBoostPct = impactBoostPct + awarenessBoostPct + efficiencyBoostPct
    const baseFai = baseCurrent.fai
    const current =
      totalBoostPct !== 0
        ? { ...baseCurrent, fai: round1(clamp(baseFai * (1 + totalBoostPct / 100), 0, 100)) }
        : baseCurrent

    // Improvement stays measured on base FAI so it reflects testing, not the boost.
    const faiImprovement = previous ? round1(baseFai - previous.fai) : 0
    const faiImprovementPct =
      previous && previous.fai > 0
        ? round1((faiImprovement / previous.fai) * 100)
        : 0
    const rankEligible = current.scoreStatus === 'complete'

    results.push({
      athlete: current.athlete,
      current,
      previous,
      faiImprovement,
      faiImprovementPct,
      teamRank: 0,
      teamCount: 0,
      groupRank: 0,
      groupCount: 0,
      rankEligible,
      baseFai,
      impactBoostPct,
      awarenessBoostPct,
      efficiencyBoostPct,
    })
  }

  return rankResults(results)
}

/** Assign official ranks within the supplied roster scope. Mutates only these result objects. */
export function rankResults(results: AthleteResult[]): AthleteResult[] {
  const eligible = results
    .filter((result) => result.rankEligible)
    .sort((a, b) => b.current.fai - a.current.fai)
  eligible.forEach((result, index) => {
    result.teamRank = index + 1
    result.teamCount = eligible.length
  })

  const groups = new Map<string, AthleteResult[]>()
  for (const result of eligible) {
    const group = result.current.session.positionGroupSnapshot ?? result.athlete.positionGroup
    const list = groups.get(group) ?? []
    list.push(result)
    groups.set(group, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.current.fai - a.current.fai)
    list.forEach((result, index) => {
      result.groupRank = index + 1
      result.groupCount = list.length
    })
  }

  return results.sort((a, b) => {
    if (a.rankEligible !== b.rankEligible) return a.rankEligible ? -1 : 1
    return b.current.fai - a.current.fai
  })
}

function round1000(value: number): number {
  return Math.round(value * 1000) / 1000
}
