import { normalizePosition } from '../data/positions'
import type { Athlete, PositionGroup } from '../types'

export type LineupUnit = 'offense' | 'defense' | 'special'

export interface LineupSlot {
  id: string
  label: string
  group: PositionGroup
  acceptedPositions: string[]
  acceptedGroups?: PositionGroup[]
}

export interface LineupScheme {
  id: string
  name: string
  unit: LineupUnit
  description: string
  rows: LineupSlot[][]
}

export interface LineupAssignment {
  slot: LineupSlot
  athlete: Athlete
  rating: number
  fit: number
  fitLabel: 'Natural' | 'Secondary' | 'Group fit' | 'Athlete fit'
}

export type LineupOverrides = Record<string, string>

const slot = (
  id: string,
  label: string,
  group: PositionGroup,
  acceptedPositions: string[],
  acceptedGroups?: PositionGroup[],
): LineupSlot => ({ id, label, group, acceptedPositions, acceptedGroups })

export const LINEUP_SCHEMES: LineupScheme[] = [
  {
    id: 'offense-spread-11',
    name: 'Spread 11 Personnel',
    unit: 'offense',
    description: 'Four eligible receivers, five offensive linemen, one back, and the quarterback.',
    rows: [
      [
        slot('x', 'X', 'WR', ['X', 'WR']),
        slot('h', 'H / Slot', 'WR', ['H', 'Slot WR', 'WR']),
        slot('y', 'Y', 'TE', ['Y', 'TE', 'B Back']),
        slot('z', 'Z', 'WR', ['Z', 'WR']),
      ],
      [
        slot('lt', 'LT', 'OL', ['LT', 'OL']),
        slot('lg', 'LG', 'OL', ['LG', 'OL']),
        slot('c', 'C', 'OL', ['C', 'OL']),
        slot('rg', 'RG', 'OL', ['RG', 'OL']),
        slot('rt', 'RT', 'OL', ['RT', 'OL']),
      ],
      [
        slot('qb', 'QB', 'QB', ['QB']),
        slot('rb', 'RB', 'RB', ['RB', 'HB', 'FB']),
      ],
    ],
  },
  {
    id: 'offense-power-12',
    name: 'Power 12 Personnel',
    unit: 'offense',
    description: 'Two-tight-end power structure with a balanced five-man offensive line.',
    rows: [
      [
        slot('x', 'X', 'WR', ['X', 'WR']),
        slot('y1', 'Y', 'TE', ['Y', 'TE']),
        slot('y2', 'B Back', 'TE', ['B Back', 'TE', 'FB'], ['TE', 'RB']),
        slot('z', 'Z', 'WR', ['Z', 'WR']),
      ],
      [
        slot('lt', 'LT', 'OL', ['LT', 'OL']),
        slot('lg', 'LG', 'OL', ['LG', 'OL']),
        slot('c', 'C', 'OL', ['C', 'OL']),
        slot('rg', 'RG', 'OL', ['RG', 'OL']),
        slot('rt', 'RT', 'OL', ['RT', 'OL']),
      ],
      [
        slot('qb', 'QB', 'QB', ['QB']),
        slot('rb', 'RB', 'RB', ['RB', 'HB', 'FB']),
      ],
    ],
  },
  {
    id: 'defense-425',
    name: '4–2–5 Hybrid',
    unit: 'defense',
    description: 'Four-man front with Mike and Will inside, plus Star, Rover, and Badger hybrids.',
    rows: [
      [
        slot('bcb', 'Boundary CB', 'DB', ['Boundary Corner', 'CB']),
        slot('badger', 'Badger / FS', 'DB', ['Badger', 'FS', 'Safety']),
        slot('rover', 'Rover', 'DB', ['Rover', 'SS', 'Nickel'], ['DB', 'LB']),
        slot('fcb', 'Field CB', 'DB', ['Field Corner', 'CB']),
      ],
      [
        slot('star', 'Star', 'LB', ['Star', 'Nickel', 'OLB'], ['LB', 'DB']),
        slot('mike', 'Mike', 'LB', ['Mike', 'MLB', 'ILB', 'LB']),
        slot('will', 'Will', 'LB', ['Will', 'MLB', 'ILB', 'LB']),
      ],
      [
        slot('jack', 'Jack / Edge', 'DL', ['Jack', 'EDGE', 'DE']),
        slot('dt', 'DT', 'DL', ['DT', 'DL']),
        slot('nt', 'NT', 'DL', ['NT', 'DT', 'DL']),
        slot('de', 'DE', 'DL', ['DE', 'EDGE', 'DL']),
      ],
    ],
  },
  {
    id: 'defense-base-34',
    name: 'Base 3–4',
    unit: 'defense',
    description: 'Three down linemen, four linebackers, two corners, and two safeties.',
    rows: [
      [
        slot('cb1', 'CB1', 'DB', ['Boundary Corner', 'CB']),
        slot('fs', 'FS', 'DB', ['FS', 'Badger', 'Safety']),
        slot('ss', 'SS', 'DB', ['SS', 'Rover', 'Safety']),
        slot('cb2', 'CB2', 'DB', ['Field Corner', 'CB']),
      ],
      [
        slot('rolb', 'ROLB', 'LB', ['OLB', 'Sam', 'Star', 'LB']),
        slot('mlb1', 'MLB1', 'LB', ['Mike', 'MLB', 'ILB', 'LB']),
        slot('mlb2', 'MLB2', 'LB', ['Will', 'MLB', 'ILB', 'LB']),
        slot('lolb', 'LOLB', 'LB', ['OLB', 'Will', 'Star', 'LB']),
      ],
      [
        slot('re', 'RE', 'DL', ['DE', 'EDGE', 'Jack', 'DL']),
        slot('nt', 'NT', 'DL', ['NT', 'DT', 'DL']),
        slot('le', 'LE', 'DL', ['DE', 'EDGE', 'DL']),
      ],
    ],
  },
  {
    id: 'special-core',
    name: 'Core Specialists',
    unit: 'special',
    description: 'Primary kicking specialists and the most dangerous return options.',
    rows: [
      [
        slot('k', 'K', 'K/P', ['K', 'Kicker']),
        slot('p', 'P', 'K/P', ['P', 'Punter']),
        slot('ls', 'LS', 'K/P', ['LS', 'Long Snapper'], ['K/P', 'OL', 'TE']),
      ],
      [
        slot('kr', 'KR', 'ATH', ['KR', 'Kick Returner'], ['WR', 'RB', 'DB', 'ATH']),
        slot('pr', 'PR', 'ATH', ['PR', 'Punt Returner'], ['WR', 'RB', 'DB', 'ATH']),
      ],
    ],
  },
]

export function schemesForUnit(unit: LineupUnit): LineupScheme[] {
  return LINEUP_SCHEMES.filter((scheme) => scheme.unit === unit)
}

export function flatSlots(scheme: LineupScheme): LineupSlot[] {
  return scheme.rows.flat()
}

function athletePositions(athlete: Athlete): string[] {
  return [athlete.position, athlete.secondaryPosition]
    .filter((value): value is string => Boolean(value))
    .map(normalizePosition)
}

function athleteGroups(athlete: Athlete): PositionGroup[] {
  return [athlete.positionGroup, athlete.secondaryPositionGroup]
    .filter((value): value is PositionGroup => Boolean(value))
}

export function fitForSlot(
  athlete: Athlete,
  lineupSlot: LineupSlot,
): Pick<LineupAssignment, 'fit' | 'fitLabel'> | undefined {
  const acceptedPositions = lineupSlot.acceptedPositions.map(normalizePosition)
  const positions = athletePositions(athlete)
  const primaryPosition = normalizePosition(athlete.position)
  const secondaryPosition = athlete.secondaryPosition
    ? normalizePosition(athlete.secondaryPosition)
    : undefined

  if (acceptedPositions.includes(primaryPosition)) {
    return { fit: 100, fitLabel: 'Natural' }
  }
  if (secondaryPosition && acceptedPositions.includes(secondaryPosition)) {
    return { fit: 94, fitLabel: 'Secondary' }
  }

  const acceptedGroups = new Set([lineupSlot.group, ...(lineupSlot.acceptedGroups ?? [])])
  const groups = athleteGroups(athlete)
  if (acceptedGroups.has(athlete.positionGroup)) {
    return { fit: 86, fitLabel: 'Group fit' }
  }
  if (athlete.secondaryPositionGroup && acceptedGroups.has(athlete.secondaryPositionGroup)) {
    return { fit: 82, fitLabel: 'Secondary' }
  }

  if (athlete.positionGroup === 'ATH' || groups.includes('ATH') || positions.includes('ATH')) {
    return { fit: 68, fitLabel: 'Athlete fit' }
  }
  return undefined
}

export function candidatesForSlot(
  athletes: Athlete[],
  ratings: Map<string, number>,
  lineupSlot: LineupSlot,
): LineupAssignment[] {
  return athletes
    .map((athlete) => {
      const fit = fitForSlot(athlete, lineupSlot)
      if (!fit) return undefined
      return {
        slot: lineupSlot,
        athlete,
        rating: ratings.get(athlete.id) ?? 50,
        ...fit,
      }
    })
    .filter((value): value is LineupAssignment => Boolean(value))
    .sort((a, b) => {
      const aScore = a.rating + a.fit * 0.35
      const bScore = b.rating + b.fit * 0.35
      return bScore - aScore || b.rating - a.rating || a.athlete.name.localeCompare(b.athlete.name)
    })
}

export function generateBestLineup(
  athletes: Athlete[],
  ratings: Map<string, number>,
  scheme: LineupScheme,
  overrides: LineupOverrides = {},
): Record<string, LineupAssignment> {
  const assignments: Record<string, LineupAssignment> = {}
  const used = new Set<string>()
  const slots = flatSlots(scheme)
  const athleteMap = new Map(athletes.map((athlete) => [athlete.id, athlete]))

  for (const lineupSlot of slots) {
    const athleteId = overrides[lineupSlot.id]
    const athlete = athleteId ? athleteMap.get(athleteId) : undefined
    const fit = athlete ? fitForSlot(athlete, lineupSlot) : undefined
    if (!athlete || !fit || used.has(athlete.id)) continue
    assignments[lineupSlot.id] = {
      slot: lineupSlot,
      athlete,
      rating: ratings.get(athlete.id) ?? 50,
      ...fit,
    }
    used.add(athlete.id)
  }

  const candidates = new Map(slots.map((lineupSlot) => [lineupSlot.id, candidatesForSlot(athletes, ratings, lineupSlot)]))
  // Fill exact-position matches first, starting with slots that have the fewest.
  // This prevents an early group-fit slot from taking another slot's natural player.
  const directSlots = [...slots].sort((a, b) =>
    candidates.get(a.id)!.filter((item) => item.fit >= 94).length
    - candidates.get(b.id)!.filter((item) => item.fit >= 94).length,
  )
  for (const directOnly of [true, false]) {
    for (const lineupSlot of directOnly ? directSlots : slots) {
      if (assignments[lineupSlot.id]) continue
      const candidate = candidates.get(lineupSlot.id)!
        .find((item) => !used.has(item.athlete.id) && (!directOnly || item.fit >= 94))
      if (!candidate) continue
      assignments[lineupSlot.id] = candidate
      used.add(candidate.athlete.id)
    }
  }

  return assignments
}

export function lineupRating(assignments: Record<string, LineupAssignment>): number {
  const values = Object.values(assignments).map((assignment) => assignment.rating)
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function lineupFit(assignments: Record<string, LineupAssignment>): number {
  const values = Object.values(assignments).map((assignment) => assignment.fit)
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
