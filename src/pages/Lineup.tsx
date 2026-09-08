import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Card, FaiRing, Pill } from '../components/ui'
import { useAccountAccess } from '../hooks/useAccountAccess'
import {
  candidatesForSlot,
  flatSlots,
  generateBestLineup,
  lineupFit,
  lineupRating,
  schemesForUnit,
  type LineupOverrides,
  type LineupSlot,
  type LineupUnit,
} from '../lib/lineup'
import { useStore } from '../store/useStore'
import { rosterForScope } from '../lib/rosterScope'
import type { AthleteResult } from '../types'

const LINEUP_STORAGE_KEY = 'fai:lineup:v1'
const SEASON_EVENT_ID = 'season-2026'

type StoredLineups = Record<string, LineupOverrides>

const EMPTY_LINEUP_OVERRIDES: LineupOverrides = {}

function readStoredLineups(): StoredLineups {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LINEUP_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? parsed as StoredLineups : {}
  } catch {
    return {}
  }
}

function persistStoredLineups(value: StoredLineups): void {
  try {
    window.localStorage.setItem(LINEUP_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Lineup still works for the current session when storage is unavailable.
  }
}

function scoreTone(score: number): string {
  if (score >= 85) return 'border-up/55 bg-up/10'
  if (score >= 72) return 'border-fai/55 bg-fai/10'
  if (score >= 58) return 'border-gold/55 bg-gold/10'
  return 'border-flame/55 bg-flame/10'
}

function scoreText(score: number): string {
  if (score >= 85) return 'text-up'
  if (score >= 72) return 'text-fai'
  if (score >= 58) return 'text-gold'
  return 'text-flame'
}

function unitLabel(unit: LineupUnit): string {
  return unit === 'offense' ? 'Offense' : unit === 'defense' ? 'Defense' : 'Special Teams'
}

function resultMap(results: AthleteResult[]): Map<string, AthleteResult> {
  return new Map(results.map((result) => [result.athlete.id, result]))
}

export default function Lineup() {
  const { data, resultsForEvent, canEdit, viewerMode } = useStore()
  const access = useAccountAccess()
  const [unit, setUnit] = useState<LineupUnit>('defense')
  const [selectedSchemeIds, setSelectedSchemeIds] = useState<Record<LineupUnit, string>>({
    offense: 'offense-spread-11',
    defense: 'defense-425',
    special: 'special-core',
  })
  const [storedLineups, setStoredLineups] = useState<StoredLineups>(readStoredLineups)
  const [editingSlotId, setEditingSlotId] = useState<string>()

  const seasonResults = useMemo(
    () => resultMap(resultsForEvent(SEASON_EVENT_ID)),
    [resultsForEvent],
  )
  const activeRoster = useMemo(() => rosterForScope(data.athletes, data.sessions), [data.athletes, data.sessions])
  const roster = useMemo(() => activeRoster.filter((athlete) => {
    const result = seasonResults.get(athlete.id)
    return result && result.current.scoreStatus !== 'insufficient'
  }), [activeRoster, seasonResults])
  const ratings = useMemo(
    () => new Map(roster.map((athlete) => [athlete.id, seasonResults.get(athlete.id)!.current.fai])),
    [roster, seasonResults],
  )

  const availableSchemes = schemesForUnit(unit)
  const scheme = availableSchemes.find((item) => item.id === selectedSchemeIds[unit]) ?? availableSchemes[0]
  const overrides = storedLineups[scheme.id] ?? EMPTY_LINEUP_OVERRIDES
  const assignments = generateBestLineup(roster, ratings, scheme, overrides)
  const editingSlot = editingSlotId
    ? flatSlots(scheme).find((lineupSlot) => lineupSlot.id === editingSlotId)
    : undefined

  const editable = canEdit && !viewerMode && (
    access.role === 'owner'
    || access.role === 'admin'
    || access.capabilities.canManageRoster
  )

  const unitSummaries = useMemo(() => {
    return (['offense', 'defense', 'special'] as LineupUnit[]).map((summaryUnit) => {
      const summarySchemes = schemesForUnit(summaryUnit)
      const summaryScheme = summarySchemes.find((item) => item.id === selectedSchemeIds[summaryUnit]) ?? summarySchemes[0]
      const summaryAssignments = generateBestLineup(
        roster,
        ratings,
        summaryScheme,
        storedLineups[summaryScheme.id] ?? {},
      )
      return {
        unit: summaryUnit,
        rating: lineupRating(summaryAssignments),
        filled: Object.keys(summaryAssignments).length,
        total: flatSlots(summaryScheme).length,
      }
    })
  }, [roster, ratings, selectedSchemeIds, storedLineups])

  function updateScheme(nextSchemeId: string) {
    setSelectedSchemeIds((current) => ({ ...current, [unit]: nextSchemeId }))
    setEditingSlotId(undefined)
  }

  function updateStoredLineup(recipe: (current: LineupOverrides) => LineupOverrides) {
    setStoredLineups((current) => {
      const next = {
        ...current,
        [scheme.id]: recipe(current[scheme.id] ?? {}),
      }
      persistStoredLineups(next)
      return next
    })
  }

  function assignAthlete(lineupSlot: LineupSlot, athleteId: string) {
    updateStoredLineup((current) => {
      const next = { ...current }
      for (const [slotId, assignedAthleteId] of Object.entries(next)) {
        if (assignedAthleteId === athleteId) delete next[slotId]
      }
      next[lineupSlot.id] = athleteId
      return next
    })
    setEditingSlotId(undefined)
  }

  function autoPickSlot(lineupSlot: LineupSlot) {
    updateStoredLineup((current) => {
      const next = { ...current }
      delete next[lineupSlot.id]
      return next
    })
    setEditingSlotId(undefined)
  }

  function generateBest() {
    setStoredLineups((current) => {
      const next = { ...current }
      delete next[scheme.id]
      persistStoredLineups(next)
      return next
    })
    setEditingSlotId(undefined)
  }

  const currentRating = lineupRating(assignments)
  const currentFit = lineupFit(assignments)
  const filledSlots = Object.keys(assignments).length
  const totalSlots = flatSlots(scheme).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-fai">Personnel Board</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-chalk">Visual Lineup</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Suggested depth chart using active athletes with 2026 testing. Provisional scores are included; confirm assignments with film and coaching judgment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={editable ? 'up' : 'default'}>{editable ? 'Coach editing' : 'View only'}</Pill>
          {editable && <Pill tone="fai">Saved on this device</Pill>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {unitSummaries.map((summary) => (
          <button
            key={summary.unit}
            type="button"
            aria-pressed={unit === summary.unit}
            onClick={() => setUnit(summary.unit)}
            className={`rounded-2xl border p-4 text-left transition ${unit === summary.unit ? 'border-fai bg-fai/10' : 'border-line bg-panel/80 hover:border-fai/40'}`}
          >
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">{unitLabel(summary.unit)}</div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div className={`text-4xl font-black nums ${scoreText(summary.rating)}`}>{Math.round(summary.rating)}</div>
              <div className="text-right text-xs text-muted">
                <div className="font-bold text-chalk">{summary.filled}/{summary.total} filled</div>
                <div>Unit OVR</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel-2/45 p-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">{unitLabel(unit)} scheme</div>
              <select
                aria-label="Lineup scheme"
                value={scheme.id}
                onChange={(event) => updateScheme(event.target.value)}
                className="mt-1 rounded-lg border border-line bg-ink px-3 py-2 text-sm font-black text-chalk outline-none focus:border-fai"
              >
                {availableSchemes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <p className="mt-2 text-xs text-muted">{scheme.description}</p>
            </div>
            {editable && (
              <button
                type="button"
                onClick={generateBest}
                className="rounded-xl border border-fai/50 bg-fai/10 px-4 py-2 text-sm font-black text-fai hover:bg-fai/20"
              >
                ◉ Regenerate Suggestions
              </button>
            )}
          </div>

          <div className="relative overflow-x-auto bg-[radial-gradient(circle_at_top,rgba(198,242,78,0.08),transparent_45%)] p-4 sm:p-6">
            <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden="true">
              <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-fai/50" />
              <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-fai/50" />
            </div>
            <div className="relative min-w-[720px] space-y-7">
              {scheme.rows.map((row, rowIndex) => (
                <div
                  key={`${scheme.id}-row-${rowIndex}`}
                  className="grid items-start justify-center gap-3"
                  style={{ gridTemplateColumns: `repeat(${row.length}, minmax(128px, 164px))` }}
                >
                  {row.map((lineupSlot) => {
                    const assignment = assignments[lineupSlot.id]
                    const depth = candidatesForSlot(roster, ratings, lineupSlot)
                      .filter((candidate) => candidate.athlete.id !== assignment?.athlete.id)
                      .slice(0, 2)
                    return (
                      <button
                        key={lineupSlot.id}
                        type="button"
                        disabled={!editable}
                        onClick={() => setEditingSlotId(lineupSlot.id)}
                        className={`group overflow-hidden rounded-xl border text-left shadow-lg transition ${assignment ? scoreTone(assignment.rating) : 'border-dashed border-line bg-ink/75'} ${editable ? 'hover:-translate-y-0.5 hover:border-fai' : 'cursor-default'}`}
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2.5 py-1.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-chalk">{lineupSlot.label}</span>
                          {assignment && <span className={`text-lg font-black nums ${scoreText(assignment.rating)}`}>{Math.round(assignment.rating)}</span>}
                        </div>
                        {assignment ? (
                          <>
                            <div className="flex items-center gap-2 p-2.5">
                              <Avatar name={assignment.athlete.name} photoUrl={assignment.athlete.photoUrl} size={44} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-black text-chalk">{assignment.athlete.name}</div>
                                <div className="mt-0.5 truncate text-[10px] font-bold text-muted">{assignment.athlete.position}{assignment.athlete.secondaryPosition ? ` / ${assignment.athlete.secondaryPosition}` : ''}</div>
                                <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-fai">{overrides[lineupSlot.id] ? 'Coach selected' : 'Suggested'} · {assignment.fitLabel} · {assignment.fit}%</div>
                              </div>
                            </div>
                            <div className="space-y-1 border-t border-white/10 bg-ink/45 px-2.5 py-2">
                              {depth.length ? depth.map((candidate, index) => (
                                <div key={candidate.athlete.id} className="flex items-center justify-between gap-2 text-[9px]">
                                  <span className="truncate text-muted">{index + 2}. {candidate.athlete.name}</span>
                                  <span className="font-black nums text-chalk">{Math.round(candidate.rating)}</span>
                                </div>
                              )) : <div className="text-[9px] text-muted">No listed backup</div>}
                            </div>
                          </>
                        ) : (
                          <div className="grid min-h-28 place-items-center p-3 text-center">
                            <div>
                              <div className="text-2xl text-muted">＋</div>
                              <div className="mt-1 text-[10px] font-bold text-muted">No eligible athlete</div>
                            </div>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 text-center" glow>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{unitLabel(unit)} Rating</div>
            <div className="mt-4"><FaiRing score={currentRating} size={142} label="OVR" /></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line bg-panel-2/60 p-3">
                <div className="text-2xl font-black nums text-fai">{Math.round(currentFit)}%</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted">Scheme fit</div>
              </div>
              <div className="rounded-xl border border-line bg-panel-2/60 p-3">
                <div className="text-2xl font-black nums text-chalk">{filledSlots}/{totalSlots}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted">Positions</div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-muted">How selection works</div>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
              <p><strong className="text-chalk">Natural position</strong> receives the strongest scheme-fit priority.</p>
              <p><strong className="text-chalk">Secondary positions</strong> allow two-way and Iron Man athletes to appear on both units.</p>
              <p><strong className="text-chalk">2026 FAI</strong> breaks ties and ranks the depth chart by current athletic output.</p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-muted">Roster health</div>
            <div className="mt-3 text-sm text-muted">
              {roster.length} athletes with 2026 ratings · {activeRoster.length - roster.length} active athletes need testing before lineup suggestions
            </div>
            <Link to="/athletes" className="mt-3 inline-flex rounded-lg border border-line px-3 py-2 text-xs font-black text-chalk hover:border-fai hover:text-fai">Open roster →</Link>
          </Card>
        </div>
      </div>

      {editingSlot && editable && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Choose ${editingSlot.label}`}>
          <div className="max-h-[85vh] w-full overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fai">Depth chart assignment</div>
                <h2 className="mt-1 text-xl font-black text-chalk">Choose {editingSlot.label}</h2>
              </div>
              <button type="button" onClick={() => setEditingSlotId(undefined)} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-chalk">✕</button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {candidatesForSlot(roster, ratings, editingSlot).map((candidate) => {
                const active = assignments[editingSlot.id]?.athlete.id === candidate.athlete.id
                const usedAt = Object.values(assignments).find((assignment) => assignment.athlete.id === candidate.athlete.id)?.slot.label
                return (
                  <button
                    key={candidate.athlete.id}
                    type="button"
                    onClick={() => assignAthlete(editingSlot, candidate.athlete.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-fai bg-fai/10' : 'border-line bg-ink/55 hover:border-fai/50'}`}
                  >
                    <Avatar name={candidate.athlete.name} photoUrl={candidate.athlete.photoUrl} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-chalk">{candidate.athlete.name}</div>
                      <div className="mt-0.5 text-xs text-muted">{candidate.athlete.position}{candidate.athlete.secondaryPosition ? ` / ${candidate.athlete.secondaryPosition}` : ''} · {candidate.fitLabel} {candidate.fit}%</div>
                      {usedAt && usedAt !== editingSlot.label && <div className="mt-1 text-[10px] font-bold text-gold">Currently starts at {usedAt}; selecting will move him.</div>}
                    </div>
                    <div className={`text-2xl font-black nums ${scoreText(candidate.rating)}`}>{Math.round(candidate.rating)}</div>
                  </button>
                )
              })}
              {!candidatesForSlot(roster, ratings, editingSlot).length && (
                <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">No rostered athlete currently fits this position.</div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line p-4">
              <button type="button" onClick={() => autoPickSlot(editingSlot)} className="rounded-lg border border-line px-3 py-2 text-xs font-black text-muted hover:text-chalk">Use best available</button>
              <button type="button" onClick={() => setEditingSlotId(undefined)} className="rounded-lg bg-fai px-4 py-2 text-xs font-black text-ink">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
