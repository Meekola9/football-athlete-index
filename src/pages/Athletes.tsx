import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Avatar, Card, Pill } from '../components/ui'
import { PlayerUsageGuide } from '../components/PlayerUsageGuide'
import { PlayerBadgeStrip } from '../components/PlayerBadges'
import { GameDayBadgeArtwork } from '../components/GameDayBadges'
import { OverallRatingName } from '../components/OverallRatingName'
import { FilterBar, EMPTY_FILTERS, applyFilters, type FilterState } from '../components/Filters'
import { athleteTimeline, positionScoreBreakdown } from '../lib/compute'
import { archetypeFor } from '../lib/archetypes'
import { playerBadgesFor } from '../lib/badges'
import { athleteGameDayBadgeSummary } from '../lib/gameDayBadges'
import { playerUsageDefinition, playerUsagePlanLine } from '../lib/playerUsage'
import { CATEGORIES, CATEGORY_SHORT, formatHeight } from '../data/constants'
import { athletePositionLine } from '../data/positions'
import Lineup from './Lineup'
import { usePageMemory, usePageScrollMemory } from '../hooks/usePageMemory'
import type { Athlete, AthleteResult, Category } from '../types'

import { rosterForScope, resultsForRoster, type RosterScope, ROSTER_SEASON_ID as ATHLETE_SEASON_ID } from '../lib/rosterScope'

/** Roster sort: overall, name, or any single FAI category (for building packages). */
type SortKey = 'fai' | 'name' | Category

function isCategorySort(sort: SortKey): sort is Category {
  return sort !== 'fai' && sort !== 'name'
}

interface Row {
  athlete: Athlete
  result?: AthleteResult
}

export default function Athletes() {
  const { data, computed, resultsForEvent, gradeLabelFor, canEdit } = useStore()
  const [view, setView] = usePageMemory<'roster' | 'lineup'>('fai:athletes:view', 'roster')
  const [filters, setFilters] = usePageMemory<FilterState>('fai:athletes:filters', EMPTY_FILTERS)
  const [sort, setSort] = usePageMemory<SortKey>('fai:athletes:sort', 'fai')
  usePageScrollMemory('fai:athletes:scroll')

  const [scope, setScope] = usePageMemory<RosterScope>('fai:athletes:scope', 'active')
  const [query, setQuery] = usePageMemory('fai:athletes:query', '')
  const roster = useMemo(() => rosterForScope(data.athletes, data.sessions, scope), [data.athletes, data.sessions, scope])
  const seasonResults = scope === 'active' ? resultsForRoster(resultsForEvent(ATHLETE_SEASON_ID), roster) : resultsForEvent(ATHLETE_SEASON_ID)
  const filteredResults = useMemo(
    () => applyFilters(seasonResults, filters),
    [seasonResults, filters],
  )
  const resultMap = useMemo(
    () => new Map(filteredResults.map((result) => [result.athlete.id, result])),
    [filteredResults],
  )

  const list = useMemo<Row[]>(() => {
    const rows = roster
      .filter((athlete) => {
        if (!athlete.name.toLowerCase().includes(query.trim().toLowerCase())) return false
        if (filters.grade && String(athlete.grade) !== filters.grade) return false
        if (
          filters.group
          && athlete.positionGroup !== filters.group
          && athlete.secondaryPositionGroup !== filters.group
        ) return false
        if (filters.position) {
          const searchable = `${athlete.position} ${athlete.secondaryPosition ?? ''}`.toLowerCase()
          if (!searchable.includes(filters.position.toLowerCase())) return false
        }
        return true
      })
      .map((athlete) => ({ athlete, result: resultMap.get(athlete.id) }))

    rows.sort((a, b) => {
      if (sort === 'name') return a.athlete.name.localeCompare(b.athlete.name)
      if (!a.result && !b.result) return a.athlete.name.localeCompare(b.athlete.name)
      if (!a.result) return 1
      if (!b.result) return -1
      if (isCategorySort(sort)) {
        const diff = b.result.current.categories[sort] - a.result.current.categories[sort]
        return diff !== 0 ? diff : a.athlete.name.localeCompare(b.athlete.name)
      }
      if (a.result.rankEligible !== b.result.rankEligible) return a.result.rankEligible ? -1 : 1
      return b.result.current.fai - a.result.current.fai
    })
    return rows
  }, [roster, query, filters, resultMap, sort])

  if (view === 'lineup') {
    return (
      <div className="space-y-5">
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl border border-line bg-panel p-1">
            <button type="button" onClick={() => setView('roster')} className="rounded-lg px-5 py-2 text-xs font-black uppercase tracking-wider text-muted hover:bg-panel-2 hover:text-chalk">Roster</button>
            <button type="button" className="rounded-lg bg-fai px-5 py-2 text-xs font-black uppercase tracking-wider text-ink">Lineup Board</button>
          </div>
        </div>
        <Lineup />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-line bg-panel p-1">
          <button type="button" className="rounded-lg bg-fai px-5 py-2 text-xs font-black uppercase tracking-wider text-ink">Roster</button>
          <button type="button" onClick={() => setView('lineup')} className="rounded-lg px-5 py-2 text-xs font-black uppercase tracking-wider text-muted hover:bg-panel-2 hover:text-chalk">Lineup Board</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="page-kicker">2026 testing · {scope} roster · {list.length} of {roster.length} athletes</div>
          <h1 className="page-title">Athlete personnel</h1>
          <p className="page-intro">Build position groups, testing profiles, and game-plan deployment from one roster.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Sort athletes"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-semibold outline-none focus:border-fai"
          >
            <option value="fai">Sort: 2026 FAI</option>
            <option value="name">Sort: Name</option>
            <optgroup label="Sort by category">
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>Sort: {category}</option>
              ))}
            </optgroup>
          </select>
          {canEdit && (
            <Link to="/athletes/new" className="rounded-lg bg-fai px-4 py-1.5 text-sm font-bold text-ink hover:bg-fai/90">+ Add Athlete</Link>
          )}
        </div>
      </div>

      <details className="rounded-xl border border-line bg-panel px-4 py-3">
        <summary className="cursor-pointer text-sm font-extrabold text-chalk">How FAI deployment roles work</summary>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted">These labels describe meeting-room load, weekly installation, and game-plan responsibility. They are not a ranking of toughness or talent.</p>
        <div className="mt-3"><PlayerUsageGuide compact /></div>
      </details>

      <div className="flex flex-wrap gap-2">
        <input type="search" aria-label="Search athletes by name" placeholder="Search athlete name…" value={query} onChange={(event) => setQuery(event.target.value)} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-fai" />
        <select aria-label="Roster scope" value={scope} onChange={(event) => setScope(event.target.value as RosterScope)} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm">
          <option value="active">Active roster</option><option value="alumni">Alumni archive</option><option value="all">All athletes</option>
        </select>
      </div>
      <p className="text-xs text-muted">Active status follows recorded graduation years; athletes without a dated grade snapshot remain visible. Use the season selector in Rankings for historical testing.</p>

      <FilterBar events={[]} value={filters} onChange={setFilters} showEventFilter={false} />

      {!list.length ? (
        <Card className="p-10 text-center text-muted">No athletes match these filters.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(({ athlete, result }) => {
            const archetype = result ? archetypeFor(result.current) : undefined
            const seasonTimeline = athleteTimeline(computed, athlete.id).filter(
              (item) => item.event.id === ATHLETE_SEASON_ID,
            )
            const badges = result
              ? playerBadgesFor({ result: { ...result, previous: undefined, faiImprovement: 0, faiImprovementPct: 0 }, timeline: seasonTimeline })
              : []
            const gameBadges = athleteGameDayBadgeSummary(data.plays, athlete.id, 2026)
            const usage = athlete.usage ?? 'one-way'
            const usageDefinition = playerUsageDefinition(usage)
            const scoreBreakdown = result
              ? positionScoreBreakdown(result.current.session, athlete, result.current.event)
              : undefined
            return (
              <Card key={athlete.id} className="p-4 transition hover:border-[#555a4f]">
                <div className="flex items-start gap-3">
                  <Avatar name={athlete.name} photoUrl={athlete.photoUrl} size={52} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/athletes/${athlete.id}`} className="block truncate text-base font-bold text-chalk hover:text-fai">{athlete.name}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {isCategorySort(sort) && result && (
                        <Pill tone="gold">{CATEGORY_SHORT[sort]} {Math.round(result.current.categories[sort])}</Pill>
                      )}
                      <Pill tone="fai">{athlete.positionGroup}</Pill>
                      <Pill tone={usage === 'two-way' ? 'up' : usage === 'iron-man' ? 'gold' : 'default'}>{usageDefinition.shortLabel}</Pill>
                      <span>{playerUsagePlanLine(usage)}</span>
                      <span>· {athletePositionLine(athlete)}</span>
                      <span>· {gradeLabelFor(athlete)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {athlete.heightIn > 0 ? formatHeight(athlete.heightIn) : 'Height not recorded'} · {athlete.weightLbs > 0 ? `${athlete.weightLbs} lbs` : 'Weight not recorded'}
                      {result?.rankEligible ? ` · 2026 Rank #${result.teamRank}` : ''}
                    </div>
                    {scoreBreakdown?.secondaryGroup && typeof scoreBreakdown.secondaryScore === 'number' && (
                      <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-line bg-panel-2/35 p-2 text-center">
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-muted">Baseline {athlete.position || scoreBreakdown.primaryGroup} · {scoreBreakdown.primaryPct}%</div>
                          <div className="text-sm font-black nums text-fai">{scoreBreakdown.primaryScore.toFixed(1)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-muted">Baseline {athlete.secondaryPosition || scoreBreakdown.secondaryGroup} · {scoreBreakdown.secondaryPct}%</div>
                          <div className="text-sm font-black nums text-gold">{scoreBreakdown.secondaryScore.toFixed(1)}</div>
                        </div>
                      </div>
                    )}
                    <PlayerBadgeStrip badges={badges} />
                    {gameBadges.activeAwards.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-fai/20 bg-fai/5 px-2 py-1.5">
                        <div className="flex -space-x-1">
                          {gameBadges.activeAwards.slice(0, 3).map((award) => (
                            <GameDayBadgeArtwork key={award.play.id} badge={award.badge} size={30} />
                          ))}
                        </div>
                        <div className="min-w-0 text-[10px] font-bold text-muted">
                          <div className="truncate text-chalk">{gameBadges.activeAwards.length} active game-day badge{gameBadges.activeAwards.length === 1 ? '' : 's'}</div>
                          <div>{gameBadges.seasonTotal} earned in 2026</div>
                        </div>
                      </div>
                    )}
                    {archetype && (
                      <Link
                        to={`/archetypes#${archetype.id}`}
                        className="mt-2 block rounded-lg border border-fai/20 bg-fai/5 px-2.5 py-2 transition hover:border-fai/50 hover:bg-fai/10"
                        title={`${archetype.description} Based on: ${archetype.evidence.join(', ')}.`}
                      >
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted">2026 archetype · {archetype.confidence} confidence</div>
                        <div className="mt-0.5 truncate text-xs font-black text-fai">{archetype.name}</div>
                        <div className="mt-0.5 truncate text-[10px] text-muted">{archetype.evidence.join(' · ')}</div>
                        <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-fai/80">View meaning →</div>
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
                  {result ? (
                    <>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          {result.current.scoreStatus === 'complete' ? '2026 Official FAI' : '2026 Provisional FAI'}
                        </div>
                        <div className={`text-3xl font-black nums ${result.rankEligible ? 'text-fai' : 'text-flame'}`}>
                          {result.current.fai.toFixed(1)}
                        </div>
                        {scoreBreakdown?.secondaryGroup && (
                          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted">Blended {scoreBreakdown.primaryPct}/{scoreBreakdown.secondaryPct}</div>
                        )}
                        <OverallRatingName score={result.current.fai} compact />
                        {!result.rankEligible && (
                          <div className="mt-1 text-[10px] font-bold text-flame">{result.current.completionPct}% complete</div>
                        )}
                      </div>
                      <Pill tone="fai">2026 season</Pill>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-muted">No 2026 testing data</div>
                      {canEdit && (
                        <Link to={`/entry?athlete=${athlete.id}`} className="rounded-lg border border-fai/40 px-3 py-1 text-xs font-bold text-fai hover:bg-fai/10">+ Add 2026 testing</Link>
                      )}
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
