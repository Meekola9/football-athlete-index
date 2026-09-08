import { describe, expect, it } from 'vitest'
import type { FilmPlay, PlayEvent } from '../types'
import { buildSidelineReport, isExplosive, playSuccess } from './sidelineDashboard'

function num(report: ReturnType<typeof buildSidelineReport>, key: string) {
  return report.numbers.find((n) => n.key === key)!
}

describe('sideline dashboard', () => {
  it('scores success by down and distance', () => {
    expect(playSuccess({ id: '1', side: 'offense', down: 1, distance: 10, gain: 5 })).toBe(true) // 50%
    expect(playSuccess({ id: '2', side: 'offense', down: 1, distance: 10, gain: 4 })).toBe(false)
    expect(playSuccess({ id: '3', side: 'offense', down: 2, distance: 10, gain: 7 })).toBe(true) // 70%
    expect(playSuccess({ id: '4', side: 'offense', down: 3, distance: 4, gain: 3 })).toBe(false) // needs 100%
    expect(playSuccess({ id: '5', side: 'offense', gain: 5 })).toBeNull() // no down/distance
  })

  it('flags explosive by call', () => {
    expect(isExplosive({ id: '1', call: 'run', gain: 12 })).toBe(true)
    expect(isExplosive({ id: '2', call: 'run', gain: 11 })).toBe(false)
    expect(isExplosive({ id: '3', call: 'pass', gain: 16 })).toBe(true)
    expect(isExplosive({ id: '4', call: 'pass', gain: 15 })).toBe(false)
  })

  it('computes the margin numbers from both sides of the ball', () => {
    const plays: FilmPlay[] = [
      // our offense
      { id: 'o1', side: 'offense', call: 'run', down: 1, distance: 10, gain: 14, boxCount: 6 },  // explosive, success, light box
      { id: 'o2', side: 'offense', call: 'pass', down: 2, distance: 10, gain: -3 },               // our negative
      { id: 'o3', side: 'offense', call: 'run', down: 1, distance: 10, gain: 2, boxCount: 8 },    // heavy box
      // our defense (opponent has ball)
      { id: 'd1', side: 'defense', call: 'pass', gain: 20 },                                       // explosive allowed
      { id: 'd2', side: 'defense', call: 'run', gain: -4 },                                        // forced negative (TFL)
      { id: 'd3', side: 'defense', call: 'run', gain: -1 },                                        // forced negative
    ]
    const report = buildSidelineReport(plays, [], undefined)
    expect(report.offensiveSnaps).toBe(3)
    expect(report.defensiveSnaps).toBe(3)
    expect(num(report, 'explosive').value).toBe(0)   // 1 ours − 1 allowed
    expect(num(report, 'negative').value).toBe(1)    // 2 forced − 1 suffered
    // box/run advantage: 1 of 2 tagged runs into a light box
    expect(num(report, 'box').value).toBeCloseTo(0.5)
    // success rate: o1 success, o2 fail, o3 fail -> 1/3
    expect(num(report, 'success').value).toBeCloseTo(1 / 3)
  })

  it('computes defensive havoc rate from impact events and hidden-yard margin', () => {
    const plays: FilmPlay[] = [
      { id: 'd1', side: 'defense', call: 'run', gain: 3 },
      { id: 'd2', side: 'defense', call: 'pass', gain: 5 },
      { id: 's1', side: 'offense', call: 'special', hiddenYards: 15 },
      { id: 's2', side: 'defense', call: 'special', hiddenYards: -8 },
    ]
    const events: PlayEvent[] = [
      { id: 'e1', athleteId: 'a1', type: 'sack', date: '2026-01-01' },
      { id: 'e2', athleteId: 'a2', type: 'tfl', date: '2026-01-01' },
      { id: 'e3', athleteId: 'a3', type: 'missed_tackle', date: '2026-01-01' }, // negative, not counted
    ]
    const report = buildSidelineReport(plays, events, undefined)
    // Special teams are excluded from defensive scrimmage snaps.
    expect(num(report, 'havoc').value).toBe(1)
    expect(num(report, 'havoc').display).toBe('1.00')
    expect(report.defensiveSnaps).toBe(2)
    // hidden margin: +15 - 8 = +7
    expect(num(report, 'hidden').value).toBe(7)
    expect(num(report, 'hidden').display).toBe('+7 yds')
  })

  it('surfaces the best offensive matchup and strongest opponent tendency alerts', () => {
    const plays: FilmPlay[] = []
    // Our offense: trips succeeds a lot (4/4)
    for (let i = 0; i < 4; i++) plays.push({ id: `o${i}`, side: 'offense', formation: 'trips', down: 1, distance: 10, gain: 8 })
    // Opponent (our defense): on 3rd & long they pass every time (4/4)
    for (let i = 0; i < 4; i++) plays.push({ id: `d${i}`, side: 'defense', call: 'pass', down: 3, distance: 9, gain: 6 })
    const report = buildSidelineReport(plays, [], undefined)
    const best = report.alerts.find((a) => a.key === 'best-matchup')
    const opp = report.alerts.find((a) => a.key === 'opp-tendency')
    expect(best?.detail).toMatch(/Trips/)
    expect(best?.detail).toMatch(/100%/)
    expect(opp?.detail).toMatch(/pass/)
  })

  it('filters to one opponent and reports empty numbers with no data', () => {
    const plays: FilmPlay[] = [
      { id: 'a', side: 'offense', opponent: 'Central', down: 1, distance: 10, gain: 6 },
      { id: 'b', side: 'offense', opponent: 'North', down: 1, distance: 10, gain: 1 },
    ]
    const central = buildSidelineReport(plays, [], 'Central')
    expect(central.offensiveSnaps).toBe(1)
    expect(num(central, 'success').display).toBe('100%')
    const empty = buildSidelineReport([], [], 'Nobody')
    expect(num(empty, 'success').display).toBe('—')
    expect(num(empty, 'success').sample).toBe(0)
  })
})


describe('missing sideline measurements', () => {
  it('does not present an event count as a rate without defensive snaps', () => {
    const report = buildSidelineReport([], [{ id: 's', athleteId: 'a', type: 'sack', date: '2026-09-01' }])
    expect(num(report, 'havoc').display).toBe('—')
    expect(num(report, 'havoc').sample).toBe(0)
    expect(num(report, 'havoc').hint).toContain('1 positive havoc events')
  })

  it('requires measurements from both sides before displaying a margin', () => {
    const report = buildSidelineReport([
      { id: 'o', side: 'offense', call: 'run', gain: 14 },
      { id: 'd', side: 'defense', call: 'pass' },
    ], [])
    expect(num(report, 'explosive').display).toBe('—')
    expect(num(report, 'negative').display).toBe('—')
    expect(num(report, 'negative').sample).toBe(0)
  })

  it('requires a call for explosive thresholds but accepts recorded zero gains', () => {
    const report = buildSidelineReport([
      { id: 'o', side: 'offense', gain: 14 },
      { id: 'd', side: 'defense', gain: 0 },
    ], [])
    expect(num(report, 'explosive').display).toBe('—')
    expect(num(report, 'negative').display).toBe('0')
    expect(num(report, 'negative').sample).toBe(2)
  })

  it('filters havoc events to the selected opponent', () => {
    const report = buildSidelineReport([{ id: 'd', side: 'defense', opponent: 'North', call: 'run' }], [
      { id: 's', athleteId: 'a', type: 'sack', date: '2026-09-01', opponent: 'South' },
    ], 'North')
    expect(num(report, 'havoc').display).toBe('0.00')
  })
})
