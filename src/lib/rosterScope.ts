import type { Athlete, AthleteResult, TestSession } from '../types'
import { isAlumnus } from './alumni'
import { rankResults } from './progress'

// Match the season used by athlete profiles and testing entry throughout FAI.
export const ROSTER_SEASON_ID = 'season-2026'
export type RosterScope = 'active' | 'alumni' | 'all'

export function rosterForScope(athletes: Athlete[], sessions: TestSession[], scope: RosterScope = 'active', now = new Date()): Athlete[] {
  return athletes.filter((athlete) => scope === 'all' || isAlumnus(athlete, sessions, now) === (scope === 'alumni'))
}

export function resultsForRoster(results: AthleteResult[], roster: Athlete[]): AthleteResult[] {
  const ids = new Set(roster.map((athlete) => athlete.id))
  return rankResults(results.filter((result) => ids.has(result.athlete.id)).map((result) => ({
    ...result, teamRank: 0, teamCount: 0, groupRank: 0, groupCount: 0,
  })))
}
