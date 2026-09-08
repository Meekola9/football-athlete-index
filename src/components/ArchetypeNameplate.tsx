import { Link } from 'react-router-dom'
import { CATEGORY_SHORT } from '../data/constants'
import type { Category } from '../types'
import type { PlayerArchetype } from '../lib/archetypes'
import { filmModelForArchetype } from '../lib/archetypeFilmLibrary'

const CONFIDENCE_LABEL: Record<PlayerArchetype['confidence'], string> = {
  high: 'High match',
  medium: 'Likely match',
  low: 'Early read',
}

interface NameplateStat {
  label: string
  value: string
}

function parseEvidence(evidence: readonly string[]): NameplateStat[] {
  return evidence.map((entry) => {
    const cut = entry.lastIndexOf(' ')
    if (cut < 0) return { label: entry, value: '' }
    const category = entry.slice(0, cut)
    return {
      label: CATEGORY_SHORT[category as Category] ?? category,
      value: entry.slice(cut + 1),
    }
  })
}

export function ArchetypeNameplate({
  archetype,
  positionLabel,
}: {
  archetype: PlayerArchetype
  positionLabel?: string
}) {
  const stats = parseEvidence(archetype.evidence)
  const filmModel = filmModelForArchetype(archetype.id)

  return (
    <section
      aria-label={`${archetype.name} archetype`}
      className="relative overflow-hidden rounded-2xl border border-line px-6 py-8 text-center"
      style={{
        background:
          'radial-gradient(120% 120% at 30% -10%, rgba(198,242,78,0.10), transparent 60%), linear-gradient(160deg, #0c1015, #060809)',
      }}
    >
      <div className="text-[0.7rem] font-extrabold uppercase tracking-[0.3em] text-muted">
        {positionLabel ?? archetype.positionGroup} · {CONFIDENCE_LABEL[archetype.confidence]}
      </div>
      <h2 className="archetype-title mx-auto mt-2 max-w-[16ch] text-[clamp(1.9rem,6.5vw,3.6rem)] font-black uppercase italic leading-[0.95] tracking-[-0.02em]">
        {archetype.name}
      </h2>
      {stats.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-x-9 gap-y-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center">
              <span className="archetype-stat-val nums text-[clamp(1.6rem,5vw,2.5rem)] font-black leading-none text-chalk">
                {stat.value}
              </span>
              <span className="mt-1 text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-muted">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {filmModel && (
        <div className="mx-auto mt-7 max-w-3xl rounded-2xl border border-fai/25 bg-fai/5 p-4 text-left">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fai">Suggested film-study reference</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Professional model</div>
              <div className="text-lg font-black text-chalk">{filmModel.professionalModel}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">College model</div>
              <div className="text-lg font-black text-chalk">{filmModel.collegeModel}</div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{filmModel.playStyle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {filmModel.studyTopics.map((topic) => (
              <span key={topic} className="rounded-md border border-line bg-ink/60 px-2 py-1 text-[10px] font-bold text-muted">{topic}</span>
            ))}
          </div>
          <Link to={`/film-library?archetype=${encodeURIComponent(archetype.id)}`} className="mt-4 inline-flex rounded-lg border border-fai/40 bg-fai/10 px-3 py-2 text-xs font-black text-fai hover:bg-fai/15">
            Open film study plan →
          </Link>
        </div>
      )}
    </section>
  )
}
