import type {
  AppData,
  Athlete,
  AwarenessResult,
  FilmAnnotation,
  FilmPlay,
  FilmSource,
  FilmCatalogEntry,
  ChiefEntry,
  ChiefKingPlan,
  GameResult,
  PlayerGameStat,
  KingPosition,
  PlayCall,
  PlaySide,
  FieldHash,
  PlayEvent,
  PositionGroup,
  TestSession,
  TestingEvent,
  TestingPhase,
} from '../types'
import { normalizeAppData } from '../lib/events'
import { consolidateAthleteAliases } from '../lib/athleteIdentity'
import { decodeCloudPosition, encodeCloudPosition } from '../data/positions'
import { supabase } from '../lib/supabase'

interface TeamAccess {
  id: string
  name: string
  role: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured for this build.')
  return supabase
}

function requiredNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function throwIfError(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message}`)
}

export async function loadTeamAccess(userId: string): Promise<TeamAccess | null> {
  const db = client()
  const { data: membership, error: membershipError } = await db
    .from('team_members')
    .select('team_id, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  throwIfError(membershipError, 'Could not load team membership')
  if (!membership) return null

  const { data: team, error: teamError } = await db
    .from('teams')
    .select('id, name')
    .eq('id', membership.team_id)
    .single()

  throwIfError(teamError, 'Could not load team')
  if (!team) return null

  return {
    id: String(team.id),
    name: String(team.name),
    role: String(membership.role),
  }
}

export async function loadCloudData(teamId: string): Promise<Required<AppData>> {
  const db = client()
  const [athleteResult, eventResult, sessionResult, playResult, filmResult, sourceResult, catalogResult, planResult, awarenessResult, gameResultResult, playerStatResult] =
    await Promise.all([
      db.from('athletes').select('*').eq('team_id', teamId),
      db.from('testing_events').select('*').eq('team_id', teamId),
      db.from('test_sessions').select('*').eq('team_id', teamId),
      db.from('play_events').select('*').eq('team_id', teamId),
      db.from('film_plays').select('*').eq('team_id', teamId),
      db.from('film_sources').select('*').eq('team_id', teamId),
      db.from('film_catalog').select('*').eq('team_id', teamId),
      db.from('chief_king_plans').select('*').eq('team_id', teamId),
      db.from('awareness_results').select('*').eq('team_id', teamId),
      db.from('game_results').select('*').eq('team_id', teamId),
      db.from('player_stats').select('*').eq('team_id', teamId),
    ])

  throwIfError(athleteResult.error, 'Could not load athletes')
  throwIfError(eventResult.error, 'Could not load testing events')
  throwIfError(sessionResult.error, 'Could not load testing entries')
  // play_events and film_plays are newer; if a migration has not run yet, treat
  // that table as empty rather than failing the whole load.

  const athletes: Athlete[] = (athleteResult.data ?? []).map((row) => {
    const packed = decodeCloudPosition(String(row.position))
    return {
      id: String(row.id),
      name: String(row.name),
      grade: requiredNumber(row.grade),
      position: packed.position,
      positionGroup: String(row.position_group) as PositionGroup,
      usage: packed.usage,
      secondaryPosition: packed.secondaryPosition,
      secondaryPositionGroup: packed.secondaryPositionGroup,
      heightIn: requiredNumber(row.height_in),
      weightLbs: requiredNumber(row.weight_lbs),
      photoUrl: optionalText(row.photo_url),
      hudlUrl: optionalText(row.hudl_url),
      deploymentAssessment: packed.deploymentAssessment,
      ironManPackage: packed.ironManPackage,
    }
  })

  const events: TestingEvent[] = (eventResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    phase: String(row.phase) as TestingPhase,
    startDate: String(row.start_date),
    endDate: optionalText(row.end_date),
    status: String(row.status ?? 'open') as 'open' | 'closed',
    createdAt: optionalText(row.created_at),
  }))

  const sessions: TestSession[] = (sessionResult.data ?? []).map((row) => ({
    id: String(row.id),
    athleteId: String(row.athlete_id),
    eventId: String(row.event_id),
    date: String(row.test_date),
    phase: String(row.phase) as TestingPhase,
    createdAt: optionalText(row.created_at),
    gradeSnapshot: optionalNumber(row.grade_snapshot),
    positionSnapshot: optionalText(row.position_snapshot),
    positionGroupSnapshot: optionalText(row.position_group_snapshot) as
      | PositionGroup
      | undefined,
    weightLbsSnapshot: optionalNumber(row.weight_lbs_snapshot),
    benchMax: optionalNumber(row.bench_max),
    dash40_1: optionalNumber(row.dash40_1),
    dash40_2: optionalNumber(row.dash40_2),
    dash10_1: optionalNumber(row.dash10_1),
    dash10_2: optionalNumber(row.dash10_2),
    fly10_1: optionalNumber(row.fly10_1),
    fly10_2: optionalNumber(row.fly10_2),
    powerCleanMax: optionalNumber(row.power_clean_max),
    hangCleanReps: optionalNumber(row.hang_clean_reps),
    shuttle20_1: optionalNumber(row.shuttle20_1),
    shuttle20_2: optionalNumber(row.shuttle20_2),
    latShuttle_1: optionalNumber(row.lat_shuttle_1),
    latShuttle_2: optionalNumber(row.lat_shuttle_2),
    illinois: optionalNumber(row.illinois),
    squatMax: optionalNumber(row.squat_max),
    broadJump: optionalNumber(row.broad_jump),
    verticalJump: optionalNumber(row.vertical_jump),
    cond51015: optionalNumber(row.cond51015),
  }))

  const plays: PlayEvent[] = playResult.error
    ? []
    : (playResult.data ?? []).map((row) => ({
        id: String(row.id),
        athleteId: String(row.athlete_id),
        type: String(row.type),
        date: String(row.play_date),
        opponent: optionalText(row.opponent),
        note: optionalText(row.note),
        createdAt: optionalText(row.created_at),
      }))

  const filmPlays: FilmPlay[] = filmResult.error
    ? []
    : (filmResult.data ?? []).map((row) => ({
        id: String(row.id),
        filmLabel: optionalText(row.film_label),
        filmSourceId: optionalText(row.film_source_id),
        videoTimeSec: optionalNumber(row.video_time_sec),
        startTimeSec: optionalNumber(row.start_time_sec),
        endTimeSec: optionalNumber(row.end_time_sec),
        opponent: optionalText(row.opponent),
        date: optionalText(row.play_date),
        side: optionalText(row.side) as PlaySide | undefined,
        quarter: optionalNumber(row.quarter),
        down: optionalNumber(row.down),
        distance: optionalNumber(row.distance),
        yardLine: optionalNumber(row.yard_line),
        hash: optionalText(row.hash) as FieldHash | undefined,
        formation: optionalText(row.formation),
        personnel: optionalText(row.personnel),
        call: optionalText(row.call) as PlayCall | undefined,
        concept: optionalText(row.concept),
        ballCarrierId: optionalText(row.ball_carrier_id),
        targetId: optionalText(row.target_id),
        boxCount: optionalNumber(row.box_count),
        hiddenYards: optionalNumber(row.hidden_yards),
        gain: optionalNumber(row.gain),
        result: optionalText(row.result),
        annotations: Array.isArray(row.annotations)
          ? (row.annotations as FilmAnnotation[])
          : undefined,
        note: optionalText(row.note),
        createdAt: optionalText(row.created_at),
      }))

  const filmSources: FilmSource[] = sourceResult.error
    ? []
    : (sourceResult.data ?? []).map((row) => ({
        id: String(row.id),
        label: String(row.label),
        kind: String(row.kind) as FilmSource['kind'],
        date: optionalText(row.source_date),
        opponent: optionalText(row.opponent),
        createdAt: optionalText(row.created_at),
      }))

  const filmCatalog: FilmCatalogEntry[] = catalogResult.error
    ? []
    : (catalogResult.data ?? []).map((row) => ({
        id: String(row.id),
        kind: String(row.kind) as FilmCatalogEntry['kind'],
        key: String(row.entry_key),
        label: String(row.label),
        note: optionalText(row.note),
        createdAt: optionalText(row.created_at),
      }))

  const chiefKingPlans: ChiefKingPlan[] = planResult.error
    ? []
    : (planResult.data ?? []).map((row) => ({
        id: String(row.id),
        opponent: String(row.opponent),
        kingLabel: String(row.king_label),
        kingPosition: String(row.king_position) as KingPosition,
        chiefs: Array.isArray(row.chiefs) ? (row.chiefs as ChiefEntry[]) : [],
        weakestChiefId: optionalText(row.weakest_chief_id),
        note: optionalText(row.note),
        createdAt: optionalText(row.created_at),
      }))

  const awarenessResults: AwarenessResult[] = awarenessResult.error
    ? []
    : (awarenessResult.data ?? []).map((row) => ({
        id: String(row.id),
        athleteId: String(row.athlete_id),
        quizId: String(row.quiz_id),
        score: requiredNumber(row.score),
        correct: requiredNumber(row.correct),
        total: requiredNumber(row.total),
        takenAt: String(row.taken_at),
        createdAt: optionalText(row.created_at),
      }))

  const gameResults: GameResult[] = gameResultResult.error
    ? []
    : (gameResultResult.data ?? []).map((row) => ({
        id: String(row.id),
        date: String(row.date),
        opponent: String(row.opponent),
        teamScore: requiredNumber(row.team_score),
        oppScore: requiredNumber(row.opp_score),
        note: optionalText(row.note),
        createdAt: optionalText(row.created_at),
      }))

  const playerStats: PlayerGameStat[] = playerStatResult.error
    ? []
    : (playerStatResult.data ?? []).map((row) => ({
        id: String(row.id),
        athleteId: String(row.athlete_id),
        date: String(row.date),
        opponent: optionalText(row.opponent),
        stats: (row.stats ?? {}) as PlayerGameStat['stats'],
        createdAt: optionalText(row.created_at),
      }))

  return consolidateAthleteAliases(
    normalizeAppData({ athletes, events, sessions, plays, filmPlays, filmSources, filmCatalog, chiefKingPlans, awarenessResults, gameResults, playerStats }),
  )
}

function nullable(value: unknown): unknown {
  return value === undefined ? null : value
}

/**
 * The cloud enforces `grade_snapshot is null or between 1 and 12`. An athlete
 * with no grade recorded yields a 0 snapshot, which would reject the whole
 * batch save — so anything outside 1-12 is written as null instead.
 */
function gradeSnapshotValue(value: unknown): number | null {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null
}

async function existingIds(table: string, teamId: string): Promise<string[]> {
  const db = client()
  const { data, error } = await db.from(table).select('id').eq('team_id', teamId)
  throwIfError(error, `Could not inspect ${table}`)
  return (data ?? []).map((row) => String(row.id))
}

async function deleteMissing(
  table: string,
  teamId: string,
  existing: string[],
  current: Set<string>,
) {
  const missing = existing.filter((id) => !current.has(id))
  if (missing.length === 0) return
  const { error } = await client()
    .from(table)
    .delete()
    .eq('team_id', teamId)
    .in('id', missing)
  throwIfError(error, `Could not remove old ${table} rows`)
}

export async function saveCloudData(teamId: string, input: AppData): Promise<void> {
  const db = client()
  const data = consolidateAthleteAliases(normalizeAppData(input))
  const now = new Date().toISOString()

  const athleteRows = data.athletes.map((athlete) => ({
    team_id: teamId,
    id: athlete.id,
    name: athlete.name,
    grade: athlete.grade,
    // Two-way metadata is packed into the existing text field so the feature
    // works on current Supabase schemas without a destructive migration.
    position: encodeCloudPosition(athlete),
    position_group: athlete.positionGroup,
    height_in: athlete.heightIn,
    weight_lbs: athlete.weightLbs,
    photo_url: nullable(athlete.photoUrl),
    hudl_url: nullable(athlete.hudlUrl),
  }))

  const eventRows = data.events.map((event) => ({
    team_id: teamId,
    id: event.id,
    name: event.name,
    phase: event.phase,
    start_date: event.startDate,
    end_date: nullable(event.endDate),
    status: event.status ?? 'open',
    created_at: event.createdAt ?? now,
  }))

  const sessionRows = data.sessions.map((session) => {
    if (!session.eventId) {
      throw new Error(`Testing entry ${session.id} is missing its testing event.`)
    }
    return {
      team_id: teamId,
      id: session.id,
      athlete_id: session.athleteId,
      event_id: session.eventId,
      test_date: session.date,
      phase: session.phase,
      grade_snapshot: gradeSnapshotValue(session.gradeSnapshot),
      position_snapshot: nullable(session.positionSnapshot),
      position_group_snapshot: nullable(session.positionGroupSnapshot),
      weight_lbs_snapshot: nullable(session.weightLbsSnapshot),
      bench_max: nullable(session.benchMax),
      dash40_1: nullable(session.dash40_1),
      dash40_2: nullable(session.dash40_2),
      dash10_1: nullable(session.dash10_1),
      dash10_2: nullable(session.dash10_2),
      fly10_1: nullable(session.fly10_1),
      fly10_2: nullable(session.fly10_2),
      power_clean_max: nullable(session.powerCleanMax),
      hang_clean_reps: nullable(session.hangCleanReps),
      shuttle20_1: nullable(session.shuttle20_1),
      shuttle20_2: nullable(session.shuttle20_2),
      lat_shuttle_1: nullable(session.latShuttle_1),
      lat_shuttle_2: nullable(session.latShuttle_2),
      illinois: nullable(session.illinois),
      squat_max: nullable(session.squatMax),
      broad_jump: nullable(session.broadJump),
      vertical_jump: nullable(session.verticalJump),
      cond51015: nullable(session.cond51015),
      created_at: session.createdAt ?? now,
    }
  })

  const [oldAthletes, oldEvents, oldSessions] = await Promise.all([
    existingIds('athletes', teamId),
    existingIds('testing_events', teamId),
    existingIds('test_sessions', teamId),
  ])

  if (athleteRows.length > 0) {
    const { error } = await db
      .from('athletes')
      .upsert(athleteRows, { onConflict: 'team_id,id' })
    throwIfError(error, 'Could not save athletes')
  }

  if (eventRows.length > 0) {
    const { error } = await db
      .from('testing_events')
      .upsert(eventRows, { onConflict: 'team_id,id' })
    throwIfError(error, 'Could not save testing events')
  }

  if (sessionRows.length > 0) {
    const { error } = await db
      .from('test_sessions')
      .upsert(sessionRows, { onConflict: 'team_id,id' })
    throwIfError(error, 'Could not save testing entries')
  }

  await deleteMissing(
    'test_sessions',
    teamId,
    oldSessions,
    new Set(data.sessions.map((session) => session.id)),
  )
  await deleteMissing(
    'athletes',
    teamId,
    oldAthletes,
    new Set(data.athletes.map((athlete) => athlete.id)),
  )
  await deleteMissing(
    'testing_events',
    teamId,
    oldEvents,
    new Set(data.events.map((event) => event.id)),
  )

  // Playmaker/Havoc entries affect athlete ratings, badges, and leaderboards,
  // so a failed write must fail the snapshot save. Silently treating a 403 or
  // schema error as success makes the play appear briefly and disappear after
  // the next cloud reload.
  const playRows = (data.plays ?? []).map((play) => ({
    team_id: teamId,
    id: play.id,
    athlete_id: play.athleteId,
    type: play.type,
    play_date: play.date,
    opponent: nullable(play.opponent),
    note: nullable(play.note),
    created_at: play.createdAt ?? now,
  }))
  const oldPlays = await existingIds('play_events', teamId)
  if (playRows.length > 0) {
    const { error } = await db
      .from('play_events')
      .upsert(playRows, { onConflict: 'team_id,id' })
    throwIfError(error, 'Could not save plays')
  }
  await deleteMissing('play_events', teamId, oldPlays, new Set((data.plays ?? []).map((play) => play.id)))

  // Film breakdowns sync separately and non-fatally, same as plays: a team that
  // has not run the film_plays migration keeps saving everything else.
  try {
    const filmRows = (data.filmPlays ?? []).map((film) => ({
      team_id: teamId,
      id: film.id,
      film_label: nullable(film.filmLabel),
      film_source_id: nullable(film.filmSourceId),
      video_time_sec: nullable(film.videoTimeSec),
      start_time_sec: nullable(film.startTimeSec),
      end_time_sec: nullable(film.endTimeSec),
      opponent: nullable(film.opponent),
      play_date: nullable(film.date),
      side: nullable(film.side),
      quarter: nullable(film.quarter),
      down: nullable(film.down),
      distance: nullable(film.distance),
      yard_line: nullable(film.yardLine),
      hash: nullable(film.hash),
      formation: nullable(film.formation),
      personnel: nullable(film.personnel),
      call: nullable(film.call),
      concept: nullable(film.concept),
      ball_carrier_id: nullable(film.ballCarrierId),
      target_id: nullable(film.targetId),
      box_count: nullable(film.boxCount),
      hidden_yards: nullable(film.hiddenYards),
      gain: nullable(film.gain),
      result: nullable(film.result),
      annotations: film.annotations ?? [],
      note: nullable(film.note),
      created_at: film.createdAt ?? now,
    }))
    const oldFilm = await existingIds('film_plays', teamId)
    if (filmRows.length > 0) {
      const { error } = await db
        .from('film_plays')
        .upsert(filmRows, { onConflict: 'team_id,id' })
      throwIfError(error, 'Could not save film')
    }
    await deleteMissing('film_plays', teamId, oldFilm, new Set((data.filmPlays ?? []).map((film) => film.id)))
  } catch {
    // film_plays table not provisioned yet — skip film sync this save.
  }

  // Master source films sync separately and non-fatally, same as film plays.
  try {
    const sourceRows = (data.filmSources ?? []).map((source) => ({
      team_id: teamId,
      id: source.id,
      label: source.label,
      kind: source.kind,
      source_date: nullable(source.date),
      opponent: nullable(source.opponent),
      created_at: source.createdAt ?? now,
    }))
    const oldSources = await existingIds('film_sources', teamId)
    if (sourceRows.length > 0) {
      const { error } = await db
        .from('film_sources')
        .upsert(sourceRows, { onConflict: 'team_id,id' })
      throwIfError(error, 'Could not save film sources')
    }
    await deleteMissing('film_sources', teamId, oldSources, new Set((data.filmSources ?? []).map((source) => source.id)))
  } catch {
    // film_sources table not provisioned yet — skip source sync this save.
  }

  // Coach-defined tagging catalog syncs separately and non-fatally.
  try {
    const catalogRows = (data.filmCatalog ?? []).map((entry) => ({
      team_id: teamId,
      id: entry.id,
      kind: entry.kind,
      entry_key: entry.key,
      label: entry.label,
      note: nullable(entry.note),
      created_at: entry.createdAt ?? now,
    }))
    const oldCatalog = await existingIds('film_catalog', teamId)
    if (catalogRows.length > 0) {
      const { error } = await db
        .from('film_catalog')
        .upsert(catalogRows, { onConflict: 'team_id,id' })
      throwIfError(error, 'Could not save film catalog')
    }
    await deleteMissing('film_catalog', teamId, oldCatalog, new Set((data.filmCatalog ?? []).map((entry) => entry.id)))
  } catch {
    // film_catalog table not provisioned yet — skip catalog sync this save.
  }

  // Chief-to-King plans sync separately and non-fatally.
  try {
    const planRows = (data.chiefKingPlans ?? []).map((plan) => ({
      team_id: teamId,
      id: plan.id,
      opponent: plan.opponent,
      king_label: plan.kingLabel,
      king_position: plan.kingPosition,
      chiefs: plan.chiefs ?? [],
      weakest_chief_id: nullable(plan.weakestChiefId),
      note: nullable(plan.note),
      created_at: plan.createdAt ?? now,
    }))
    const oldPlans = await existingIds('chief_king_plans', teamId)
    if (planRows.length > 0) {
      const { error } = await db
        .from('chief_king_plans')
        .upsert(planRows, { onConflict: 'team_id,id' })
      throwIfError(error, 'Could not save Chief-to-King plans')
    }
    await deleteMissing('chief_king_plans', teamId, oldPlans, new Set((data.chiefKingPlans ?? []).map((plan) => plan.id)))
  } catch {
    // chief_king_plans table not provisioned yet — skip plan sync this save.
  }

  // Game scores / team record sync separately and non-fatally.
  try {
    const gameRows = (data.gameResults ?? []).map((game) => ({
      team_id: teamId,
      id: game.id,
      date: game.date,
      opponent: game.opponent,
      team_score: game.teamScore,
      opp_score: game.oppScore,
      note: nullable(game.note),
      created_at: game.createdAt ?? now,
    }))
    const oldGames = await existingIds('game_results', teamId)
    if (gameRows.length > 0) {
      const { error } = await db
        .from('game_results')
        .upsert(gameRows, { onConflict: 'team_id,id' })
      throwIfError(error, 'Could not save game results')
    }
    await deleteMissing('game_results', teamId, oldGames, new Set((data.gameResults ?? []).map((game) => game.id)))
  } catch {
    // game_results table not provisioned yet — skip score sync this save.
  }

  // Player box-score stats sync separately and non-fatally.
  try {
    const statRows = (data.playerStats ?? []).map((stat) => ({
      team_id: teamId,
      id: stat.id,
      athlete_id: stat.athleteId,
      date: stat.date,
      opponent: nullable(stat.opponent),
      stats: stat.stats ?? {},
      created_at: stat.createdAt ?? now,
    }))
    const oldStats = await existingIds('player_stats', teamId)
    if (statRows.length > 0) {
      const { error } = await db
        .from('player_stats')
        .upsert(statRows, { onConflict: 'team_id,id' })
      throwIfError(error, 'Could not save player stats')
    }
    await deleteMissing('player_stats', teamId, oldStats, new Set((data.playerStats ?? []).map((stat) => stat.id)))
  } catch {
    // player_stats table not provisioned yet — skip stat sync this save.
  }

  // Awareness quiz results sync separately and non-fatally. A coach save upserts
  // the whole set; athletes write their own single row via saveAwarenessResult.
  try {
    const awarenessRows = (data.awarenessResults ?? []).map((result) => ({
      team_id: teamId,
      id: result.id,
      athlete_id: result.athleteId,
      quiz_id: result.quizId,
      score: result.score,
      correct: result.correct,
      total: result.total,
      taken_at: result.takenAt,
      created_at: result.createdAt ?? now,
    }))
    const oldAwareness = await existingIds('awareness_results', teamId)
    if (awarenessRows.length > 0) {
      const { error } = await db
        .from('awareness_results')
        .upsert(awarenessRows, { onConflict: 'team_id,id' })
      throwIfError(error, 'Could not save awareness results')
    }
    await deleteMissing(
      'awareness_results',
      teamId,
      oldAwareness,
      new Set((data.awarenessResults ?? []).map((result) => result.id)),
    )
  } catch {
    // awareness_results table not provisioned yet — skip this save.
  }
}

/**
 * Insert a single awareness result. Used by an athlete account, which may write
 * only its own quiz row (RLS) — never the whole dataset like saveCloudData.
 */
export async function saveAwarenessResult(
  teamId: string,
  result: AwarenessResult,
): Promise<void> {
  const db = client()
  const { error } = await db.from('awareness_results').upsert(
    {
      team_id: teamId,
      id: result.id,
      athlete_id: result.athleteId,
      quiz_id: result.quizId,
      score: result.score,
      correct: result.correct,
      total: result.total,
      taken_at: result.takenAt,
      created_at: result.createdAt ?? new Date().toISOString(),
    },
    { onConflict: 'team_id,id' },
  )
  throwIfError(error, 'Could not save your quiz result')
}

export interface PublicTeamData {
  teamId: string
  teamName: string
  data: Required<AppData>
}

/**
 * Anonymous read-only load of the team's data for signed-out visitors.
 * Requires the public-read RLS policies; returns null when they are absent
 * or no team exists, so callers can fall back to on-device data.
 */
export async function loadPublicTeamData(): Promise<PublicTeamData | null> {
  const db = client()
  const { data: teams, error } = await db.from('teams').select('id, name').limit(1)
  if (error || !teams || teams.length === 0) return null

  const team = teams[0]
  const data = await loadCloudData(String(team.id))
  return { teamId: String(team.id), teamName: String(team.name), data }
}

export function cloudDataIsEmpty(data: Required<AppData>): boolean {
  return (
    data.athletes.length === 0 &&
    data.events.length === 0 &&
    data.sessions.length === 0
  )
}
