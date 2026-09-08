import { useMemo } from 'react'
import { rosterForScope, resultsForRoster, ROSTER_SEASON_ID } from '../lib/rosterScope'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import {
  ALL_LEADERBOARDS,
  CATEGORY_LEADERBOARDS,
  OFFICIAL_LEADERBOARDS,
  TEST_LEADERBOARDS,
  positionGroupBoards,
  type LeaderboardDef,
} from '../lib/leaderboards'
import { Avatar, Card, DeltaBadge, Pill, RankBadge, SectionTitle } from '../components/ui'
import { OverallRatingName } from '../components/OverallRatingName'
import { FilterBar, EMPTY_FILTERS, applyFilters, type FilterState } from '../components/Filters'
import { seasonEvents } from '../lib/events'
import { OVERALL_RATING_BANDS } from '../lib/overallRatings'
import { usePageMemory, usePageScrollMemory } from '../hooks/usePageMemory'
import type { AthleteResult } from '../types'

function trendOf(value: number) {
  return value > 0.05 ? 'improved' : value < -0.05 ? 'regressed' : ('same' as const)
}

function BoardRows({ definition, results }: { definition: LeaderboardDef; results: AthleteResult[] }) {
  const { gradeLabelFor } = useStore()
  const rows = definition.rows(results)
  if (!rows.length) {
    return (
      <div className="p-4 text-sm text-muted">
        {definition.scope === 'official'
          ? 'No complete testing batteries are available for this official board.'
          : 'No verified measurements are available for this board.'}
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const athlete = row.result.athlete
        return (
          <Link
            key={athlete.id}
            to={`/athletes/${athlete.id}`}
            className="flex items-center gap-3 rounded-xl bg-panel-2/40 px-3 py-2 transition hover:bg-panel-2"
          >
            <RankBadge rank={row.rank} />
            <Avatar name={athlete.name} photoUrl={athlete.photoUrl} size={38} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-chalk">{athlete.name}</div>
              <div className="text-xs text-muted">
                {athlete.positionGroup} · {gradeLabelFor(athlete)}
                {definition.scope === 'available' && (
                  <> · {row.result.rankEligible ? 'complete battery' : 'partial battery'}</>
                )}
              </div>
            </div>
            {definition.scope === 'official' && definition.id !== 'improved' && row.result.previous && (
              <DeltaBadge value={row.result.faiImprovement} trend={trendOf(row.result.faiImprovement)} />
            )}
            <div className="w-28 text-right">
              <div className="text-xl font-black nums text-fai">{row.display}</div>
              {definition.id === 'fai' && (
                <div className="mt-1 flex justify-end"><OverallRatingName score={row.result.current.fai} compact /></div>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function firstPopulatedBoard(results: AthleteResult[]): string {
  const preferred = [
    'fai',
    'test-best40',
    'test-benchMax',
    'test-squatMax',
    'speed',
    'power',
    'cod',
    'strength',
  ]
  return preferred.find((id) => ALL_LEADERBOARDS.find((board) => board.id === id)?.rows(results).length)
    ?? ALL_LEADERBOARDS.find((board) => board.rows(results).length)?.id
    ?? 'fai'
}

export default function Leaderboards() {
  const { data, results, resultsForEvent } = useStore()
  const [filters, setFilters] = usePageMemory<FilterState>('fai:rankings:filters:v2', { ...EMPTY_FILTERS, eventId: ROSTER_SEASON_ID })
  const [boardId, setBoardId] = usePageMemory('fai:rankings:board', () => firstPopulatedBoard(results))
  usePageScrollMemory('fai:rankings:scroll')

  const selectedResults = useMemo(
    () => filters.eventId === ROSTER_SEASON_ID
      ? resultsForRoster(resultsForEvent(filters.eventId), rosterForScope(data.athletes, data.sessions))
      : (filters.eventId ? resultsForEvent(filters.eventId) : results),
    [filters.eventId, resultsForEvent, results, data.athletes, data.sessions],
  )
  const filtered = useMemo(
    () => applyFilters(selectedResults, filters),
    [selectedResults, filters],
  )
  const board = ALL_LEADERBOARDS.find((item) => item.id === boardId) ?? ALL_LEADERBOARDS[0]
  const boardRows = useMemo(() => board.rows(filtered), [board, filtered])
  const groupBoards = useMemo(() => positionGroupBoards(filtered), [filtered])
  const provisional = filtered.filter((result) => !result.rankEligible).length
  const seasons = useMemo(() => seasonEvents(data), [data])
  const selectedEvent = seasons.find((event) => event.id === filters.eventId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Rankings</h1>
          <div className="mt-1 text-xs text-muted">
            Official FAI ranks require a complete battery. Available-data boards use every verified measurement.
          </div>
          {selectedEvent && (
            <div className="mt-1 text-xs text-muted">
              {selectedEvent.name} season · best mark per test that year{filters.eventId === ROSTER_SEASON_ID ? ' · active roster' : ' · historical roster'}
            </div>
          )}
        </div>
        <FilterBar events={seasons} value={filters} onChange={setFilters} resetValue={{ ...EMPTY_FILTERS, eventId: ROSTER_SEASON_ID }} />
      </div>

      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-bold text-muted">Overall FAI rating guide</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {OVERALL_RATING_BANDS.map((band) => (
            <div key={band.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2/40 px-2.5 py-1.5">
              <span className="text-[10px] font-black text-chalk">{band.rangeLabel}</span>
              <span className="text-[10px] text-muted">{band.label}</span>
            </div>
          ))}
        </div>
      </details>

      {provisional > 0 && (
        <div className="rounded-lg border border-flame/30 bg-flame/5 px-4 py-3 text-sm text-muted">
          {provisional} provisional or insufficient score{provisional === 1 ? '' : 's'} are excluded from
          official FAI and position-group ranks, but appear on available-data boards when a verified measurement exists.
        </div>
      )}

      <label className="block text-sm font-bold text-muted">
        Ranking metric
        <select aria-label="Ranking metric" value={boardId} onChange={(event) => setBoardId(event.target.value)} className="mt-2 block w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-chalk sm:w-auto">
          <optgroup label="Official FAI">{OFFICIAL_LEADERBOARDS.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
          <optgroup label="Available categories">{CATEGORY_LEADERBOARDS.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
          <optgroup label="Available tests">{TEST_LEADERBOARDS.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
        </select>
      </label>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            right={(
              <div className="flex items-center gap-2">
                <Pill>{board.scope === 'official' ? 'Official' : 'Available data'}</Pill>
                <Pill>{boardRows.length} ranked</Pill>
              </div>
            )}
          >
            {board.title}
          </SectionTitle>
          {board.subtitle && <div className="mb-3 text-xs text-muted">{board.subtitle}</div>}
          <BoardRows definition={board} results={filtered} />
        </Card>

        <Card className="p-5">
          <SectionTitle>Official Position Group Rankings</SectionTitle>
          <div className="mb-3 text-xs text-muted">Complete testing batteries only.</div>
          <div className="space-y-4">
            {groupBoards.length === 0 && <div className="text-sm text-muted">No complete group rankings.</div>}
            {groupBoards.map((groupBoard) => (
              <div key={groupBoard.group}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded-md bg-flame/15 px-2 py-0.5 text-xs font-black text-flame">{groupBoard.group}</span>
                  <span className="text-xs text-muted">{groupBoard.rows.length} ranked</span>
                </div>
                <div className="space-y-1">
                  {groupBoard.rows.slice(0, 3).map((row) => (
                    <Link
                      key={row.result.athlete.id}
                      to={`/athletes/${row.result.athlete.id}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-panel-2"
                    >
                      <span className="w-4 text-center font-black nums text-muted">{row.rank}</span>
                      <span className="flex-1 truncate font-semibold text-chalk">{row.result.athlete.name}</span>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-black nums text-fai">{row.display}</span>
                        <OverallRatingName score={row.result.current.fai} compact />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
