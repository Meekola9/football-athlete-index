import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { athleteTimeline, clamp, computeSessionForPositionGroup, round1 } from '../lib/compute'
import { strengths, weaknesses } from '../lib/progress'
import { buildFaiTrend } from '../lib/faiTrend'
import { buildPlayerGameImpact } from '../lib/playerGameImpact'
import { gameResultLookup } from '../lib/gameRecord'
import FaiTrendMeter from '../components/FaiTrendMeter'
import PlayerGameImpactCard from '../components/PlayerGameImpactCard'
import PlayerStatsCard from '../components/PlayerStatsCard'
import { playerBadgesFor } from '../lib/badges'
import { archetypeFor } from '../lib/archetypes'
import { ArchetypeNameplate } from '../components/ArchetypeNameplate'
import { athleteGameDayBadgeSummary, type AthleteGameDayBadgeSummary } from '../lib/gameDayBadges'
import { SCORED_METRICS, flyTimeToMph } from '../data/scoring'
import { CATEGORIES, CATEGORY_SHORT } from '../data/constants'
import { Card, Pill, SectionTitle } from '../components/ui'
import { rosterForScope, resultsForRoster } from '../lib/rosterScope'
import { PlayerBadgeGallery } from '../components/PlayerBadges'
import { GameDayBadgeAwardCard, GameDayBadgeCountChip } from '../components/GameDayBadges'
import { awarenessBoostForScore, awarenessLevel, latestAwarenessFor } from '../lib/awarenessQuiz'
import { AthletePlayerCard } from '../components/AthletePlayerCard'
import { PlayerUsageSummary } from '../components/PlayerUsageGuide'
import { HomeDevelopmentPlan } from '../components/HomeDevelopmentPlan'
import { RadarChart, ScoreMeter } from '../components/charts'
import { resolveFilm } from '../lib/film'
import type { AthleteResult, Category } from '../types'

const ATHLETE_SEASON_ID = 'season-2026'

function FilmCard({ hudlUrl }: { hudlUrl?: string }) {
  const film = resolveFilm(hudlUrl)
  if (!film) return null
  return (
    <Card className="p-5">
      <SectionTitle>Film</SectionTitle>
      {film.kind === 'embed' ? (
        <div className="mt-1 overflow-hidden rounded-xl border border-line bg-black">
          <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              src={film.src}
              title="Athlete film"
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </div>
      ) : (
        <a
          href={film.href}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-2 rounded-lg bg-flame/15 px-5 py-2.5 text-sm font-bold text-flame transition hover:bg-flame/25"
        >
          ▶ Watch film on {film.provider}
        </a>
      )}
    </Card>
  )
}

const CATEGORY_COLOR: Record<Category, string> = {
  Speed: '#c6f24e',
  Acceleration: '#38bdf8',
  Jump: '#fb7185',
  Power: '#f97316',
  Pursuit: '#c084fc',
  'Change of Direction': '#a78bfa',
  Conditioning: '#34d399',
  Strength: '#fbbf24',
}

function currentSeasonResult(result: AthleteResult): AthleteResult {
  return {
    ...result,
    previous: undefined,
    faiImprovement: 0,
    faiImprovementPct: 0,
  }
}

function GameDayBadgeSection({ summary }: { summary: AthleteGameDayBadgeSummary }) {
  return (
    <Card className="p-5">
      <SectionTitle
        right={(
          <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className="text-fai">{summary.positiveTotal} positive</span>
            <span className="text-down">{summary.negativeTotal} negative</span>
          </div>
        )}
      >
        2026 Game-Day Badges · {summary.seasonTotal}
      </SectionTitle>
      <div className="mb-4 text-xs leading-relaxed text-muted">
        A game-day badge stays active on the player page for seven days. Every award remains in the 2026 season total.
      </div>

      {summary.activeAwards.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.activeAwards.map((award) => (
            <GameDayBadgeAwardCard key={award.play.id} award={award} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line bg-panel-2/25 p-4 text-sm text-muted">
          No game-day badges are active this week.
        </div>
      )}

      {summary.seasonCounts.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">2026 season count</div>
          <div className="flex flex-wrap gap-2">
            {summary.seasonCounts.map((item) => (
              <GameDayBadgeCountChip key={item.badge.key} item={item} />
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

const AWARENESS_TONE: Record<string, 'up' | 'fai' | 'gold' | 'down'> = {
  'Elite IQ': 'up',
  Sharp: 'fai',
  Developing: 'gold',
  'Needs Study': 'down',
}

function AwarenessCard({ athleteId }: { athleteId: string }) {
  const { data } = useStore()
  const latest = latestAwarenessFor(data.awarenessResults, athleteId)
  if (!latest) return null
  return (
    <Card className="p-5">
      <SectionTitle>Football Awareness</SectionTitle>
      <div className="flex items-center gap-4">
        <div className="nums text-5xl font-black leading-none text-chalk">{latest.score}</div>
        <div>
          <Pill tone={AWARENESS_TONE[awarenessLevel(latest.score)]}>{awarenessLevel(latest.score)}</Pill>
          {awarenessBoostForScore(latest.score) > 0 && (
            <span className="ml-2 text-xs font-black text-up">+{awarenessBoostForScore(latest.score)}% FAI</span>
          )}
          <div className="mt-1 text-xs text-muted nums">
            {latest.correct}/{latest.total} correct · {new Date(latest.takenAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function AthleteProfile() {
  const { id } = useParams()
  const [positionView, setPositionView] = useState<'primary' | 'secondary'>('primary')
  const { data, computed, resultsForEvent, gradeLabelFor, canEdit, teamName } = useStore()
  const athlete = id ? data.athletes.find((item) => item.id === id) : undefined
  const activeRoster = rosterForScope(data.athletes, data.sessions)
  const seasonResults = resultsForEvent(ATHLETE_SEASON_ID)
  const scopedResults = activeRoster.some((item) => item.id === id) ? resultsForRoster(seasonResults, activeRoster) : seasonResults
  const result = id ? scopedResults.find((item) => item.athlete.id === id) : undefined
  const timeline = useMemo(
    () => (id
      ? athleteTimeline(computed, id).filter((item) => item.event.id === ATHLETE_SEASON_ID)
      : []),
    [computed, id],
  )
  const gameBadges = id
    ? athleteGameDayBadgeSummary(data.plays, id, 2026)
    : { activeAwards: [], seasonCounts: [], seasonTotal: 0, positiveTotal: 0, negativeTotal: 0 }

  if (!athlete) {
    return (
      <Card className="p-10 text-center">
        <div className="text-lg font-bold">Athlete not found</div>
        <Link to="/athletes" className="mt-3 inline-block text-sm font-semibold text-fai">← Back to athletes</Link>
      </Card>
    )
  }

  if (!result || timeline.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <ProfileNav athleteId={athlete.id} />
        <AthletePlayerCard
          athlete={athlete}
          teamName={teamName}
          gradeLabel={gradeLabelFor(athlete, 'long')}
          weightLbs={athlete.weightLbs}
          statusLabel="No 2026 testing"
        />
        <PlayerUsageSummary athlete={athlete} />
        <Card className="p-6">
          <div className="rounded-xl border border-dashed border-line bg-panel-2/30 p-6 text-center">
            <div className="text-base font-bold text-chalk">No 2026 testing data yet</div>
            <div className="mt-1 text-sm text-muted">Complete the testing battery to activate the rating, archetype, ranks, weaknesses, and at-home development plan.</div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {canEdit && (
                <Link to={`/entry?athlete=${athlete.id}`} className="inline-block rounded-lg bg-fai px-5 py-2 text-sm font-bold text-ink">+ Enter 2026 Testing Data</Link>
              )}
              <Link to="/leaderboards" className="inline-block rounded-lg border border-line px-5 py-2 text-sm font-bold text-chalk">View Rankings</Link>
            </div>
          </div>
        </Card>
        <GameDayBadgeSection summary={gameBadges} />
      </div>
    )
  }

  const displayResult = currentSeasonResult(result)
  const { current, rankEligible } = displayResult
  const faiTrend = buildFaiTrend(
    athlete,
    displayResult.baseFai,
    data.plays ?? [],
    displayResult.awarenessBoostPct,
  )
  const gameImpact = buildPlayerGameImpact(athlete, data.plays ?? [])
  const gameScores = gameResultLookup(data.gameResults ?? [])
  const primaryGroup = current.session.positionGroupSnapshot ?? athlete.positionGroup
  const primaryPosition = computeSessionForPositionGroup(
    current.session,
    athlete,
    current.event,
    primaryGroup,
  )
  const secondaryGroup = athlete.secondaryPositionGroup
  const secondaryPosition = secondaryGroup
    ? computeSessionForPositionGroup(
        {
          ...current.session,
          positionSnapshot: athlete.secondaryPosition ?? secondaryGroup,
          positionGroupSnapshot: secondaryGroup,
        },
        {
          ...athlete,
          position: athlete.secondaryPosition ?? secondaryGroup,
          positionGroup: secondaryGroup,
        },
        current.event,
        secondaryGroup,
      )
    : undefined
  const viewingSecondary = positionView === 'secondary' && Boolean(secondaryPosition && secondaryGroup)
  const selectedPosition = viewingSecondary && secondaryPosition ? secondaryPosition : primaryPosition
  const selectedGroup = viewingSecondary && secondaryGroup ? secondaryGroup : primaryGroup
  const selectedPositionName = viewingSecondary
    ? athlete.secondaryPosition ?? secondaryGroup ?? 'Secondary'
    : athlete.position
  const totalBoostPct =
    displayResult.impactBoostPct + displayResult.awarenessBoostPct + displayResult.efficiencyBoostPct
  const positionCurrent = {
    ...selectedPosition,
    fai: round1(clamp(selectedPosition.fai * (1 + totalBoostPct / 100), 0, 100)),
  }
  const positionArchetype = archetypeFor(positionCurrent)
  const strong = strengths(positionCurrent)
  const weak = weaknesses(positionCurrent)
  const badges = playerBadgesFor({ result: displayResult, timeline })
  const radarSeries = [
    { label: `${selectedGroup} view`, color: '#c8f24a', values: positionCurrent.categories as Record<Category, number> },
  ]

  return (
    <div className="space-y-6">
      <ProfileNav athleteId={athlete.id} />

      <AthletePlayerCard
        athlete={athlete}
        score={current.fai}
        archetype={positionArchetype?.name}
        teamName={teamName}
        gradeLabel={gradeLabelFor(athlete, 'long')}
        weightLbs={current.session.weightLbsSnapshot ?? athlete.weightLbs}
        rankEligible={rankEligible}
        teamRank={displayResult.teamRank}
        teamCount={displayResult.teamCount}
        groupRank={displayResult.groupRank}
        groupCount={displayResult.groupCount}
        strongestTrait={strong[0] ? `${strong[0]} ${positionCurrent.categories[strong[0]].toFixed(0)}` : undefined}
        statusLabel={rankEligible ? 'Official 2026 score' : `${current.scoreStatus} · ${current.completionPct}% complete`}
      />

      {positionArchetype && (
        <ArchetypeNameplate archetype={positionArchetype} positionLabel={`${selectedGroup} · ${athlete.position}`} />
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="fai">2026 season</Pill>
          <Pill tone={rankEligible ? 'up' : 'gold'}>{rankEligible ? 'Official score' : `${current.scoreStatus} · ${current.completionPct}% complete`}</Pill>
          {displayResult.impactBoostPct > 0 && <Pill tone="fai">Playmaker +{displayResult.impactBoostPct}%</Pill>}
          {displayResult.awarenessBoostPct > 0 && <Pill tone="fai">Awareness +{displayResult.awarenessBoostPct}%</Pill>}
          {displayResult.efficiencyBoostPct > 0 && <Pill tone="up">Efficiency +{displayResult.efficiencyBoostPct}%</Pill>}
          {displayResult.efficiencyBoostPct < 0 && <Pill tone="down">Efficiency {displayResult.efficiencyBoostPct}%</Pill>}
          <Pill>Tested baseline {displayResult.baseFai.toFixed(1)}</Pill>
          <Pill>Adjusted FAI {current.fai.toFixed(1)}</Pill>
          {totalBoostPct !== 0 && <Pill tone="gold">{totalBoostPct > 0 ? 'Boosted' : 'Adjusted'} from {displayResult.baseFai.toFixed(1)}</Pill>}
          {typeof current.metrics.bestFly === 'number' && current.metrics.bestFly > 0 && <Pill tone="gold">Top Speed {flyTimeToMph(current.metrics.bestFly).toFixed(1)} mph</Pill>}
        </div>
        {!rankEligible && (
          <div className="mt-3 rounded-xl border border-flame/30 bg-flame/5 p-3 text-sm text-muted">
            This score is visible for coaching feedback but is excluded from official rankings until all required tests are complete.
          </div>
        )}
        {(faiTrend.points.length > 0 || gameImpact.length > 0) && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {faiTrend.points.length > 0 && <FaiTrendMeter trend={faiTrend} />}
            {gameImpact.length > 0 && <PlayerGameImpactCard games={gameImpact} scores={gameScores} />}
          </div>
        )}
      </Card>

      <PlayerStatsCard athlete={athlete} />

      <Card className="p-5">
        <SectionTitle right={<Link to="/badges" className="text-xs font-bold text-gold hover:underline">Badge guide →</Link>}>
          2026 Testing Badges · {badges.length}
        </SectionTitle>
        <PlayerBadgeGallery badges={badges.slice(0, 3)} />
        {badges.length > 3 && <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-gold">View {badges.length - 3} more testing badges</summary><div className="mt-3"><PlayerBadgeGallery badges={badges.slice(3)} /></div></details>}
      </Card>

      <GameDayBadgeSection summary={gameBadges} />

      <AwarenessCard athleteId={athlete.id} />

      <FilmCard hudlUrl={athlete.hudlUrl} />

      {secondaryPosition && secondaryGroup && (
        <Card className="border-fai/25 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-fai">Position Stats</div>
              <div className="mt-1 text-sm text-muted">Compare the same testing results against each position's benchmarks.</div>
            </div>
            <div className="flex rounded-xl border border-line bg-ink p-1" role="tablist" aria-label="Position statistics view">
              <button
                type="button"
                role="tab"
                aria-selected={!viewingSecondary}
                onClick={() => setPositionView('primary')}
                className={`rounded-lg px-3 py-2 text-xs font-black transition ${!viewingSecondary ? 'bg-fai text-ink' : 'text-muted hover:text-chalk'}`}
              >
                Primary · {athlete.position}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewingSecondary}
                onClick={() => setPositionView('secondary')}
                className={`rounded-lg px-3 py-2 text-xs font-black transition ${viewingSecondary ? 'bg-fai text-ink' : 'text-muted hover:text-chalk'}`}
              >
                Secondary · {athlete.secondaryPosition ?? secondaryGroup}
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Pill tone="fai">{selectedPositionName} · {selectedGroup}</Pill>
            <Pill tone="gold">{positionCurrent.fai.toFixed(1)} position FAI</Pill>
            {positionArchetype && <Pill>{positionArchetype.name}</Pill>}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Comparison view only. The official blended FAI and rankings above do not change.
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle right={<span className="text-xs font-bold text-fai">● {selectedGroup}</span>}>
            {selectedPositionName} Category Profile
          </SectionTitle>
          <RadarChart series={radarSeries} />
          <div className="mt-3 space-y-2">
            {CATEGORIES.map((category) => (
              <div key={category} className="flex items-center gap-3">
                <div className="w-10 text-xs font-bold text-muted">{CATEGORY_SHORT[category]}</div>
                <div className="flex-1"><ScoreMeter value={positionCurrent.categories[category]} color={CATEGORY_COLOR[category]} /></div>
                <div className="w-10 text-right text-sm font-black nums text-chalk">{positionCurrent.categories[category].toFixed(0)}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-down/30 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">2026 Development Need</div>
              <div className="mt-1.5">
                {weak.length ? (
                  <>
                    <div className="text-lg font-black text-flame">{weak[0]}</div>
                    <div className="mt-1 text-xs text-muted">Lowest flagged 2026 category.</div>
                  </>
                ) : <div className="text-xs text-muted">No major weakness flagged.</div>}
              </div>
            </Card>
            <Card className="border-fai/30 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Suggested Focus</div>
              <div className="mt-1.5">
                {weak.length ? (
                  <>
                    <div className="text-lg font-black text-fai">{weak[0]}</div>
                    <div className="mt-1 text-xs text-muted">Prioritize this category next block.</div>
                  </>
                ) : <div className="text-xs text-muted">Maintain the current 2026 profile.</div>}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-up">2026 Strengths</div>
              <div className="flex flex-wrap gap-1.5">{strong.length ? strong.map((category) => <Pill key={category} tone="up">{category} · {positionCurrent.categories[category].toFixed(0)}</Pill>) : <span className="text-xs text-muted">Building baseline strengths.</span>}</div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-down">2026 Weaknesses</div>
              <div className="flex flex-wrap gap-1.5">{weak.length ? weak.map((category) => <Pill key={category} tone="down">{category} · {positionCurrent.categories[category].toFixed(0)}</Pill>) : <span className="text-xs text-muted">No major weakness flagged.</span>}</div>
            </Card>
          </div>

          <HomeDevelopmentPlan
            categories={weak}
            scores={positionCurrent.categories}
            title={`${selectedPositionName} At-Home Development`}
          />
        </div>
      </div>

      <Card className="p-5">
        <SectionTitle>{selectedPositionName} Test Scores</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="py-2 pr-3">Test</th>
                <th className="px-3">Category</th>
                <th className="px-3 text-right">2026 Result</th>
                <th className="px-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {SCORED_METRICS.map((metric) => {
                const raw = positionCurrent.metrics[metric.key]
                const score = positionCurrent.normalized[metric.key]
                return (
                  <tr key={metric.key} className="border-b border-line/50">
                    <td className="py-2 pr-3 font-semibold text-chalk">{metric.label}</td>
                    <td className="px-3 text-xs text-muted">{CATEGORY_SHORT[metric.category]}</td>
                    <td className="px-3 text-right nums font-bold text-chalk">
                      {formatMetric(raw, metric.unit)}
                      {metric.key === 'bestFly' && typeof raw === 'number' && raw > 0 && (
                        <span className="ml-1 text-xs font-semibold text-muted">
                          ({flyTimeToMph(raw).toFixed(1)} mph)
                        </span>
                      )}
                    </td>
                    <td className="px-3 text-right nums text-fai">{typeof score === 'number' ? score.toFixed(0) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-center text-xs text-muted">
        Athlete pages display 2026 only. <Link to="/leaderboards" className="font-bold text-fai hover:underline">View historical seasons in Rankings.</Link>
      </div>
    </div>
  )
}

function ProfileNav({ athleteId }: { athleteId: string }) {
  const { canEdit } = useStore()
  return (
    <div className="flex items-center justify-between">
      <Link to="/athletes" className="text-sm font-semibold text-muted hover:text-chalk">← Athletes</Link>
      {canEdit && (
        <div className="flex gap-2">
          <Link to={`/entry?athlete=${athleteId}`} className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-chalk hover:bg-panel-2">+ Testing</Link>
          <Link to={`/athletes/${athleteId}/edit`} className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-chalk hover:bg-panel-2">Edit</Link>
        </div>
      )}
    </div>
  )
}

function formatMetric(value: number | undefined, unit: string): string {
  if (typeof value !== 'number') return '—'
  if (unit === 's' || unit === 'x') return `${value.toFixed(2)}${unit}`
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`
}
