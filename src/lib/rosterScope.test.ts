import { describe, expect, it } from 'vitest'
import type { AthleteResult, CategoryScores, ComputedSession } from '../types'
import { rosterForScope, resultsForRoster } from './rosterScope'

const categories: CategoryScores = {
  Speed: 78,
  Acceleration: 74,
  Jump: 58,
  Power: 61,
  Pursuit: 65,
  'Change of Direction': 70,
  Conditioning: 0,
  Strength: 66,
}

function result(id: string, rankEligible: boolean, dash40: number): AthleteResult {
  const athlete = {
    id,
    name: rankEligible ? 'Complete Athlete' : 'Partial Athlete',
    grade: 10,
    position: 'WR',
    positionGroup: 'WR' as const,
    heightIn: 70,
    weightLbs: 170,
  }
  const current: ComputedSession = {
    athlete,
    event: {
      id: 'event-1',
      name: 'Test Event',
      phase: 'Summer',
      startDate: '2025-06-15',
    },
    session: {
      id: `session-${id}`,
      athleteId: id,
      eventId: 'event-1',
      date: '2025-06-15',
      phase: 'Summer',
      gradeSnapshot: 10,
      positionSnapshot: 'WR',
      positionGroupSnapshot: 'WR',
      weightLbsSnapshot: 170,
      dash40_1: dash40,
      benchMax: 225,
    },
    metrics: {
      best40: dash40,
      benchRatio: 225 / 170,
    },
    normalized: {
      best40: 78,
      benchRatio: 66,
    },
    categories,
    fai: rankEligible ? 72 : 43,
    completionPct: rankEligible ? 100 : 20,
    scoreStatus: rankEligible ? 'complete' : 'insufficient',
  }
  return {
    athlete,
    current,
    faiImprovement: 0,
    faiImprovementPct: 0,
    teamRank: rankEligible ? 1 : 0,
    teamCount: rankEligible ? 1 : 0,
    groupRank: rankEligible ? 1 : 0,
    groupCount: rankEligible ? 1 : 0,
    rankEligible,
    baseFai: current.fai,
    impactBoostPct: 0,
    awarenessBoostPct: 0,
    efficiencyBoostPct: 0,
  }
}


describe('roster scope', () => {
  it('keeps unknown graduation years visible and makes alumni available explicitly', () => {
    const alumni = result('alumni', true, 4.6)
    const active = result('active', true, 4.8)
    const unknown = result('unknown', false, 5)
    const roster = [alumni.athlete, active.athlete, unknown.athlete]
    const sessions = [
      { ...alumni.current.session, date: '2024-01-01', gradeSnapshot: 12 },
      { ...active.current.session, date: '2026-01-01', gradeSnapshot: 10 },
    ]
    const now = new Date('2026-09-01T12:00:00Z')
    expect(rosterForScope(roster, sessions, 'active', now).map((a) => a.id)).toEqual(['active', 'unknown'])
    expect(rosterForScope(roster, sessions, 'alumni', now).map((a) => a.id)).toEqual(['alumni'])
    expect(rosterForScope(roster, sessions, 'all', now)).toEqual(roster)
  })

  it('recomputes ranks and counts without modifying archived results or ranking partial scores', () => {
    const archived = result('archived', true, 4.6)
    const active = { ...result('active', true, 4.8), teamRank: 2, groupRank: 2, teamCount: 2, groupCount: 2 }
    const partial = result('partial', false, 5)
    const scoped = resultsForRoster([archived, active, partial], [active.athlete, partial.athlete])
    expect(scoped.map((r) => r.athlete.id)).toEqual(['active', 'partial'])
    expect(scoped[0]).toMatchObject({ teamRank: 1, groupRank: 1, teamCount: 1, groupCount: 1 })
    expect(scoped[1]).toMatchObject({ teamRank: 0, groupRank: 0 })
    expect(active).toMatchObject({ teamRank: 2, groupRank: 2, teamCount: 2 })
  })
})
