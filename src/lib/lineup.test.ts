import { describe, expect, it } from 'vitest'
import type { Athlete } from '../types'
import {
  candidatesForSlot,
  fitForSlot,
  generateBestLineup,
  LINEUP_SCHEMES,
  lineupFit,
  lineupRating,
} from './lineup'

function athlete(
  id: string,
  position: string,
  positionGroup: Athlete['positionGroup'],
  secondaryPosition?: string,
  secondaryPositionGroup?: Athlete['positionGroup'],
): Athlete {
  return {
    id,
    name: id.toUpperCase(),
    grade: 11,
    position,
    positionGroup,
    secondaryPosition,
    secondaryPositionGroup,
    heightIn: 72,
    weightLbs: 190,
  }
}

describe('lineup engine', () => {
  const defense = LINEUP_SCHEMES.find((scheme) => scheme.id === 'defense-425')!
  const star = defense.rows.flat().find((slot) => slot.id === 'star')!

  it('recognizes exact, secondary, and hybrid group fits', () => {
    expect(fitForSlot(athlete('natural', 'Star', 'LB'), star)).toEqual({
      fit: 100,
      fitLabel: 'Natural',
    })
    expect(fitForSlot(athlete('secondary', 'WR', 'WR', 'Star', 'LB'), star)).toEqual({
      fit: 94,
      fitLabel: 'Secondary',
    })
    expect(fitForSlot(athlete('hybrid', 'Nickel', 'DB'), star)).toEqual({
      fit: 100,
      fitLabel: 'Natural',
    })
  })

  it('prioritizes natural fit while still using FAI rating', () => {
    const athletes = [
      athlete('natural', 'Star', 'LB'),
      athlete('generic', 'ILB', 'LB'),
    ]
    const ratings = new Map([
      ['natural', 80],
      ['generic', 82],
    ])
    const candidates = candidatesForSlot(athletes, ratings, star)
    expect(candidates[0].athlete.id).toBe('natural')
  })

  it('never assigns one athlete to two positions in the same unit', () => {
    const offense = LINEUP_SCHEMES.find((scheme) => scheme.id === 'offense-spread-11')!
    const athletes = [
      athlete('qb', 'QB', 'QB'),
      athlete('rb', 'RB', 'RB'),
      athlete('wr1', 'WR', 'WR'),
      athlete('wr2', 'WR', 'WR'),
      athlete('wr3', 'WR', 'WR'),
      athlete('te', 'TE', 'TE'),
      athlete('ol1', 'OL', 'OL'),
      athlete('ol2', 'OL', 'OL'),
      athlete('ol3', 'OL', 'OL'),
      athlete('ol4', 'OL', 'OL'),
      athlete('ol5', 'OL', 'OL'),
    ]
    const ratings = new Map(athletes.map((item, index) => [item.id, 90 - index]))
    const assignments = generateBestLineup(athletes, ratings, offense)
    const ids = Object.values(assignments).map((assignment) => assignment.athlete.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(11)
  })

  it('honors valid manual overrides and calculates summary ratings', () => {
    const offense = LINEUP_SCHEMES.find((scheme) => scheme.id === 'offense-spread-11')!
    const athletes = [
      athlete('qb1', 'QB', 'QB'),
      athlete('qb2', 'QB', 'QB'),
    ]
    const ratings = new Map([
      ['qb1', 92],
      ['qb2', 70],
    ])
    const assignments = generateBestLineup(athletes, ratings, offense, { qb: 'qb2' })
    expect(assignments.qb.athlete.id).toBe('qb2')
    expect(lineupRating(assignments)).toBe(70)
    expect(lineupFit(assignments)).toBe(100)
  })

  it('leaves positions empty when the roster has no eligible athlete', () => {
    const offense = LINEUP_SCHEMES.find((scheme) => scheme.id === 'offense-spread-11')!
    const assignments = generateBestLineup(
      [athlete('only-qb', 'QB', 'QB')],
      new Map([['only-qb', 88]]),
      offense,
    )
    expect(Object.keys(assignments)).toEqual(['qb'])
    expect(assignments.qb.rating).toBe(88)
  })

  it('keeps every scheme slot identifier unique', () => {
    for (const scheme of LINEUP_SCHEMES) {
      const slotIds = scheme.rows.flat().map((slot) => slot.id)
      expect(new Set(slotIds).size).toBe(slotIds.length)
    }
  })
})


it('reserves an edge and nose tackle for their listed positions before group fallback', () => {
  const scheme = LINEUP_SCHEMES.find((item) => item.id === 'defense-425')!
  const athletes = [athlete('nose', 'NT', 'DL'), athlete('edge', 'Jack', 'DL')]
  const assignments = generateBestLineup(athletes, new Map([['nose', 99], ['edge', 60]]), scheme)
  expect(assignments.jack.athlete.id).toBe('edge')
  expect(assignments.nt.athlete.id).toBe('nose')
  expect(assignments.dt).toBeUndefined()
})
