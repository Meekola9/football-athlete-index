export type OverallRatingTone = 'legend' | 'dawg' | 'difference' | 'developing' | 'building' | 'needs-work'

export interface OverallRatingBand {
  id: string
  label: string
  rangeLabel: string
  min: number
  tone: OverallRatingTone
  description: string
}

/**
 * Coach-facing names for the overall 0–100 FAI score.
 *
 * Score thresholds and internal tone ids remain stable so existing card colors,
 * filters, and stored data are unaffected by public label changes.
 */
export const OVERALL_RATING_BANDS: readonly OverallRatingBand[] = [
  {
    id: 'one-of-a-kind',
    label: 'One of a Kind',
    rangeLabel: '96–100',
    min: 96,
    tone: 'legend',
    description: 'A rare, complete testing profile at the top of the FAI scale.',
  },
  {
    id: 'dawg',
    label: 'X Factor',
    rangeLabel: '90 to <96',
    min: 90,
    tone: 'dawg',
    description: 'An exceptional athlete whose complete profile can consistently change a game.',
  },
  {
    id: 'difference-maker',
    label: 'Superstar',
    rangeLabel: '80 to <90',
    min: 80,
    tone: 'difference',
    description: 'A high-level athlete with multiple traits that create a clear on-field advantage.',
  },
  {
    id: 'developing-talent',
    label: 'Star',
    rangeLabel: '70 to <80',
    min: 70,
    tone: 'developing',
    description: 'A strong athletic foundation with clear impact traits and room for continued growth.',
  },
  {
    id: 'building-block',
    label: 'Normal',
    rangeLabel: '65 to <70',
    min: 65,
    tone: 'building',
    description: 'A functional overall profile that meets the normal FAI performance range.',
  },
  {
    id: 'needs-work',
    label: 'Needs Work',
    rangeLabel: 'Below 65',
    min: 0,
    tone: 'needs-work',
    description: 'The current testing profile has multiple areas that need focused development.',
  },
] as const

export function overallRatingFor(score: number): OverallRatingBand {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0
  return OVERALL_RATING_BANDS.find((band) => safeScore >= band.min) ?? OVERALL_RATING_BANDS.at(-1)!
}
