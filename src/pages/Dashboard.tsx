import { useMemo } from 'react'
import { rosterForScope, resultsForRoster, ROSTER_SEASON_ID } from '../lib/rosterScope'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { teamStats, type LeaderRow } from '../lib/leaderboards'
import { availableDashboardStats } from '../lib/dashboardAvailable'
import { CATEGORY_SHORT, formatHeight } from '../data/constants'
import {
  Avatar,
  Card,
  DeltaBadge,
  FaiRing,
  RankBadge,
  SectionTitle,
  StatTile,
} from '../components/ui'
import { RadarChart } from '../components/charts'
import type { AthleteResult, Category } from '../types'

function LeaderMini({ label, row, sub }: { label: string; row?: LeaderRow; sub: string }) {
  const { gradeLabelFor } = useStore()
  if (!row) {
    return (
      <Card className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
        <div className="mt-2 text-sm text-muted">No verified measurement yet</div>
      </Card>
    )
  }
  const athlete = row.result.athlete
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <Link to={`/athletes/${athlete.id}`} className="group mt-2 flex items-center gap-3">
        <Avatar name={athlete.name} photoUrl={athlete.photoUrl} size={44} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-chalk group-hover:text-fai">{athlete.name}</div>
          <div className="text-xs text-muted">
            {athlete.positionGroup} · {gradeLabelFor(athlete)}
          </div>
        </div>
      </Link>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-2xl font-black nums text-fai">{row.display}</span>
        <span className="text-[11px] text-muted">{sub}</span>
      </div>
    </Card>
  )
}

function CoverageCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-black nums text-chalk">{value}</div>
      <div className="mt-1 text-xs text-muted">{sub}</div>
    </Card>
  )
}

export default function Dashboard() {
  const { data, resultsForEvent, canEdit } = useStore()
  const roster = useMemo(() => rosterForScope(data.athletes, data.sessions), [data.athletes, data.sessions])
  const results = useMemo(() => resultsForRoster(resultsForEvent(ROSTER_SEASON_ID), roster), [resultsForEvent, roster])
  const stats = useMemo(() => teamStats(results), [results])
  const available = useMemo(() => availableDashboardStats(results), [results])
  const topFive = results.filter((result) => result.rankEligible).slice(0, 5)

  const latestEvent = useMemo(
    () => [...data.events].sort((a, b) => b.startDate.localeCompare(a.startDate))[0],
    [data.events],
  )
  const latestEventEntries = useMemo(
    () =>
      latestEvent
        ? data.sessions.filter((session) => session.eventId === latestEvent.id).length
        : 0,
    [data.sessions, latestEvent],
  )

  const profileAverages = stats.completeCount > 0
    ? stats.categoryAverages
    : available.categoryAverages
  const profileLabel = stats.completeCount > 0 ? 'Official Team Average' : 'Available-Data Average'
  const rankedProfile = profileAverages
    .filter((item) => item.avg > 0)
    .sort((a, b) => a.avg - b.avg)
  const weakestProfile = stats.weakestCategory ?? rankedProfile[0]

  const radar = useMemo(
    () => ({
      label: profileLabel,
      color: '#c8f24a',
      values: Object.fromEntries(
        profileAverages.map((item) => [item.category, item.avg]),
      ) as Record<Category, number>,
    }),
    [profileAverages, profileLabel],
  )

  if (!data.athletes.length) {
    return (
      <Card className="p-10 text-center">
        <div className="text-lg font-bold">No athletes yet</div>
        <div className="mt-1 text-sm text-muted">Add a roster and create a testing event.</div>
        {canEdit && (
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/athletes/new" className="rounded-lg bg-fai px-4 py-2 text-sm font-bold text-ink">Add Athlete</Link>
            <Link to="/data" className="rounded-lg border border-line px-4 py-2 text-sm font-bold">Import Roster</Link>
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="page-kicker">2026 season · Active roster</div>
        <h1 className="page-title">Coach dashboard</h1>
        <p className="page-intro">A clear view of readiness, verified testing, roster coverage, and the athletes driving the program.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card glow className="flex items-center gap-4 p-5">
          {stats.completeCount > 0 ? <FaiRing score={stats.avgFai} size={104} label="Team FAI" /> : <span className="text-4xl text-muted">—</span>}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Official Team Average</div>
            <div className="mt-1 flex items-center gap-2">
              <DeltaBadge
                value={stats.avgImprovement}
                trend={stats.avgImprovement > 0.05 ? 'improved' : stats.avgImprovement < -0.05 ? 'regressed' : 'same'}
                size="lg"
              />
              <span className="text-xs text-muted">avg change</span>
            </div>
          </div>
        </Card>
        <StatTile label="Complete Scores" value={stats.completeCount} sub={`${stats.testedCount} athletes with entries`} accent="fai" />
        <StatTile label="Provisional" value={stats.provisionalCount} sub="Visible, excluded from official ranks" accent="flame" />
        <StatTile
          label={stats.completeCount > 0 ? 'Weakest Official Category' : 'Lowest Available Category'}
          value={weakestProfile ? CATEGORY_SHORT[weakestProfile.category] : '—'}
          sub={weakestProfile ? `${weakestProfile.avg} avg score` : 'Need category measurements'}
          accent="flame"
        />
      </div>

      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-bold text-muted">Historical data coverage · all seasons and alumni</summary>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <CoverageCard label="Athletes" value={data.athletes.length} sub="Consolidated identities" />
          <CoverageCard label="Testing Events" value={data.events.length} sub="Verified event records" />
          <CoverageCard label="Testing Entries" value={data.sessions.length} sub="Saved historical sessions" />
          <CoverageCard
            label="Latest Event"
            value={latestEvent?.name ?? '—'}
            sub={latestEvent ? `${latestEvent.startDate} · ${latestEventEntries} entries` : 'No events yet'}
          />
        </div>
      </details>

      {stats.provisionalCount > 0 && (
        <Card className="border-flame/30 bg-flame/5 p-4 text-sm text-muted">
          Official FAI ranks still require a complete testing battery. Available-data leaders below use verified measurements from partial records and are labeled separately.
        </Card>
      )}

      <section>
        <SectionTitle>Available-Data Leaders · Verified Measurements</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <LeaderMini label="Fastest Recorded (40)" row={available.fastest} sub="best available 40" />
          <LeaderMini label="Strongest Available" row={available.strongest} sub="relative STR" />
          <LeaderMini label="Most Explosive Available" row={available.mostExplosive} sub="PWR score" />
          <LeaderMini label="Best COD Available" row={available.bestCod} sub="COD score" />
          <LeaderMini label="Most Improved Official" row={stats.mostImproved} sub="complete FAI gain" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle right={<Link to="/leaderboards" className="text-xs font-bold text-fai">View all →</Link>}>
            Top 5 · Official FAI
          </SectionTitle>
          {topFive.length ? (
            <div className="space-y-2">{topFive.map((result) => <TopRow key={result.athlete.id} result={result} />)}</div>
          ) : (
            <div className="py-10 text-center text-sm text-muted">
              No athlete has completed the required testing battery yet. Verified partial-record leaders remain visible above.
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>{stats.completeCount > 0 ? 'Official Team Category Profile' : 'Available-Data Category Profile'}</SectionTitle>
          <RadarChart series={[radar]} />
          <div className="mt-2 grid grid-cols-5 gap-1 text-center">
            {profileAverages.map((item) => (
              <div key={item.category}>
                <div className="text-lg font-black nums text-chalk">{item.avg}</div>
                <div className="text-[10px] font-semibold uppercase text-muted">{CATEGORY_SHORT[item.category]}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function TopRow({ result }: { result: AthleteResult }) {
  const { gradeLabelFor } = useStore()
  const athlete = result.athlete
  return (
    <Link
      to={`/athletes/${athlete.id}`}
      className="flex items-center gap-3 rounded-xl border border-transparent bg-panel-2/50 px-3 py-2 transition hover:border-line hover:bg-panel-2"
    >
      <RankBadge rank={result.teamRank} />
      <Avatar name={athlete.name} photoUrl={athlete.photoUrl} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-chalk">{athlete.name}</div>
        <div className="text-xs text-muted">
          {athlete.position} · {athlete.positionGroup} · {gradeLabelFor(athlete)} · {formatHeight(athlete.heightIn)} · {athlete.weightLbs} lbs
        </div>
      </div>
      {result.previous && (
        <DeltaBadge value={result.faiImprovement} trend={result.faiImprovement > 0.05 ? 'improved' : result.faiImprovement < -0.05 ? 'regressed' : 'same'} />
      )}
      <div className="w-14 text-right text-2xl font-black nums text-fai">{result.current.fai.toFixed(1)}</div>
    </Link>
  )
}
