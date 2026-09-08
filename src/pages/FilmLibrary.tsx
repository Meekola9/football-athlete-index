import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ARCHETYPE_FILM_LIBRARY,
  searchArchetypeFilmLibrary,
  type ArchetypeFilmModel,
} from '../lib/archetypeFilmLibrary'
import { Card, Pill } from '../components/ui'

const POSITION_GROUPS = [...new Set(ARCHETYPE_FILM_LIBRARY.map((item) => item.positionGroup))]

function ModelCard({ item }: { item: ArchetypeFilmModel }) {
  return (
    <Card className="overflow-hidden border-line p-0">
      <div className="border-b border-line bg-panel-2/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fai">{item.positionGroup} · FAI DNA</div>
            <h2 className="mt-1 text-2xl font-black text-chalk">{item.faiName}</h2>
          </div>
          <Pill tone={item.verified ? 'up' : 'gold'}>{item.verified ? 'Film verified' : 'Study model'}</Pill>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{item.playStyle}</p>
      </div>

      <div className="grid gap-px bg-line md:grid-cols-2">
        <div className="bg-panel p-5">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">Professional model</div>
          <div className="mt-1 text-xl font-black text-fai">{item.professionalModel}</div>
          <div className="mt-2 text-xs leading-relaxed text-muted">Study how the professional model applies this play style against NFL-level speed, leverage, and structure.</div>
        </div>
        <div className="bg-panel p-5">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">College model</div>
          <div className="mt-1 text-xl font-black text-flame">{item.collegeModel}</div>
          <div className="mt-2 text-xs leading-relaxed text-muted">Use the college model to see the traits in a developmental setting closer to high-school projection.</div>
        </div>
      </div>

      <div className="p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">What to study</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {item.studyTopics.map((topic) => <Pill key={topic}>{topic}</Pill>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-muted">
          {item.fitTierSupport.map((tier) => <span key={tier} className="rounded-md border border-line px-2 py-1">{tier} fit</span>)}
        </div>
      </div>
    </Card>
  )
}

export default function FilmLibrary() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [position, setPosition] = useState(params.get('position') ?? '')
  const [topic, setTopic] = useState(params.get('topic') ?? '')
  const selectedArchetype = params.get('archetype') ?? ''

  const results = useMemo(() => {
    const filtered = searchArchetypeFilmLibrary({ query, positionGroup: position, studyTopic: topic })
    return selectedArchetype ? filtered.filter((item) => item.archetypeId === selectedArchetype) : filtered
  }, [query, position, topic, selectedArchetype])

  function clearFilters() {
    setQuery('')
    setPosition('')
    setTopic('')
    setParams({})
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <div className="text-[11px] font-black uppercase tracking-[0.25em] text-fai">FAI Film Intelligence</div>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-chalk sm:text-4xl">Player Study Guide</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">Browse professional and college study references for each FAI archetype. This guide contains study topics, not a playable clip collection. These are film-study references—not claims that testing alone proves technique, instincts, production, or football IQ.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/film" className="rounded-xl border border-fai/40 bg-fai/10 px-4 py-2 text-sm font-black text-fai">Open Film Room</Link>
            <Link to="/development" className="rounded-xl border border-line px-4 py-2 text-sm font-black text-chalk">Development Hub</Link>
          </div>
        </div>
      </section>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]">
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted">Search player or style</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Josh Allen, route technician, ball tracking…" className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm text-chalk outline-none focus:border-fai" />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted">Position</span>
            <select value={position} onChange={(event) => setPosition(event.target.value)} className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm text-chalk outline-none focus:border-fai">
              <option value="">All positions</option>
              {POSITION_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted">Study topic</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Leverage, timing…" className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm text-chalk outline-none focus:border-fai" />
          </label>
          <button type="button" onClick={clearFilters} className="self-end rounded-xl border border-line px-4 py-2.5 text-sm font-black text-muted hover:text-chalk">Clear</button>
        </div>
        <div className="mt-3 text-xs font-bold text-muted">{results.length} of {ARCHETYPE_FILM_LIBRARY.length} archetypes</div>
      </Card>

      {results.length > 0 ? (
        <div className="grid gap-5 xl:grid-cols-2">{results.map((item) => <ModelCard key={item.archetypeId} item={item} />)}</div>
      ) : (
        <Card className="p-10 text-center">
          <div className="text-lg font-black text-chalk">No film models match those filters.</div>
          <button type="button" onClick={clearFilters} className="mt-3 text-sm font-bold text-fai hover:underline">Show the full library</button>
        </Card>
      )}
    </div>
  )
}
