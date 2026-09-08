import { useState } from 'react'
import type { Athlete, StatKey } from '../types'
import { useStore } from '../store/useStore'
import { Card, Pill, SectionTitle } from './ui'
import { STAT_LABEL, buildAthleteSeasonStats, statFieldsForPosition } from '../lib/playerStats'

const inputClass =
  'rounded-lg border border-line bg-panel px-2 py-1.5 text-sm font-semibold text-chalk outline-none placeholder:text-muted focus:border-fai'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
function shortDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${Number(m[2])}/${Number(m[3])}` : iso
}

const RATE_LABEL: Record<string, string> = {
  ypc: 'YDS/CAR', catchPct: 'CATCH %', ypr: 'YDS/REC', compPct: 'COMP %', ypa: 'YDS/ATT', tacklePct: 'TKL %',
}

export default function PlayerStatsCard({ athlete }: { athlete: Athlete }) {
  const { data, canEdit, savePlayerStat, removePlayerStat } = useStore()
  const fields = statFieldsForPosition(athlete.positionGroup)
  const season = buildAthleteSeasonStats(athlete.id, data.playerStats)
  const ownGames = data.playerStats
    .filter((stat) => stat.athleteId === athlete.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const [date, setDate] = useState(todayIso())
  const [opponent, setOpponent] = useState('')
  const [values, setValues] = useState<Partial<Record<StatKey, string>>>({})

  if (fields.length === 0) {
    return (
      <Card className="p-5">
        <SectionTitle>Game Stats</SectionTitle>
        <div className="mt-2 text-sm text-muted">Box-score stats aren&apos;t tracked for {athlete.positionGroup}.</div>
      </Card>
    )
  }

  function addStatLine() {
    const stats: Partial<Record<StatKey, number>> = {}
    for (const key of fields) {
      const n = Number(values[key])
      if (Number.isFinite(n) && n !== 0) stats[key] = n
    }
    if (Object.keys(stats).length === 0) return
    savePlayerStat({ athleteId: athlete.id, date: date || todayIso(), opponent: opponent.trim() || undefined, stats })
    setValues({})
    setOpponent('')
  }

  const rateEntries = Object.entries(season.rates).filter(([, v]) => v !== undefined) as Array<[string, number]>

  return (
    <Card className="p-5">
      <SectionTitle right={season.games > 0 ? <span className="text-xs font-bold text-muted">{season.games} {season.games === 1 ? 'game' : 'games'}</span> : undefined}>
        Game Stats
      </SectionTitle>

      {season.games > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {fields.filter((k) => (season.totals[k] ?? 0) !== 0).map((key) => (
              <div key={key} className="rounded-lg border border-line bg-panel-2/40 px-2.5 py-1.5">
                <div className="text-[9px] font-bold uppercase tracking-wide text-muted">{STAT_LABEL[key].short}</div>
                <div className="nums text-sm font-black text-chalk">{season.totals[key]}</div>
              </div>
            ))}
          </div>
          {rateEntries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {rateEntries.map(([key, value]) => (
                <Pill key={key} tone="fai">{RATE_LABEL[key] ?? key} {value}</Pill>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 text-sm text-muted">No box-score stats logged yet. Impact events and box-score statistics are recorded separately.</div>
      )}

      {canEdit && (
        <div className="mt-4 rounded-xl border border-line bg-panel-2/25 p-3">
          <div className="text-[11px] font-black uppercase tracking-wide text-muted">Add a game</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayIso())} className={inputClass} aria-label="Game date" />
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Opponent" className={`${inputClass} min-w-32 flex-1`} aria-label="Opponent" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {fields.map((key) => (
              <label key={key} className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                {STAT_LABEL[key].label}
                <input
                  type="number"
                  value={values[key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  className={inputClass}
                  aria-label={STAT_LABEL[key].label}
                />
              </label>
            ))}
          </div>
          <button type="button" onClick={addStatLine} className="mt-3 rounded-lg bg-fai px-4 py-2 text-sm font-black text-ink">+ Add stat line</button>
        </div>
      )}

      {ownGames.length > 0 && (
        <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {ownGames.map((game) => (
            <div key={game.id} className="flex items-center gap-2 bg-panel/40 px-3 py-2 text-[11px]">
              <span className="min-w-20 truncate font-black text-chalk">{game.opponent ?? 'Game'}</span>
              <span className="nums text-muted">{shortDate(game.date)}</span>
              <span className="ml-1 flex-1 truncate text-muted">
                {fields
                  .filter((k) => (game.stats[k] ?? 0) !== 0)
                  .map((k) => `${game.stats[k]} ${STAT_LABEL[k].short}`)
                  .join(' · ') || '—'}
              </span>
              {canEdit && (
                <button type="button" onClick={() => removePlayerStat(game.id)} className="text-muted hover:text-down" aria-label="Delete stat line">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
