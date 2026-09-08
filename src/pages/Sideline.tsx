import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Card, Pill, SectionTitle, StatTile } from '../components/ui'
import { usePageMemory } from '../hooks/usePageMemory'
import { opponentsFromFilm } from '../lib/filmAnalysis'
import { buildSidelineReport, type SidelineNumber } from '../lib/sidelineDashboard'
import { buildChiefKingPlaybook, planForOpponent } from '../lib/chiefToKing'
import { ChiefKingWorksheet } from '../components/ChiefKingWorksheet'
import { SAMPLE_GAME_OPPONENT } from '../data/sampleData'

type Accent = 'chalk' | 'fai' | 'gold' | 'flame' | 'up'

/** Color a tile: margins by sign (good/bad), rates by strength. */
function accentFor(n: SidelineNumber): Accent {
  if (n.sample === 0) return 'chalk'
  if (n.key === 'explosive' || n.key === 'negative' || n.key === 'hidden') {
    return n.value > 0 ? 'up' : n.value < 0 ? 'flame' : 'gold'
  }
  // rates: success / box / havoc
  return n.value >= 0.5 ? 'up' : n.value >= 0.35 ? 'gold' : 'flame'
}

export default function Sideline() {
  const { data, canEdit, saveChiefKingPlan, removeChiefKingPlan, loadSampleGame, clearSampleGame } = useStore()
  const [opponent, setOpponent] = usePageMemory('fai:sideline:opponent', '')
  const sampleLoaded = data.chiefKingPlans.some((p) => p.id === 'ck-central')
  const opponents = useMemo(() => opponentsFromFilm(data.filmPlays), [data.filmPlays])
  const report = useMemo(
    () => buildSidelineReport(data.filmPlays, data.plays, opponent || undefined),
    [data.filmPlays, data.plays, opponent],
  )

  const chiefKingPlan = useMemo(
    () => planForOpponent(data.chiefKingPlans, opponent || undefined),
    [data.chiefKingPlans, opponent],
  )
  const chiefKingPlaybook = chiefKingPlan ? buildChiefKingPlaybook(chiefKingPlan) : undefined

  const hasData = report.offensiveSnaps + report.defensiveSnaps > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            Sideline <span className="text-fai">Dashboard</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The six numbers that drive game management, live from your charted plays. Deep data is one tap away.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            sampleLoaded ? (
              <button
                type="button"
                onClick={() => { clearSampleGame(); if (opponent === SAMPLE_GAME_OPPONENT) setOpponent('') }}
                className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-muted hover:text-down"
              >
                Remove sample game
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { loadSampleGame(); setOpponent(SAMPLE_GAME_OPPONENT) }}
                className="rounded-lg border border-fai/40 bg-fai/10 px-3 py-2 text-xs font-bold text-fai"
              >
                Load sample game
              </button>
            )
          )}
          <label htmlFor="sideline-opponent" className="text-[11px] font-bold uppercase tracking-wider text-muted">Opponent</label>
          <select id="sideline-opponent"
            value={opponent}
            onChange={(event) => setOpponent(event.target.value)}
            className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-bold text-chalk outline-none focus:border-fai"
          >
            <option value="">All charted film</option>
            {opponents.map((opp) => (
              <option key={opp} value={opp}>vs {opp}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="fai">{report.offensiveSnaps} offensive snaps</Pill>
        <Pill tone="gold">{report.defensiveSnaps} defensive snaps</Pill>
        {opponent && <Pill>vs {opponent}</Pill>}
      </div>

      {!hasData ? (
        <Card className="p-8 text-center text-muted">
          No charted plays yet{opponent ? ` for ${opponent}` : ''}. Tag plays in the{' '}
          <Link to="/film" className="font-bold text-fai hover:underline">Film Room</Link> — down, distance, gain,
          box count, and hidden yards — and the six numbers fill in automatically.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {report.numbers.map((n) => (
              <StatTile
                key={n.key}
                label={n.label}
                value={n.display}
                accent={accentFor(n)}
                sub={n.sample === 0 ? `No data yet — ${n.hint}` : n.hint}
              />
            ))}
          </div>

          <div>
            <SectionTitle>Automatic alerts</SectionTitle>
            {report.alerts.length === 0 ? (
              <Card className="mt-2 p-4 text-sm text-muted">
                Not enough charted snaps yet to call a matchup or tendency — keep tagging.
              </Card>
            ) : (
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {report.alerts.map((a) => (
                  <Card key={a.key} className="border-fai/30 p-4">
                    <div className="text-[10px] font-black uppercase tracking-wider text-fai">{a.label}</div>
                    <div className="mt-1 text-sm font-semibold text-chalk">{a.detail}</div>
                  </Card>
                ))}
                <Card className={`p-4 ${chiefKingPlaybook?.complete ? 'border-flame/40' : 'border-line'}`}>
                  <div className="text-[10px] font-black uppercase tracking-wider text-flame">Chief-to-King target</div>
                  <div className="mt-1 text-sm font-semibold text-chalk">
                    {chiefKingPlaybook?.complete
                      ? chiefKingPlaybook.alertDetail
                      : opponent
                        ? 'Fill in the Chief-to-King plan below to activate this target.'
                        : 'Pick a game above, then build the Chief-to-King plan below.'}
                  </div>
                </Card>
              </div>
            )}
          </div>

          {canEdit && opponent && (
            <div>
              <SectionTitle>Chief-to-King plan</SectionTitle>
              <div className="mt-2">
                <ChiefKingWorksheet
                  key={opponent}
                  opponent={opponent}
                  plan={chiefKingPlan}
                  onSave={saveChiefKingPlan}
                  onRemove={removeChiefKingPlan}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-sm">
            <Link to="/film" className="rounded-lg border border-line px-3 py-2 font-bold text-chalk hover:border-fai">
              Full scouting report →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
