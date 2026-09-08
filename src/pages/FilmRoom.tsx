import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, Pill, SectionTitle, StatTile } from '../components/ui'
import HudlImportWizard from '../components/HudlImportWizard'
import FootballCvImportPanel from '../components/FootballCvImportPanel'
import QbMechanicsPanel from '../components/QbMechanicsPanel'
import { FilmCatalogManager } from '../components/FilmCatalogManager'
import type {
  FilmAnnotation,
  FilmAnnotationKind,
  FilmAnnotationPoint,
  FilmPlay,
  FilmSourceKind,
  PlayCall,
  PlaySide,
  TrackingTeam,
  ThrowAnalysis,
  ThrowArmSlot,
  ThrowFamily,
  ThrowHandedness,
  ThrowLandmark,
  ThrowPlatform,
  ThrowTrajectory,
} from '../types'
import {
  PLAY_CALLS,
  buildTendencyReport,
  catalogLabelResolver,
  conceptOptionsForCall,
  formationOptions,
  opponentsFromFilm,
  personnelOptions,
  type TendencyGroup,
} from '../lib/filmAnalysis'
import { scoutingReportCsv, scoutingReportHtml } from '../lib/scoutingExport'
import { isEditableTarget, resolveFilmShortcut, shortcutSeconds } from '../lib/filmShortcuts'
import {
  IDENTITY_VIEW,
  MAX_FILM_ZOOM,
  MIN_FILM_ZOOM,
  panBy,
  viewTransform,
  zoomAt,
  type FilmView,
} from '../lib/filmZoom'
import {
  TRACK_COLORS,
  TRACK_FRAME_SECONDS,
  createPlayerTrack,
  formatTrackTime,
  isPlayerTrack,
  removeTrackKeyframe,
  trackBoxAt,
  trackKeyframes,
  trackPositionAt,
  trackTrailAt,
  upsertTrackKeyframe,
  summarizePlayerTrack,
} from '../lib/filmTracking'
import { LockedBrowserPlayerAutoTracker } from '../lib/filmLockedAutoTracking'
import { mergeFootballCvPlayerTracks } from '../lib/footballCvImport'
import { summarizeTrackSpeed } from '../lib/playerSpeed'
import { buildFieldHeatmap } from '../lib/playerHeatmap'
import FieldMap from '../components/FieldMap'
import FieldHeatmap from '../components/FieldHeatmap'
import { followViewForAthlete } from '../lib/filmAutoFollowViewport'
import { shouldShowTrackLabel, tracksForFilmStage } from '../lib/filmTrackDisplay'
import {
  THROW_FAMILIES,
  THROW_LANDMARKS,
  computeThrowMetrics,
  isThrowAnalysisAnnotation,
  removeThrowAnalysis,
  suggestThrowFamily,
  throwAnalysisAnnotation,
  upsertThrowAnalysis,
} from '../lib/throwAnalysis'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const KIND_COLOR: Record<FilmAnnotationKind, string> = {
  route: '#22d3ee',
  trail: '#fbbf24',
  zone: '#a855f7',
  arrow: '#f8fafc',
}

const KIND_LABEL: Record<FilmAnnotationKind, string> = {
  route: 'Route',
  trail: 'Player trail',
  zone: 'Coverage zone',
  arrow: 'Pointer',
}

const THROW_TRAJECTORY_OPTIONS: Array<{ key: ThrowTrajectory; label: string }> = [
  { key: 'bullet', label: 'Bullet' },
  { key: 'touch', label: 'Touch' },
  { key: 'lob', label: 'Lob' },
  { key: 'layered', label: 'Layered' },
  { key: 'checkdown', label: 'Checkdown' },
  { key: 'throwaway', label: 'Throwaway' },
]
const THROW_PLATFORM_OPTIONS: Array<{ key: ThrowPlatform; label: string }> = [
  { key: 'on-platform', label: 'On platform' },
  { key: 'off-platform', label: 'Off platform' },
  { key: 'moving-left', label: 'Moving left' },
  { key: 'moving-right', label: 'Moving right' },
  { key: 'back-foot', label: 'Back foot' },
  { key: 'jump-pass', label: 'Jump pass' },
]
const THROW_ARM_SLOT_OPTIONS: Array<{ key: ThrowArmSlot; label: string }> = [
  { key: 'overhand', label: 'Overhand' },
  { key: 'three-quarter', label: 'Three-quarter' },
  { key: 'sidearm', label: 'Sidearm' },
  { key: 'underhand', label: 'Underhand / shovel' },
]
const THROW_HANDEDNESS_OPTIONS: Array<{ key: ThrowHandedness; label: string }> = [
  { key: 'right', label: 'Right-handed' },
  { key: 'left', label: 'Left-handed' },
]
const THROW_TIME_LABEL: Record<ThrowTimeKey, string> = {
  snapTimeSec: 'snap',
  plantTimeSec: 'plant',
  releaseTimeSec: 'release',
  arrivalTimeSec: 'arrival',
}

type FormState = Partial<FilmPlay>
type FilmToolMode = 'draw' | 'track' | 'throw'
type ThrowTimeKey = 'snapTimeSec' | 'plantTimeSec' | 'releaseTimeSec' | 'arrivalTimeSec'
type AutoTrackingStatus = 'idle' | 'armed' | 'ready' | 'running' | 'lost' | 'complete' | 'error'
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

const EMPTY_FORM: FormState = {
  side: 'offense',
  date: todayIso(),
}

// ---------------------------------------------------------------------------
// Film stage: video (uploaded file or live screen capture) + a drawing overlay
// for routes / player trails. Points are stored normalized 0-1 to the frame.
// ---------------------------------------------------------------------------

function FilmStage({
  videoRef,
  annotations,
  drawKind,
  drawColor,
  toolMode,
  activeTrackId,
  focusActiveTrack,
  followPoint,
  throwAnalysis,
  activeThrowLandmark,
  currentTime,
  onTimeChange,
  onDurationChange,
  onPlayingChange,
  onCommitPath,
  onCommitTrackPoint,
  onCommitThrowPoint,
  canDraw,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  annotations: FilmAnnotation[]
  drawKind: FilmAnnotationKind
  drawColor: string
  toolMode: FilmToolMode
  activeTrackId?: string
  focusActiveTrack?: boolean
  followPoint?: Pick<FilmAnnotationPoint, 'x' | 'y'>
  throwAnalysis?: ThrowAnalysis
  activeThrowLandmark?: ThrowLandmark
  currentTime: number
  onTimeChange: (time: number) => void
  onDurationChange: (duration: number) => void
  onPlayingChange: (playing: boolean) => void
  onCommitPath: (points: FilmAnnotationPoint[]) => void
  onCommitTrackPoint: (point: FilmAnnotationPoint, time: number) => void
  onCommitThrowPoint: (point: FilmAnnotationPoint, time: number) => void
  canDraw: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef<FilmAnnotationPoint[] | null>(null)
  const [, forceTick] = useState(0)

  // Independent Film Room zoom/pan. The transform is applied to the box holding
  // both the video and the overlay canvas, so every overlay stays aligned.
  const outerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<FilmView>(IDENTITY_VIEW)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<{ mode: 'none' | 'pan'; dist: number; mid: { x: number; y: number } }>({
    mode: 'none',
    dist: 0,
    mid: { x: 0, y: 0 },
  })

  function stageSize() {
    const el = outerRef.current
    return { w: el?.clientWidth ?? 1, h: el?.clientHeight ?? 1 }
  }

  /** Cursor position in untransformed container pixels. */
  function containerPoint(event: { clientX: number; clientY: number }) {
    const rect = outerRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  function handleWheel(event: React.WheelEvent) {
    if (event.ctrlKey) event.preventDefault() // trackpad pinch
    const { w, h } = stageSize()
    const focal = containerPoint(event)
    const factor = Math.exp(-event.deltaY * 0.0015)
    setView((current) => zoomAt(current, current.zoom * factor, focal.x, focal.y, w, h))
  }

  function pointFrom(event: React.PointerEvent): FilmAnnotationPoint {
    const rect = (event.target as HTMLElement).getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  function onStagePointerDown(event: React.PointerEvent) {
    const cp = containerPoint(event)
    const startingSecond = pointersRef.current.size === 1
    pointersRef.current.set(event.pointerId, cp)

    // Two fingers → pinch-zoom / pan; abandon any in-progress stroke.
    if (startingSecond) {
      drawingRef.current = null
      const pts = [...pointersRef.current.values()]
      gestureRef.current = {
        mode: 'pan',
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      }
      ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
      return
    }

    // Mouse pan: middle button or Alt+drag.
    if (event.pointerType === 'mouse' && (event.button === 1 || event.altKey)) {
      gestureRef.current = { mode: 'pan', dist: 0, mid: cp }
      ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
      return
    }

    // Otherwise the existing drawing / tracking behavior, unchanged.
    if (!canDraw) return
    const point = pointFrom(event)
    if (toolMode === 'track') {
      videoRef.current?.pause()
      onCommitTrackPoint(point, videoRef.current?.currentTime ?? currentTime)
      return
    }
    if (toolMode === 'throw') {
      videoRef.current?.pause()
      onCommitThrowPoint(point, videoRef.current?.currentTime ?? currentTime)
      return
    }
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    drawingRef.current = [point]
    forceTick((n) => n + 1)
  }

  function onStagePointerMove(event: React.PointerEvent) {
    const cp = containerPoint(event)
    const { w, h } = stageSize()
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, cp)

    // Two-finger pinch-zoom + pan.
    if (pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const prev = gestureRef.current
      setView((current) => {
        let next = prev.dist > 0 ? zoomAt(current, current.zoom * (dist / prev.dist), mid.x, mid.y, w, h) : current
        next = panBy(next, mid.x - prev.mid.x, mid.y - prev.mid.y, w, h)
        return next
      })
      gestureRef.current = { mode: 'pan', dist, mid }
      return
    }

    // Mouse / single-finger pan.
    if (gestureRef.current.mode === 'pan') {
      const prev = gestureRef.current.mid
      setView((current) => panBy(current, cp.x - prev.x, cp.y - prev.y, w, h))
      gestureRef.current = { mode: 'pan', dist: 0, mid: cp }
      return
    }

    // Freehand drawing.
    if (!canDraw || toolMode !== 'draw' || !drawingRef.current) return
    drawingRef.current.push(pointFrom(event))
    redraw()
  }

  function onStagePointerUp(event: React.PointerEvent) {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size === 1) {
      // One finger left after a pinch — keep panning from it.
      const [remaining] = [...pointersRef.current.values()]
      gestureRef.current = { mode: 'pan', dist: 0, mid: remaining }
      return
    }
    const wasGesture = gestureRef.current.mode === 'pan'
    gestureRef.current = { mode: 'none', dist: 0, mid: { x: 0, y: 0 } }
    if (!wasGesture && canDraw && toolMode === 'draw' && drawingRef.current) {
      const points = drawingRef.current
      drawingRef.current = null
      if (points.length >= 2) onCommitPath(points)
      forceTick((n) => n + 1)
    }
  }

  function zoomByStep(nextZoom: number) {
    const { w, h } = stageSize()
    setView((current) => zoomAt(current, nextZoom, w / 2, h / 2, w, h))
  }

  function redraw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const paths: { points: FilmAnnotationPoint[]; color: string; kind: FilmAnnotationKind }[] = [
      ...annotations.filter((annotation) => !isPlayerTrack(annotation) && !isThrowAnalysisAnnotation(annotation)).map((a) => ({
        points: a.points,
        color: a.color ?? KIND_COLOR[a.kind],
        kind: a.kind,
      })),
    ]
    if (drawingRef.current && drawingRef.current.length > 0) {
      paths.push({ points: drawingRef.current, color: drawColor, kind: drawKind })
    }

    for (const path of paths) {
      if (path.points.length === 0) continue
      ctx.lineWidth = 3
      ctx.strokeStyle = path.color
      ctx.fillStyle = path.color
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowColor = path.color
      ctx.shadowBlur = 8
      ctx.beginPath()
      path.points.forEach((point, index) => {
        const px = point.x * width
        const py = point.y * height
        if (index === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
      // Start dot + end marker so a route reads directionally.
      const first = path.points[0]
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.arc(first.x * width, first.y * height, 5, 0, Math.PI * 2)
      ctx.fill()
      const last = path.points[path.points.length - 1]
      if (path.points.length > 1) {
        ctx.beginPath()
        ctx.arc(last.x * width, last.y * height, 3.5, 0, Math.PI * 2)
        ctx.strokeStyle = '#0b0f14'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    const visiblePlayerTracks = tracksForFilmStage(annotations, { activeTrackId, focusActiveTrack })
    for (const track of visiblePlayerTracks) {
      const color = track.color ?? TRACK_COLORS[track.trackingSide ?? 'offense']
      const trail = trackTrailAt(track.points, currentTime)
      const position = trackPositionAt(track.points, currentTime)
      if (trail.length > 1) {
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = track.id === activeTrackId ? 4 : 2.5
        ctx.globalAlpha = track.id === activeTrackId ? 0.95 : 0.7
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.beginPath()
        trail.forEach((point, index) => {
          const px = point.x * width
          const py = point.y * height
          if (index === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.stroke()
        ctx.restore()
      }
      const box = trackBoxAt(track.points, currentTime)
      if (!position && !box) continue
      const isActive = track.id === activeTrackId

      // Anchor for the label: box top-left when we have a box, else the foot dot.
      let anchorX = position ? position.x * width : 0
      let anchorY = position ? position.y * height : 0
      let labelGap = (isActive ? 11 : 8) + 5

      ctx.save()
      if (box) {
        // Player highlight: a team-colored box + soft glow that tracks the whole body,
        // instead of a single dot at the feet.
        const bx = box[0] * width
        const by = box[1] * height
        const bw = Math.max(2, (box[2] - box[0]) * width)
        const bh = Math.max(2, (box[3] - box[1]) * height)
        const corner = Math.min(10, bw / 3, bh / 3)
        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, bw, bh, corner)
        else ctx.rect(bx, by, bw, bh)
        ctx.fillStyle = color
        ctx.globalAlpha = isActive ? 0.18 : 0.1
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.shadowColor = color
        ctx.shadowBlur = isActive ? 16 : 9
        ctx.strokeStyle = color
        ctx.lineWidth = isActive ? 3 : 2
        ctx.stroke()
        ctx.shadowBlur = 0
        anchorX = bx
        anchorY = by
        labelGap = 4
      } else if (position) {
        const px = position.x * width
        const py = position.y * height
        const radius = isActive ? 11 : 8
        ctx.shadowColor = color
        ctx.shadowBlur = isActive ? 18 : 10
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = isActive ? '#ffffff' : '#0b0f14'
        ctx.lineWidth = isActive ? 3 : 2
        ctx.stroke()
      }

      const label = track.label?.trim()
      if (label && shouldShowTrackLabel(track, { activeTrackId, focusActiveTrack })) {
        ctx.font = '700 12px system-ui, sans-serif'
        const labelWidth = ctx.measureText(label).width + 12
        const labelX = Math.min(width - labelWidth - 4, Math.max(4, box ? anchorX : anchorX + labelGap))
        const labelY = Math.max(18, anchorY - (box ? labelGap : labelGap - 1))
        ctx.fillStyle = 'rgba(5, 10, 16, 0.82)'
        ctx.fillRect(labelX, labelY - 15, labelWidth, 20)
        ctx.fillStyle = '#f8fafc'
        ctx.fillText(label, labelX + 6, labelY)
      }
      ctx.restore()
    }

    const landmarks = throwAnalysis?.landmarks
    if (landmarks) {
      const segments: Array<[ThrowLandmark, ThrowLandmark]> = [
        ['throwingShoulder', 'throwingElbow'],
        ['throwingElbow', 'throwingWrist'],
        ['throwingShoulder', 'frontShoulder'],
        ['throwingHip', 'frontHip'],
        ['backFoot', 'frontFoot'],
      ]
      ctx.save()
      ctx.strokeStyle = '#fb923c'
      ctx.fillStyle = '#fb923c'
      ctx.lineWidth = 2.5
      ctx.shadowColor = '#fb923c'
      ctx.shadowBlur = 10
      for (const [fromKey, toKey] of segments) {
        const from = landmarks[fromKey]
        const to = landmarks[toKey]
        if (!from || !to) continue
        ctx.beginPath()
        ctx.moveTo(from.x * width, from.y * height)
        ctx.lineTo(to.x * width, to.y * height)
        ctx.stroke()
      }
      for (const landmark of THROW_LANDMARKS) {
        const point = landmarks[landmark.key]
        if (!point) continue
        const px = point.x * width
        const py = point.y * height
        ctx.beginPath()
        ctx.arc(px, py, landmark.key === activeThrowLandmark ? 8 : 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = landmark.key === activeThrowLandmark ? '#ffffff' : '#111827'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.font = '800 10px system-ui, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(landmark.short, px + 9, py - 7)
        ctx.fillStyle = '#fb923c'
        ctx.shadowBlur = 10
      }
      ctx.restore()
    }
  }

  // Keep the canvas backing store matched to its displayed size, then redraw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      // clientWidth/Height is the layout size, unaffected by the zoom transform,
      // so the overlay backing store never balloons when the film is zoomed.
      canvas.width = Math.max(1, canvas.clientWidth)
      canvas.height = Math.max(1, canvas.clientHeight)
      redraw()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(redraw, [annotations, drawColor, drawKind, currentTime, activeTrackId, focusActiveTrack, throwAnalysis, activeThrowLandmark])

  const followStageWidth = typeof window === 'undefined'
    ? 1
    : window.innerWidth >= 1024
      ? Math.max(1, Math.min(window.innerWidth - 32, 1280) * 0.6)
      : Math.max(1, window.innerWidth - 24)
  const displayView = followPoint
    ? followViewForAthlete(view, followPoint, { smoothing: 1, minimumZoom: 2.2, deadZone: 0.035, width: followStageWidth, height: followStageWidth * 9 / 16 })
    : view
  const zoomed = displayView.zoom > 1.001
  return (
    <div ref={outerRef} className="relative overflow-hidden rounded-xl border border-line bg-black" onWheel={handleWheel}>
      <div
        className="relative w-full"
        style={{ aspectRatio: '16 / 9', transform: viewTransform(displayView), transformOrigin: '0 0', willChange: 'transform' }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full bg-black"
          controls
          playsInline
          onLoadedMetadata={(event) => {
            const video = event.currentTarget
            onTimeChange(video.currentTime)
            onDurationChange(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0)
          }}
          onDurationChange={(event) => {
            const duration = event.currentTarget.duration
            onDurationChange(Number.isFinite(duration) && duration > 0 ? duration : 0)
          }}
          onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
          onSeeked={(event) => onTimeChange(event.currentTarget.currentTime)}
          onPlay={() => onPlayingChange(true)}
          onPause={() => onPlayingChange(false)}
          onEnded={() => onPlayingChange(false)}
        />
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full ${canDraw ? (toolMode === 'track' ? 'cursor-cell' : toolMode === 'throw' ? 'cursor-copy' : zoomed ? 'cursor-grab' : 'cursor-crosshair') : zoomed ? 'cursor-grab' : 'pointer-events-none'}`}
          style={{ touchAction: 'none' }}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerCancel={onStagePointerUp}
        />
      </div>

      {/* Floating zoom control — lives outside the transformed box so it never scales. */}
      <div className="absolute bottom-2 right-2 flex items-center gap-2 rounded-lg border border-white/15 bg-black/70 px-2.5 py-1.5 backdrop-blur-sm">
        <span className="text-[10px] font-black uppercase tracking-wider text-white/60">Zoom</span>
        <input
          type="range"
          min={MIN_FILM_ZOOM}
          max={MAX_FILM_ZOOM}
          step={0.1}
          value={displayView.zoom}
          onChange={(event) => zoomByStep(Number(event.target.value))}
          aria-label="Film zoom"
          className="h-5 w-24 cursor-pointer accent-fai"
        />
        <span className="w-9 text-right text-xs font-black nums text-white">{displayView.zoom.toFixed(1)}×</span>
        <button
          type="button"
          onClick={() => setView(IDENTITY_VIEW)}
          disabled={!zoomed}
          className="rounded border border-white/15 px-2 py-0.5 text-[10px] font-black uppercase text-white/80 disabled:opacity-30"
        >
          Reset
        </button>
      </div>
      {zoomed && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/70">
          Alt-drag or two fingers to pan
        </div>
      )}
    </div>
  )
}

/** Save a generated report string as a downloadable file. */
function triggerDownload(content: string, mime: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function ShareBar({ group }: { group: TendencyGroup }) {
  const runPct = Math.round(group.runShare * 100)
  const passPct = 100 - runPct
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-black/50">
      <div className="h-full bg-flame/80" style={{ width: `${runPct}%` }} title={`Run ${runPct}%`} />
      <div className="h-full bg-fai/80" style={{ width: `${passPct}%` }} title={`Pass ${passPct}%`} />
    </div>
  )
}

function TendencyTable({ title, groups }: { title: string; groups: TendencyGroup[] }) {
  if (groups.length === 0) return null
  return (
    <Card className="p-5">
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-xl border border-line bg-panel-2/30 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-black text-chalk">{group.label}</div>
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className="nums">{group.plays} plays</span>
                <span>·</span>
                <span className="nums">{group.avgGain > 0 ? '+' : ''}{group.avgGain} avg</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="w-16 shrink-0 text-right text-xs font-black text-flame nums">
                {Math.round(group.runShare * 100)}% run
              </span>
              <div className="flex-1"><ShareBar group={group} /></div>
              <span className="w-16 shrink-0 text-xs font-black text-fai nums">
                {Math.round(group.passShare * 100)}% pass
              </span>
            </div>
            {(group.topFormations.length > 0 || group.topConcepts.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.topFormations.slice(0, 2).map((item) => (
                  <Pill key={`f-${item.key}`} tone="gold">
                    {item.label} · {Math.round(item.share * 100)}%
                  </Pill>
                ))}
                {group.topConcepts.slice(0, 2).map((item) => (
                  <Pill key={`c-${item.key}`} tone="fai">
                    {item.label} · {item.count}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}


function FormationBoard({ tracks, atTime }: { tracks: FilmAnnotation[]; atTime?: number }) {
  const located = tracks
    .map((track) => ({
      track,
      start: typeof atTime === 'number'
        ? trackPositionAt(track.points, atTime) ?? trackKeyframes(track.points)[0]
        : trackKeyframes(track.points)[0],
    }))
    .filter((item): item is { track: FilmAnnotation; start: FilmAnnotationPoint } => Boolean(item.start))

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#12331f]" data-testid="formation-board">
      <div className="flex items-center justify-between border-b border-white/15 bg-black/20 px-3 py-2">
        <div className="text-xs font-black uppercase tracking-wider text-white">Formation + route map</div>
        <div className="text-[11px] font-bold text-white/70">{located.length}/11 located</div>
      </div>
      <div className="relative aspect-video overflow-hidden">
        <div className="absolute inset-x-0 top-1/2 border-t-2 border-white/50" />
        {[20, 40, 60, 80].map((position) => (
          <div key={position} className="absolute inset-y-0 border-l border-white/20" style={{ left: `${position}%` }} />
        ))}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 56.25" preserveAspectRatio="none" aria-hidden="true">
          {located.map(({ track }) => {
            const route = trackKeyframes(track.points)
            if (route.length < 2) return null
            return (
              <polyline
                key={`route-${track.id}`}
                points={route.map((point) => `${point.x * 100},${point.y * 56.25}`).join(' ')}
                fill="none"
                stroke={track.color ?? TRACK_COLORS[track.trackingSide ?? 'offense']}
                strokeWidth="0.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />
            )
          })}
        </svg>
        {located.map(({ track, start }) => (
          <div
            key={track.id}
            data-testid="formation-player"
            className="absolute grid h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-black/85 px-1 text-[9px] font-black text-white shadow-lg"
            style={{ left: `${start.x * 100}%`, top: `${start.y * 100}%` }}
            title={track.label ?? track.formationRole ?? 'Tracked player'}
          >
            {(track.formationRole || track.label || '?').slice(0, 5)}
          </div>
        ))}
      </div>
      <div className="border-t border-white/15 bg-black/20 px-3 py-2 text-[10px] leading-relaxed text-white/65">
        Starting dots use the selected formation frame. Lines show each saved route in the camera view.
      </div>
    </div>
  )
}

const selectClass =
  'rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold text-chalk outline-none focus:border-fai'
const inputClass = selectClass + ' placeholder:text-muted'

export default function FilmRoom() {
  const {
    data,
    canEdit,
    addFilmPlay,
    updateFilmPlay,
    deleteFilmPlay,
    addFilmSource,
    addFilmCatalogEntry,
    removeFilmCatalogEntry,
  } = useStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const autoTrackerRef = useRef<LockedBrowserPlayerAutoTracker | null>(null)
  const autoFrameRequestRef = useRef<number | undefined>(undefined)
  const autoTimerRef = useRef<number | undefined>(undefined)
  const autoRunningRef = useRef(false)
  const activeTrackIdRef = useRef<string | undefined>(undefined)
  const autoLastMediaTimeRef = useRef(-1)
  const lowConfidenceFramesRef = useRef(0)
  const nextTrackIdRef = useRef(0)

  const [sourceLabel, setSourceLabel] = useState<string>('')
  const [captureError, setCaptureError] = useState<string>()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, setPending] = useState<FilmAnnotation[]>([])
  // Full-film workflow: one master source, many timestamp-only plays.
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [clip, setClip] = useState<{ start?: number; end?: number }>({})
  const [newSourceLabel, setNewSourceLabel] = useState('')
  const [newSourceKind, setNewSourceKind] = useState<FilmSourceKind>('game')
  const [drawKind, setDrawKind] = useState<FilmAnnotationKind>('route')
  const [drawAthleteId, setDrawAthleteId] = useState('')
  const [toolMode, setToolMode] = useState<FilmToolMode>('draw')
  const [activeTrackId, setActiveTrackId] = useState<string>()
  const [trackAthleteId, setTrackAthleteId] = useState('')
  const [trackLabel, setTrackLabel] = useState('')
  const [trackRole, setTrackRole] = useState('')
  const [trackTeam, setTrackTeam] = useState<TrackingTeam>('opponent')
  const [trackSide, setTrackSide] = useState<PlaySide>('offense')
  const [formationStartTime, setFormationStartTime] = useState<number>()
  const [autoStatus, setAutoStatus] = useState<AutoTrackingStatus>('idle')
  const [autoConfidence, setAutoConfidence] = useState(0)
  const [autoFrameCount, setAutoFrameCount] = useState(0)
  const [autoCameraDx, setAutoCameraDx] = useState(0)
  const [autoCameraDy, setAutoCameraDy] = useState(0)
  const [autoCameraScale, setAutoCameraScale] = useState(1)
  const [autoBlurLevel, setAutoBlurLevel] = useState(0)
  const [autoPlayerScale, setAutoPlayerScale] = useState(1)
  const [autoMotionCompensated, setAutoMotionCompensated] = useState(false)
  const [autoFollowPoint, setAutoFollowPoint] = useState<Pick<FilmAnnotationPoint, 'x' | 'y'>>()
  const [showAllTracksDuringFollow, setShowAllTracksDuringFollow] = useState(false)
  const [autoArmed, setAutoArmed] = useState(false)
  const [videoTime, setVideoTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [trackingMessage, setTrackingMessage] = useState<string>()
  const [activeThrowLandmark, setActiveThrowLandmark] = useState<ThrowLandmark>('throwingShoulder')
  const [throwMessage, setThrowMessage] = useState<string>()

  const [opponentFilter, setOpponentFilter] = useState('')

  const roster = useMemo(
    () => [...data.athletes].sort((a, b) => a.name.localeCompare(b.name)),
    [data.athletes],
  )
  const opponents = useMemo(() => opponentsFromFilm(data.filmPlays), [data.filmPlays])
  const filmCatalog = data.filmCatalog
  const formationOpts = useMemo(() => formationOptions(filmCatalog), [filmCatalog])
  const personnelOpts = useMemo(() => personnelOptions(filmCatalog), [filmCatalog])
  const resolveLabel = useMemo(() => catalogLabelResolver(filmCatalog), [filmCatalog])
  const report = useMemo(
    () => buildTendencyReport(data.filmPlays, { opponent: opponentFilter || undefined }, filmCatalog),
    [data.filmPlays, opponentFilter, filmCatalog],
  )

  function downloadReport(format: 'csv' | 'html') {
    const opponent = opponentFilter || undefined
    const slug = (opponentFilter || 'all-film').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    if (format === 'csv') {
      triggerDownload(
        scoutingReportCsv(report, opponent),
        'text/csv;charset=utf-8',
        `scouting-${slug}.csv`,
      )
      return
    }
    const html = scoutingReportHtml(report, opponent)
    // Prefer opening the printable report in a new tab; fall back to a download
    // when the browser blocks pop-ups.
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    } else {
      triggerDownload(html, 'text/html;charset=utf-8', `scouting-${slug}.html`)
    }
  }
  const selectedFilmPlays = useMemo(
    () => data.filmPlays.filter((play) => !opponentFilter || (play.opponent ?? '') === opponentFilter),
    [data.filmPlays, opponentFilter],
  )
  const recent = useMemo(
    () =>
      [...selectedFilmPlays]
        .sort((a, b) => `${b.date ?? ''}${b.createdAt ?? ''}`.localeCompare(`${a.date ?? ''}${a.createdAt ?? ''}`))
        .slice(0, 14),
    [selectedFilmPlays],
  )

  const conceptOptions = conceptOptionsForCall(form.call, filmCatalog)
  const playerTracks = pending.filter(isPlayerTrack)
  const activeTrack = playerTracks.find((track) => track.id === activeTrackId)
  const formationTracks = playerTracks.filter((track) =>
    (track.trackingTeam ?? 'opponent') === trackTeam && (track.trackingSide ?? 'offense') === trackSide,
  )
  const formationLocated = formationTracks.filter((track) => trackKeyframes(track.points).length > 0)
  const completedRoutes = formationTracks.filter((track) => track.trackingComplete).length
  const activeStats = activeTrack ? summarizePlayerTrack(activeTrack.points) : undefined
  const activeSpeed = activeTrack ? summarizeTrackSpeed(activeTrack.points) : undefined
  const speedLeaders = playerTracks
    .map((track) => ({ track, speed: summarizeTrackSpeed(track.points) }))
    .filter((entry) => entry.speed.hasField)
    .sort((left, right) => right.speed.topSpeedMph - left.speed.topSpeedMph)
    .slice(0, 8)
  const hasFieldTracks = playerTracks.some((track) => track.points.some((point) => Array.isArray(point.field)))
  const activeTrackHasField = Boolean(activeTrack?.points.some((point) => Array.isArray(point.field)))
  const heatmapScope = activeTrackHasField && activeTrack ? [activeTrack] : playerTracks
  const heatmapScopeLabel = activeTrackHasField && activeTrack
    ? (activeTrack.label ?? 'Active player')
    : 'All tracked players'
  const fieldHeatmap = hasFieldTracks ? buildFieldHeatmap(heatmapScope) : undefined
  const throwRecord = throwAnalysisAnnotation(pending)
  const throwAnalysis = throwRecord?.throwAnalysis ?? {}
  const throwMetrics = computeThrowMetrics(throwAnalysis)
  const suggestedThrowFamily = suggestThrowFamily(throwAnalysis, form.call)
  const throwLandmarkCount = Object.values(throwAnalysis.landmarks ?? {}).filter(Boolean).length
  const quarterbacks = roster.filter((athlete) => athlete.positionGroup === 'QB')

  useEffect(() => {
    activeTrackIdRef.current = activeTrackId
  }, [activeTrackId])

  // Release any object URL / capture stream when the page unmounts.
  useEffect(() => {
    const video = videoRef.current as FrameCallbackVideo | null
    return () => {
      if (autoFrameRequestRef.current !== undefined) video?.cancelVideoFrameCallback?.(autoFrameRequestRef.current)
      if (autoTimerRef.current !== undefined) window.clearTimeout(autoTimerRef.current)
      autoRunningRef.current = false
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])


  function cancelAutoLoop() {
    const video = videoRef.current as FrameCallbackVideo | null
    if (autoFrameRequestRef.current !== undefined) {
      video?.cancelVideoFrameCallback?.(autoFrameRequestRef.current)
      autoFrameRequestRef.current = undefined
    }
    if (autoTimerRef.current !== undefined) {
      window.clearTimeout(autoTimerRef.current)
      autoTimerRef.current = undefined
    }
  }

  function stopAutoFollow(
    status: AutoTrackingStatus = 'ready',
    message?: string,
    pauseVideo = true,
  ) {
    autoRunningRef.current = false
    cancelAutoLoop()
    if (pauseVideo) videoRef.current?.pause()
    setAutoStatus(status)
    if (message) setTrackingMessage(message)
  }

  function processAutoFrame(mediaTime: number) {
    if (!autoRunningRef.current) return
    const video = videoRef.current
    const tracker = autoTrackerRef.current
    const trackId = activeTrackIdRef.current
    if (!video || !tracker || !trackId) {
      stopAutoFollow('error', 'Auto-follow stopped because the active player or video was unavailable.')
      return
    }
    if (mediaTime <= autoLastMediaTimeRef.current + 0.002) {
      scheduleAutoFrame()
      return
    }
    autoLastMediaTimeRef.current = mediaTime
    const result = tracker.trackCurrentFrame()
    if (!result) {
      setAutoArmed(true)
      stopAutoFollow('lost', 'FAI could not read the next frame. Tap the player to correct and automatically resume.')
      return
    }
    if (tracker.lockedTrackId !== trackId) {
      stopAutoFollow('error', 'Auto-follow stopped because the selected athlete track changed unexpectedly.')
      return
    }
    if (result.decision.action === 'recover') {
      setAutoStatus('running')
      setTrackingMessage('FAI is recovering the locked athlete with an expanded search. Identity will not switch.')
      scheduleAutoFrame()
      return
    }
    if (result.decision.action === 'pause-for-correction' || !result.sample) {
      setAutoArmed(true)
      stopAutoFollow('lost', `${result.decision.reason ?? 'The locked athlete could not be confirmed.'} Tap the player once to correct and continue.`)
      return
    }

    const sample = result.sample
    const point: FilmAnnotationPoint = {
      ...sample.point,
      t: mediaTime,
      source: 'auto',
      confidence: sample.confidence,
      cameraDx: sample.camera.dx,
      cameraDy: sample.camera.dy,
      cameraScale: sample.camera.scale,
      blurLevel: sample.blurLevel,
      playerScale: sample.playerScale,
      motionCompensated: sample.compensated,
    }
    setPending((current) => current.map((annotation) =>
      annotation.id === trackId
        ? { ...annotation, points: upsertTrackKeyframe(annotation.points, mediaTime, point) }
        : annotation,
    ))
    setAutoFollowPoint(sample.point)
    setVideoTime(mediaTime)
    setAutoConfidence(sample.confidence)
    setAutoFrameCount((count) => count + 1)
    setAutoCameraDx(sample.camera.dx)
    setAutoCameraDy(sample.camera.dy)
    setAutoCameraScale(sample.camera.scale)
    setAutoBlurLevel(sample.blurLevel)
    setAutoPlayerScale(sample.playerScale)
    setAutoMotionCompensated(sample.compensated)
    if (video.ended || (Number.isFinite(video.duration) && video.currentTime >= video.duration)) {
      stopAutoFollow('complete', 'Auto-follow reached the end of the clip.')
      return
    }
    scheduleAutoFrame()
  }

  function scheduleAutoFrame() {
    if (!autoRunningRef.current) return
    const video = videoRef.current as FrameCallbackVideo | null
    if (!video) return
    if (video.requestVideoFrameCallback) {
      autoFrameRequestRef.current = video.requestVideoFrameCallback((_now, metadata) => {
        autoFrameRequestRef.current = undefined
        processAutoFrame(metadata.mediaTime)
      })
      return
    }
    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = undefined
      processAutoFrame(video.currentTime)
    }, 34)
  }

  function startAutoFollowFromPoint(point: Pick<FilmAnnotationPoint, 'x' | 'y'>, time: number) {
    const video = videoRef.current
    if (!video || !activeTrackIdRef.current) {
      setTrackingMessage('Load a clip and select a player track before starting auto-follow.')
      return
    }
    cancelAutoLoop()
    const trackId = activeTrackIdRef.current
    const tracker = new LockedBrowserPlayerAutoTracker(video)
    if (!trackId || !tracker.initialize(trackId, point)) {
      setAutoStatus('error')
      setTrackingMessage('FAI could not lock onto that frame. Wait for the video to load, then tap the player again.')
      return
    }
    autoTrackerRef.current = tracker
    autoRunningRef.current = true
    autoLastMediaTimeRef.current = time - 0.001
    lowConfidenceFramesRef.current = 0
    setAutoFrameCount(0)
    setAutoConfidence(1)
    setAutoCameraDx(0)
    setAutoCameraDy(0)
    setAutoCameraScale(1)
    setAutoBlurLevel(0)
    setAutoPlayerScale(1)
    setAutoMotionCompensated(false)
    setAutoFollowPoint(point)
    setShowAllTracksDuringFollow(false)
    setAutoArmed(false)
    setAutoStatus('running')
    setTrackingMessage('Single-target auto-follow is running. Unrelated player labels and trails are hidden unless Show all tracks is enabled.')
    scheduleAutoFrame()
    void video.play().catch(() => {
      stopAutoFollow('error', 'Playback was blocked. Press Play, then start auto-follow again.')
    })
  }

  function startAutoFollow() {
    const video = videoRef.current
    if (!video || !activeTrack) {
      setTrackingMessage('Start or select a player track first.')
      return
    }
    const position = trackPositionAt(activeTrack.points, video.currentTime)
      ?? trackKeyframes(activeTrack.points).at(-1)
    if (!position) {
      setTrackingMessage('Tap the player on the video once before starting auto-follow.')
      return
    }
    startAutoFollowFromPoint(position, video.currentTime)
  }

  function armAutoFollow() {
    if (!activeTrack) {
      setTrackingMessage('Start or select a player track first.')
      return
    }
    stopAutoFollow('armed', undefined, true)
    setShowAllTracksDuringFollow(false)
    setAutoArmed(true)
    setAutoStatus('armed')
    setTrackingMessage('Auto-follow armed. Tap the player at the current frame; FAI will begin following immediately.')
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function loadFile(file: File) {
    stopAutoFollow('idle', undefined, false)
    setAutoArmed(false)
    setCaptureError(undefined)
    stopStream()
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const video = videoRef.current
    if (video) {
      video.srcObject = null
      video.src = url
      void video.play().catch(() => undefined)
    }
    setSourceLabel(file.name)
    setVideoTime(0)
    setVideoDuration(0)
    setVideoPlaying(false)
    setForm((prev) => ({ ...prev, filmLabel: prev.filmLabel || file.name }))
  }

  async function startScreenCapture() {
    stopAutoFollow('idle', undefined, false)
    setAutoArmed(false)
    setCaptureError(undefined)
    const media = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>
    }
    if (!media?.getDisplayMedia) {
      setCaptureError('Screen capture is not supported in this browser.')
      return
    }
    try {
      const stream = await media.getDisplayMedia({ video: true, audio: false })
      stopStream()
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      streamRef.current = stream
      setVideoTime(0)
      setVideoDuration(0)
      setVideoPlaying(false)
      const video = videoRef.current
      if (video) {
        video.src = ''
        video.srcObject = stream
        void video.play().catch(() => undefined)
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => setSourceLabel(''))
      setSourceLabel('Live screen capture')
    } catch (error: unknown) {
      setCaptureError(error instanceof Error ? error.message : 'Screen capture was cancelled.')
    }
  }

  function commitPath(points: FilmAnnotationPoint[]) {
    const annotation: FilmAnnotation = {
      id: `anno-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: drawKind,
      athleteId: drawAthleteId || undefined,
      color: KIND_COLOR[drawKind],
      points,
    }
    setPending((prev) => [...prev, annotation])
  }

  function createTrack() {
    if (formationTracks.length >= 11) {
      setTrackingMessage('This team/unit already has 11 player tracks. Delete or change one before adding another.')
      return
    }
    stopAutoFollow('idle', undefined, false)
    setAutoArmed(false)
    const athlete = trackTeam === 'ours' ? roster.find((item) => item.id === trackAthleteId) : undefined
    const role = trackRole.trim()
    const label = trackLabel.trim() || athlete?.name || role || `Player ${formationTracks.length + 1}`
    let trackId: string
    do {
      nextTrackIdRef.current += 1
      trackId = `track-local-${nextTrackIdRef.current}`
    } while (playerTracks.some((item) => item.id === trackId))
    const track = createPlayerTrack({
      id: trackId,
      athleteId: athlete?.id,
      label,
      side: trackSide,
      team: trackTeam,
      role,
    })
    setPending((current) => [...current, track])
    setActiveTrackId(track.id)
    setTrackLabel('')
    setTrackRole('')
    setAutoStatus('idle')
    if (formationStartTime !== undefined) seekVideo(formationStartTime)
    setTrackingMessage(`Player ${formationTracks.length + 1} of 11 ready: ${label}. Arm auto-follow, then tap the player.`)
  }

  function commitTrackPoint(point: FilmAnnotationPoint, time: number) {
    if (!activeTrackId) {
      setTrackingMessage('Start or select a player track before placing a keyframe.')
      return
    }
    if (autoRunningRef.current) stopAutoFollow('ready', undefined, false)
    const manualPoint: FilmAnnotationPoint = { ...point, t: time, source: 'manual', confidence: 1 }
    setPending((current) => current.map((annotation) =>
      annotation.id === activeTrackId
        ? { ...annotation, points: upsertTrackKeyframe(annotation.points, time, manualPoint) }
        : annotation,
    ))
    setVideoTime(time)
    setAutoConfidence(1)
    if (autoArmed) {
      window.setTimeout(() => startAutoFollowFromPoint(manualPoint, time), 0)
    } else {
      setAutoStatus('ready')
      setTrackingMessage(`Manual point saved at ${formatTrackTime(time)}. Start auto-follow or advance and correct manually.`)
    }
  }

  function updateThrowAnalysis(patch: Partial<ThrowAnalysis>) {
    setPending((current) => {
      const existing = throwAnalysisAnnotation(current)?.throwAnalysis ?? {}
      return upsertThrowAnalysis(current, { ...existing, ...patch })
    })
  }

  function markThrowTime(key: ThrowTimeKey) {
    const time = Math.round((videoRef.current?.currentTime ?? videoTime) * 1000) / 1000
    updateThrowAnalysis({ [key]: time })
    setThrowMessage(`${THROW_TIME_LABEL[key][0].toUpperCase()}${THROW_TIME_LABEL[key].slice(1)} marked at ${formatTrackTime(time)}.`)
  }

  function commitThrowLandmarkPoint(point: FilmAnnotationPoint, time: number) {
    setPending((current) => {
      const existing = throwAnalysisAnnotation(current)?.throwAnalysis ?? {}
      const landmarks = { ...(existing.landmarks ?? {}), [activeThrowLandmark]: { ...point, t: time } }
      return upsertThrowAnalysis(current, {
        ...existing,
        releaseTimeSec: existing.releaseTimeSec ?? Math.round(time * 1000) / 1000,
        landmarks,
      })
    })
    const label = THROW_LANDMARKS.find((item) => item.key === activeThrowLandmark)?.label ?? 'Landmark'
    setThrowMessage(`${label} marked on the release frame.`)
  }

  function clearThrowBreakdown() {
    setPending((current) => removeThrowAnalysis(current))
    setActiveThrowLandmark('throwingShoulder')
    setThrowMessage('Throw analysis cleared from this unsaved breakdown.')
  }

  function seekVideo(nextTime: number) {
    if (autoRunningRef.current) stopAutoFollow('ready', 'Auto-follow paused because the video was scrubbed.', false)
    const video = videoRef.current
    if (!video || !Number.isFinite(nextTime)) return
    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : videoDuration
    const upper = duration > 0 ? duration : Math.max(0, nextTime)
    const next = Math.max(0, Math.min(upper, nextTime))
    video.pause()
    try {
      video.currentTime = next
    } catch {
      return
    }
    setVideoTime(next)
  }

  function seekBy(seconds: number) {
    seekVideo((videoRef.current?.currentTime ?? videoTime) + seconds)
  }

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }

  function stepFrame(direction: -1 | 1) {
    seekBy(direction * TRACK_FRAME_SECONDS)
  }

  // Fast-tagging: start a fresh play pre-filled with the previous snap's context
  // (opponent, down/distance, formation, personnel, call, concept). Outcome
  // fields — ball carrier, gain, result, drawings — are cleared so only what
  // changed needs a touch. No-op while editing an existing play.
  function duplicateLastPlay() {
    const last = recent[0]
    if (!last || editingId) return
    setEditingId(null)
    setPending([])
    setClip({})
    setForm({
      side: last.side ?? 'offense',
      date: last.date ?? todayIso(),
      opponent: last.opponent,
      quarter: last.quarter,
      down: last.down,
      distance: last.distance,
      yardLine: last.yardLine,
      hash: last.hash,
      formation: last.formation,
      personnel: last.personnel,
      call: last.call,
      concept: last.concept,
      filmLabel: last.filmLabel,
    })
  }

  // Professional keyboard controls. Subscribed once; reads the latest playback
  // handlers through a ref (kept fresh in an effect) so it never goes stale and
  // never re-binds the listener during playback. Ignored while typing in a field.
  const shortcutHandlersRef = useRef({ seekBy, togglePlayback, duplicateLastPlay, canEdit })
  useEffect(() => {
    shortcutHandlersRef.current = { seekBy, togglePlayback, duplicateLastPlay, canEdit }
  })
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return
      // Fast-tag: "D" clones the previous snap's context into a new play.
      if ((event.key === 'd' || event.key === 'D') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (!shortcutHandlersRef.current.canEdit) return
        event.preventDefault()
        shortcutHandlersRef.current.duplicateLastPlay()
        return
      }
      const shortcut = resolveFilmShortcut(event)
      if (!shortcut) return
      event.preventDefault()
      if (shortcut.kind === 'toggle') shortcutHandlersRef.current.togglePlayback()
      else shortcutHandlersRef.current.seekBy(shortcutSeconds(shortcut, TRACK_FRAME_SECONDS))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function removeCurrentKeyframe() {
    if (!activeTrackId) return
    setPending((current) => current.map((annotation) =>
      annotation.id === activeTrackId
        ? { ...annotation, points: removeTrackKeyframe(annotation.points, videoTime) }
        : annotation,
    ))
    setTrackingMessage(`Removed the keyframe nearest ${formatTrackTime(videoTime)}, when one existed.`)
  }

  function finishActiveRoute() {
    if (!activeTrackId) return
    stopAutoFollow('complete', undefined, true)
    setAutoArmed(false)
    setPending((current) => current.map((annotation) =>
      annotation.id === activeTrackId ? { ...annotation, trackingComplete: true } : annotation,
    ))
    const label = activeTrack?.label ?? 'Player route'
    setTrackingMessage(`${label} saved in this breakdown. Start the next player; Save Play persists all routes.`)
    if (formationStartTime !== undefined) seekVideo(formationStartTime)
  }

  function deleteActiveTrack() {
    if (!activeTrackId) return
    stopAutoFollow('idle', undefined, false)
    setPending((current) => current.filter((annotation) => annotation.id !== activeTrackId))
    setActiveTrackId(undefined)
    setTrackingMessage('Player track removed.')
  }

  function createSource() {
    const label = newSourceLabel.trim() || sourceLabel || 'Untitled film'
    const id = addFilmSource({ label, kind: newSourceKind })
    setSelectedSourceId(id)
    setNewSourceLabel('')
  }

  function markClip(which: 'start' | 'end') {
    const time = videoRef.current?.currentTime
    if (typeof time !== 'number' || !Number.isFinite(time)) return
    setClip((current) => ({ ...current, [which]: Math.round(time * 10) / 10 }))
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setPending([])
    setEditingId(null)
    setClip({})
    setActiveTrackId(undefined)
    stopAutoFollow('idle', undefined, false)
    setAutoArmed(false)
    setAutoFrameCount(0)
    setAutoConfidence(0)
    setAutoCameraDx(0)
    setAutoCameraDy(0)
    setAutoCameraScale(1)
    setAutoBlurLevel(0)
    setAutoPlayerScale(1)
    setAutoMotionCompensated(false)
    setShowAllTracksDuringFollow(false)
    setFormationStartTime(undefined)
    setTrackingMessage(undefined)
    setActiveThrowLandmark('throwingShoulder')
    setThrowMessage(undefined)
    setVideoTime(0)
    setVideoPlaying(false)
  }

  function savePlay() {
    const video = videoRef.current
    const time = video && Number.isFinite(video.currentTime) ? video.currentTime : undefined
    const startSec = clip.start ?? (editingId ? form.startTimeSec : undefined)
    const payload: Omit<FilmPlay, 'id' | 'createdAt'> = {
      ...form,
      filmLabel: form.filmLabel || sourceLabel || undefined,
      filmSourceId: selectedSourceId || form.filmSourceId || undefined,
      startTimeSec: startSec,
      endTimeSec: clip.end ?? (editingId ? form.endTimeSec : undefined),
      videoTimeSec: editingId
        ? form.videoTimeSec
        : startSec ?? (time && time > 0 ? Math.round(time * 10) / 10 : undefined),
      annotations: pending.length > 0 ? pending : undefined,
    }
    if (editingId) {
      updateFilmPlay({ ...(payload as FilmPlay), id: editingId })
    } else {
      addFilmPlay(payload)
    }
    resetForm()
  }

  function editPlay(play: FilmPlay) {
    setEditingId(play.id)
    setForm({ ...play })
    const annotations = play.annotations ?? []
    setPending(annotations)
    const firstTrack = annotations.find(isPlayerTrack)
    const savedThrow = throwAnalysisAnnotation(annotations)
    setActiveTrackId(firstTrack?.id)
    if (firstTrack) {
      setTrackTeam(firstTrack.trackingTeam ?? 'opponent')
      setTrackSide(firstTrack.trackingSide ?? 'offense')
      setFormationStartTime(trackKeyframes(firstTrack.points)[0]?.t)
    }
    setToolMode(firstTrack ? 'track' : savedThrow ? 'throw' : 'draw')
    setTrackingMessage(firstTrack ? 'Saved player tracking loaded. Select a player and continue correcting keyframes.' : undefined)
    setThrowMessage(savedThrow ? 'Saved quarterback throw analysis loaded.' : undefined)
    setOpponentFilter('')
    const video = videoRef.current
    if (video && typeof play.videoTimeSec === 'number' && !video.srcObject) {
      video.currentTime = play.videoTimeSec
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function jumpTo(play: FilmPlay) {
    const video = videoRef.current
    const target = play.startTimeSec ?? play.videoTimeSec
    if (video && typeof target === 'number' && !video.srcObject) {
      video.currentTime = target
      void video.play().catch(() => undefined)
    }
  }

  function setField<K extends keyof FilmPlay>(key: K, value: FilmPlay[K] | undefined) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function numberField(value: string): number | undefined {
    if (value === '') return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  function metricText(value: number | undefined, digits: number, suffix: string): string {
    return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—'
  }

  const focusedAutoFollow = Boolean(activeTrackId)
    && !showAllTracksDuringFollow
    && (autoStatus === 'running' || autoStatus === 'armed' || autoStatus === 'lost')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-chalk">
          Film <span className="text-fai">Room</span>
        </h1>
        <div className="mt-1 text-xs text-muted">
          Select an 11-player unit, auto-follow one athlete at a time, save every route,
          and generate a screenshot-ready formation and route map.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Saved plays" value={selectedFilmPlays.length} accent="fai" />
        <StatTile label="Run rate" value={report.totalPlays ? `${Math.round(report.runShare * 100)}%` : '—'} accent="flame" />
        <StatTile label="Pass rate" value={report.totalPlays ? `${Math.round(report.passShare * 100)}%` : '—'} accent="fai" />
        <StatTile label="Opponents" value={opponents.length} accent="gold" />
      </div>

      <p className="text-sm text-muted">Rates use {report.totalPlays} saved scrimmage plays with a run/pass call. Annotation-only plays and special teams are excluded from tendencies. The opponent filter applies to saved plays and tendencies.</p>

      <HudlImportWizard />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-3">
          <FilmStage
            videoRef={videoRef}
            annotations={pending}
            drawKind={drawKind}
            drawColor={KIND_COLOR[drawKind]}
            toolMode={toolMode}
            activeTrackId={activeTrackId}
            focusActiveTrack={focusedAutoFollow}
            followPoint={autoStatus === 'running' ? autoFollowPoint : undefined}
            throwAnalysis={throwAnalysis}
            activeThrowLandmark={activeThrowLandmark}
            currentTime={videoTime}
            onTimeChange={setVideoTime}
            onDurationChange={setVideoDuration}
            onPlayingChange={setVideoPlaying}
            onCommitPath={commitPath}
            onCommitTrackPoint={commitTrackPoint}
            onCommitThrowPoint={commitThrowLandmarkPoint}
            canDraw={canEdit}
          />
          <div className="rounded-xl border border-line bg-panel-2/40 p-3" aria-label="Video scrub controls">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => seekBy(-5)}
                className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs font-black text-chalk disabled:opacity-40"
                disabled={videoDuration <= 0}
                aria-label="Back 5 seconds"
              >
                −5s
              </button>
              <button
                type="button"
                onClick={togglePlayback}
                className="grid min-h-11 min-w-12 place-items-center rounded-lg border border-fai/40 bg-fai/10 px-3 text-sm font-black text-fai"
                aria-label={videoPlaying ? 'Pause video' : 'Play video'}
              >
                {videoPlaying ? 'Ⅱ' : '▶'}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, videoDuration)}
                step={0.01}
                value={videoDuration > 0 ? Math.min(videoTime, videoDuration) : 0}
                onPointerDown={() => videoRef.current?.pause()}
                onChange={(event) => seekVideo(Number(event.target.value))}
                disabled={videoDuration <= 0}
                aria-label="Scrub video"
                aria-valuetext={`${formatTrackTime(videoTime)} of ${formatTrackTime(videoDuration)}`}
                className="h-11 min-w-0 flex-1 cursor-pointer accent-fai disabled:cursor-not-allowed disabled:opacity-40"
                style={{ touchAction: 'pan-y' }}
              />
              <button
                type="button"
                onClick={() => seekBy(5)}
                className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs font-black text-chalk disabled:opacity-40"
                disabled={videoDuration <= 0}
                aria-label="Forward 5 seconds"
              >
                +5s
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold uppercase tracking-wide text-muted/80">
              <span className="rounded border border-line px-1.5 py-0.5">Space / K</span><span>play</span>
              <span className="rounded border border-line px-1.5 py-0.5">← →</span><span>frame</span>
              <span className="rounded border border-line px-1.5 py-0.5">⇧← ⇧→</span><span>10 frames</span>
              <span className="rounded border border-line px-1.5 py-0.5">J / L</span><span>±1 sec</span>
              <span className="rounded border border-line px-1.5 py-0.5">D</span><span>same as last play</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px] font-bold text-muted">
              <span>Drag the bar to scrub anywhere in the clip.</span>
              <span className="shrink-0 text-fai nums" data-testid="video-time-display">
                {formatTrackTime(videoTime)} / {videoDuration > 0 ? formatTrackTime(videoDuration) : sourceLabel === 'Live screen capture' ? 'LIVE' : '0:00.00'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <label className="cursor-pointer rounded-lg border border-line bg-panel px-3 py-2 text-sm font-bold text-chalk hover:border-fai/40">
                  Upload clip
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) loadFile(file)
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void startScreenCapture()}
                  className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-bold text-chalk hover:border-fai/40"
                >
                  ▶ Capture screen
                </button>
              </>
            )}
            {sourceLabel && <Pill tone="fai">{sourceLabel}</Pill>}
            {captureError && <span className="text-xs text-down">{captureError}</span>}
          </div>

          {canEdit && (
            <div className="space-y-2 rounded-xl border border-line bg-panel-2/30 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Master film</span>
                <select
                  value={selectedSourceId}
                  onChange={(event) => setSelectedSourceId(event.target.value)}
                  className={selectClass}
                >
                  <option value="">No source — single clip</option>
                  {data.filmSources.map((source) => (
                    <option key={source.id} value={source.id}>{source.label} · {source.kind}</option>
                  ))}
                </select>
                <input
                  value={newSourceLabel}
                  onChange={(event) => setNewSourceLabel(event.target.value)}
                  placeholder="New film name (e.g. vs Central)"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-chalk placeholder:text-muted/60"
                />
                <select
                  value={newSourceKind}
                  onChange={(event) => setNewSourceKind(event.target.value as FilmSourceKind)}
                  className={selectClass}
                >
                  <option value="game">Game</option>
                  <option value="practice">Practice</option>
                  <option value="scrimmage">Scrimmage</option>
                  <option value="other">Other</option>
                </select>
                <button
                  type="button"
                  onClick={createSource}
                  className="rounded-lg border border-fai/40 bg-fai/10 px-3 py-1.5 text-xs font-black text-fai"
                >
                  + Add film
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Play clip</span>
                <button type="button" onClick={() => markClip('start')} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-black text-chalk">◧ Mark start</button>
                <button type="button" onClick={() => markClip('end')} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-black text-chalk">Mark end ◨</button>
                <span className="text-xs font-bold text-muted nums">
                  {typeof clip.start === 'number' ? formatTrackTime(clip.start) : '—'}
                  {' → '}
                  {typeof clip.end === 'number' ? formatTrackTime(clip.end) : '—'}
                </span>
                {(clip.start !== undefined || clip.end !== undefined) && (
                  <button type="button" onClick={() => setClip({})} className="text-[11px] font-bold text-muted underline">clear</button>
                )}
                <span className="text-[10px] text-muted/70">Save Play stores the range; jump back anytime.</span>
              </div>
            </div>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel-2/30 p-2">
              <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-muted">Film tools</span>
              <button
                type="button"
                onClick={() => setToolMode('draw')}
                className={`rounded-lg border px-3 py-2 text-xs font-black ${toolMode === 'draw' ? 'border-fai bg-fai/10 text-chalk' : 'border-line text-muted'}`}
              >
                ✎ Draw
              </button>
              <button
                type="button"
                onClick={() => setToolMode('track')}
                className={`rounded-lg border px-3 py-2 text-xs font-black ${toolMode === 'track' ? 'border-fai bg-fai/10 text-chalk' : 'border-line text-muted'}`}
              >
                ◎ Track players
              </button>
              <button
                type="button"
                onClick={() => { stopAutoFollow('ready', undefined, false); setAutoArmed(false); setToolMode('throw') }}
                className={`rounded-lg border px-3 py-2 text-xs font-black ${toolMode === 'throw' ? 'border-flame bg-flame/10 text-chalk' : 'border-line text-muted'}`}
              >
                🎯 Throw analysis
              </button>
              {playerTracks.length > 0 && <Pill tone="fai">{playerTracks.length} tracked</Pill>}
              {throwRecord && <Pill tone="gold">QB throw</Pill>}
            </div>
          )}


          {canEdit && toolMode === 'throw' && (
            <div className="space-y-4 rounded-xl border border-flame/35 bg-flame/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-chalk">QB throw mechanics, speed, and type</div>
                  <div className="mt-1 max-w-3xl text-[11px] leading-relaxed text-muted">
                    Mark snap, plant, release, and arrival. Enter air distance for average ball speed. At the release frame, choose each landmark below and tap it on the video.
                  </div>
                </div>
                <Pill tone={throwLandmarkCount === THROW_LANDMARKS.length ? 'fai' : 'gold'}>{throwLandmarkCount}/8 landmarks</Pill>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <select
                  value={throwAnalysis.quarterbackId ?? ''}
                  onChange={(event) => updateThrowAnalysis({ quarterbackId: event.target.value || undefined })}
                  className={selectClass}
                  aria-label="Throw quarterback"
                >
                  <option value="">Unassigned quarterback</option>
                  {quarterbacks.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}
                </select>
                <select
                  value={throwAnalysis.throwFamily ?? ''}
                  onChange={(event) => updateThrowAnalysis({ throwFamily: (event.target.value || undefined) as ThrowFamily | undefined })}
                  className={selectClass}
                  aria-label="Throw family"
                >
                  <option value="">Throw family…</option>
                  {THROW_FAMILIES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                <select
                  value={throwAnalysis.trajectory ?? ''}
                  onChange={(event) => updateThrowAnalysis({ trajectory: (event.target.value || undefined) as ThrowTrajectory | undefined })}
                  className={selectClass}
                  aria-label="Throw trajectory"
                >
                  <option value="">Ball type…</option>
                  {THROW_TRAJECTORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                <select
                  value={throwAnalysis.platform ?? ''}
                  onChange={(event) => updateThrowAnalysis({ platform: (event.target.value || undefined) as ThrowPlatform | undefined })}
                  className={selectClass}
                  aria-label="Throw platform"
                >
                  <option value="">Platform…</option>
                  {THROW_PLATFORM_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                <select
                  value={throwAnalysis.armSlot ?? ''}
                  onChange={(event) => updateThrowAnalysis({ armSlot: (event.target.value || undefined) as ThrowArmSlot | undefined })}
                  className={selectClass}
                  aria-label="Throw arm slot"
                >
                  <option value="">Arm slot…</option>
                  {THROW_ARM_SLOT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                <select
                  value={throwAnalysis.handedness ?? ''}
                  onChange={(event) => updateThrowAnalysis({ handedness: (event.target.value || undefined) as ThrowHandedness | undefined })}
                  className={selectClass}
                  aria-label="Throw handedness"
                >
                  <option value="">Throwing hand…</option>
                  {THROW_HANDEDNESS_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {([
                  ['snapTimeSec', 'Mark snap'],
                  ['plantTimeSec', 'Mark plant'],
                  ['releaseTimeSec', 'Mark release'],
                  ['arrivalTimeSec', 'Mark arrival'],
                ] as Array<[ThrowTimeKey, string]>).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={label}
                    onClick={() => markThrowTime(key)}
                    className="rounded-lg border border-line bg-panel px-3 py-2 text-xs font-black text-chalk hover:border-flame/50"
                  >
                    {label}
                    {typeof throwAnalysis[key] === 'number' && <span className="ml-2 text-flame nums">{formatTrackTime(throwAnalysis[key] as number)}</span>}
                  </button>
                ))}
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={throwAnalysis.throwDistanceYards ?? ''}
                  onChange={(event) => updateThrowAnalysis({ throwDistanceYards: numberField(event.target.value) })}
                  placeholder="Air distance (yds)"
                  aria-label="Throw distance yards"
                  className={inputClass}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel-2/40 px-3 py-2 text-[11px] text-muted">
                <span>Suggested family: <strong className="text-chalk">{THROW_FAMILIES.find((item) => item.key === suggestedThrowFamily)?.label}</strong></span>
                <button type="button" onClick={() => updateThrowAnalysis({ throwFamily: suggestedThrowFamily })} className="rounded-md border border-flame/40 px-2 py-1 font-black text-flame">Use suggestion</button>
                {typeof throwAnalysis.releaseTimeSec === 'number' && (
                  <button type="button" onClick={() => seekVideo(throwAnalysis.releaseTimeSec as number)} className="rounded-md border border-line px-2 py-1 font-black text-chalk">Jump to release</button>
                )}
                <span className="ml-auto">Speed = coach-entered air yards ÷ release-to-arrival time.</span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Throw analysis metrics">
                <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Time to throw</div><div className="text-sm font-black text-fai nums">{metricText(throwMetrics.timeToThrowSec, 2, 's')}</div></div>
                <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Plant → release</div><div className="text-sm font-black text-chalk nums">{metricText(throwMetrics.plantToReleaseSec, 2, 's')}</div></div>
                <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Ball flight</div><div className="text-sm font-black text-chalk nums">{metricText(throwMetrics.flightTimeSec, 2, 's')}</div></div>
                <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Average ball speed</div><div className="text-sm font-black text-flame nums">{metricText(throwMetrics.averageBallSpeedMph, 1, ' mph')}</div></div>
                <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Elbow angle</div><div className="text-sm font-black text-chalk nums">{metricText(throwMetrics.elbowAngleDeg, 0, '°')}</div></div>
                <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Arm-slot angle</div><div className="text-sm font-black text-chalk nums">{metricText(throwMetrics.armSlotAngleDeg, 0, '°')}</div></div>
                <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Shoulder–hip split</div><div className="text-sm font-black text-chalk nums">{metricText(throwMetrics.shoulderHipSeparationDeg, 0, '°')}</div></div>
                <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Base width</div><div className="text-sm font-black text-chalk nums">{metricText(throwMetrics.baseWidthPct, 1, '% frame')}</div></div>
                <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Stride-line angle</div><div className="text-sm font-black text-chalk nums">{metricText(throwMetrics.strideLineAngleDeg, 0, '°')}</div></div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-black text-chalk">Release-frame landmarks</div>
                  <div className="text-[10px] text-muted">Choose a landmark, then tap it on the paused video.</div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                  {THROW_LANDMARKS.map((landmark) => (
                    <button
                      key={landmark.key}
                      type="button"
                      onClick={() => setActiveThrowLandmark(landmark.key)}
                      className={`rounded-lg border px-2 py-2 text-[11px] font-black ${activeThrowLandmark === landmark.key ? 'border-flame bg-flame/15 text-flame' : throwAnalysis.landmarks?.[landmark.key] ? 'border-up/40 text-up' : 'border-line text-muted'}`}
                    >
                      {landmark.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={throwAnalysis.note ?? ''}
                onChange={(event) => updateThrowAnalysis({ note: event.target.value || undefined })}
                placeholder="Mechanics note: sequencing, front side, base, follow-through…"
                aria-label="Throw mechanics note"
                className={inputClass + ' min-h-20 w-full resize-y'}
              />
              {throwMetrics.timingWarning && <div className="rounded-lg border border-down/40 bg-down/5 p-2 text-xs font-bold text-down">{throwMetrics.timingWarning}</div>}
              <QbMechanicsPanel
                analysis={throwAnalysis}
                currentPlayId={editingId}
                filmLabel={form.filmLabel || sourceLabel || undefined}
                opponent={form.opponent}
                date={form.date}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted">2D angles depend on the Hudl camera view and are not laboratory-grade 3D biomechanics.</span>
                <button type="button" onClick={clearThrowBreakdown} disabled={!throwRecord} className="ml-auto rounded-lg border border-down/40 px-3 py-2 text-xs font-bold text-down disabled:opacity-40">Clear throw analysis</button>
              </div>
              {throwMessage && <div className="text-xs font-bold text-flame">{throwMessage}</div>}
            </div>
          )}

          {canEdit && toolMode === 'track' && (
            <div className="space-y-4 rounded-xl border border-fai/30 bg-fai/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-chalk">11-player auto-follow and formation builder</div>
<div className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted">
Set the pre-snap frame, create one player, arm auto-follow, and tap that player once. FAI follows frame-by-frame until confidence drops. Finish the route, rewind, and repeat until all 11 are mapped.
</div>
                </div>
                <Pill tone={formationLocated.length === 11 ? 'fai' : 'gold'}>{formationLocated.length}/11 located</Pill>
              </div>

              <FootballCvImportPanel
                athletes={roster}
                currentVideoTime={videoTime}
                onImport={({ tracks, formationStartTime: suggestedStart, source, createdWith }) => {
                  stopAutoFollow('idle', undefined, false)
                  setAutoArmed(false)
                  setPending((current) => mergeFootballCvPlayerTracks(current, tracks))
                  const firstTrack = tracks.find(isPlayerTrack)
                  setActiveTrackId(firstTrack?.id)
                  if (firstTrack) {
                    setTrackTeam(firstTrack.trackingTeam ?? 'opponent')
                    setTrackSide(firstTrack.trackingSide ?? 'offense')
                  }
                  if (typeof suggestedStart === 'number') {
                    setFormationStartTime(suggestedStart)
                    seekVideo(suggestedStart)
                  }
                  if (source) {
                    setForm((current) => ({ ...current, filmLabel: current.filmLabel || source }))
                  }
                  setTrackingMessage(
                    `${tracks.length} CV player track${tracks.length === 1 ? '' : 's'} loaded${createdWith ? ` from ${createdWith}` : ''}. Review identities and corrections, then Log Play.`,
                  )
                }}
              />

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <select value={trackTeam} onChange={(event) => setTrackTeam(event.target.value as TrackingTeam)} className={selectClass} aria-label="Formation team">
                  <option value="opponent">Opponent</option>
                  <option value="ours">Our team</option>
                </select>
                <select value={trackSide} onChange={(event) => setTrackSide(event.target.value as PlaySide)} className={selectClass} aria-label="Formation unit">
                  <option value="offense">Offense</option>
                  <option value="defense">Defense</option>
                  <option value="special">Special teams</option>
                </select>
                <button type="button" onClick={() => { setFormationStartTime(videoTime); setTrackingMessage(`Formation start set at ${formatTrackTime(videoTime)}.`) }} className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs font-black text-gold">
                  Set formation start
                </button>
                <button type="button" onClick={() => formationStartTime !== undefined && seekVideo(formationStartTime)} disabled={formationStartTime === undefined} className="rounded-lg border border-line px-3 py-2 text-xs font-black text-chalk disabled:opacity-40">
                  Return to start {formationStartTime !== undefined ? formatTrackTime(formationStartTime) : ''}
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <select
                  value={trackAthleteId}
                  onChange={(event) => setTrackAthleteId(event.target.value)}
                  className={selectClass}
                  aria-label="Tracked roster athlete"
                >
                  <option value="">{trackTeam === 'ours' ? 'Unassigned roster athlete' : 'Opponent / generic player'}</option>
                  {trackTeam === 'ours' && roster.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>{athlete.name}</option>
                  ))}
                </select>
                <input
                  value={trackRole}
                  onChange={(event) => setTrackRole(event.target.value)}
                  placeholder="Position: X, LT, Mike…"
                  className={inputClass}
                  aria-label="Formation position"
                />
                <input
                  value={trackLabel}
                  onChange={(event) => setTrackLabel(event.target.value)}
                  placeholder="Name or jersey (optional)"
                  className={inputClass}
                  aria-label="Player track label"
                />
                <button
                  type="button"
                  onClick={createTrack}
                  disabled={formationTracks.length >= 11}
                  className="rounded-lg bg-fai px-4 py-2 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {formationTracks.length >= 11 ? 'Unit full — 11/11' : `Add player ${formationTracks.length + 1}/11`}
                </button>
              </div>

              {formationTracks.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {formationTracks.map((track) => {
                    const count = trackKeyframes(track.points).length
                    return (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => { stopAutoFollow('ready', undefined, false); setAutoArmed(false); setActiveTrackId(track.id) }}
                        className={`rounded-xl border px-3 py-2 text-left ${activeTrackId === track.id ? 'border-fai bg-panel text-chalk' : 'border-line bg-panel-2/40 text-muted'}`}
                        aria-label={`Select track ${track.label ?? 'player'}`}
                      >
                        <span className="mr-2" style={{ color: track.color }}>●</span>
                        <span className="text-xs font-black">{track.formationRole ? `${track.formationRole} · ` : ''}{track.label ?? 'Tracked player'}</span>
                        <span className="ml-2 text-[10px]">{count} points {track.trackingComplete ? '· saved ✓' : ''}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
                  No players in this team/unit yet. Add player 1 of 11 above.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3">
                <button type="button" onClick={autoArmed ? () => { setAutoArmed(false); setAutoStatus('ready') } : armAutoFollow} disabled={!activeTrack || autoStatus === 'running'} className="rounded-lg border border-fai/50 bg-fai/10 px-3 py-2 text-xs font-black text-fai disabled:opacity-40">
                  {autoArmed ? 'Cancel auto arm' : 'Arm auto-follow'}
                </button>
                <button type="button" onClick={startAutoFollow} disabled={!activeTrack || autoStatus === 'running' || trackKeyframes(activeTrack.points).length === 0} className="rounded-lg border border-up/40 bg-up/10 px-3 py-2 text-xs font-black text-up disabled:opacity-40">▶ Auto follow now</button>
                <button type="button" onClick={() => stopAutoFollow('ready', 'Auto-follow paused.')} disabled={autoStatus !== 'running'} className="rounded-lg border border-down/40 px-3 py-2 text-xs font-black text-down disabled:opacity-40">■ Stop</button>
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel-2/60 px-3 text-[11px] font-black text-muted">
                  <input
                    type="checkbox"
                    checked={showAllTracksDuringFollow}
                    onChange={(event) => setShowAllTracksDuringFollow(event.target.checked)}
                    className="accent-fai"
                  />
                  Show all tracks
                </label>
                {focusedAutoFollow && <Pill tone="fai">Single-target view</Pill>}
                <button type="button" onClick={() => stepFrame(-1)} className="rounded-lg border border-line px-3 py-2 text-xs font-black text-chalk" aria-label="Previous frame">− 1 frame</button>
                <div className="min-w-20 text-center text-sm font-black text-fai nums">{formatTrackTime(videoTime)}</div>
                <button type="button" onClick={() => stepFrame(1)} className="rounded-lg border border-line px-3 py-2 text-xs font-black text-chalk" aria-label="Next frame">+ 1 frame</button>
                <div className="text-[11px] text-muted">
                  {activeTrack
                    ? `Active: ${activeTrack.label ?? 'Tracked player'} · ${trackKeyframes(activeTrack.points).length} confirmed`
                    : 'Select or start a player, then tap the player on the video.'}
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button type="button" onClick={finishActiveRoute} disabled={!activeTrack || !activeStats?.confirmedPoints} className="rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-xs font-black text-gold disabled:opacity-40">Finish &amp; save route</button>
                  <button type="button" onClick={removeCurrentKeyframe} disabled={!activeTrack} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-muted disabled:opacity-40">Remove current point</button>
                  <button type="button" onClick={deleteActiveTrack} disabled={!activeTrack} className="rounded-lg border border-down/40 px-3 py-2 text-xs font-bold text-down disabled:opacity-40">Delete player track</button>
                </div>
              </div>
              {activeTrack && activeStats && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-11" aria-label="Live tracking stats">
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Status</div><div className="text-xs font-black text-fai">{autoStatus}</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Confidence</div><div className="text-xs font-black text-chalk nums">{Math.round((autoStatus === 'running' ? autoConfidence : activeStats.averageConfidence) * 100)}%</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Auto frames</div><div className="text-xs font-black text-chalk nums">{Math.max(autoFrameCount, activeStats.autoFrames)}</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Duration</div><div className="text-xs font-black text-chalk nums">{activeStats.durationSec.toFixed(2)}s</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Screen distance</div><div className="text-xs font-black text-chalk nums">{activeStats.screenDistancePct.toFixed(1)}%</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2" title={activeSpeed?.hasField ? `${activeSpeed.distanceYards} yds over ${activeSpeed.elapsedSec}s` : 'Set the CV field map (4-point homography) to measure real speed'}><div className="text-[9px] uppercase text-muted">Top speed</div><div className={`text-xs font-black nums ${activeSpeed?.hasField ? 'text-up' : 'text-muted'}`}>{activeSpeed?.hasField ? `${activeSpeed.topSpeedMph} mph` : '—'}</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2" title={activeSpeed?.hasField ? 'Average speed across the tracked path' : 'Needs the CV field map'}><div className="text-[9px] uppercase text-muted">Avg speed</div><div className={`text-xs font-black nums ${activeSpeed?.hasField ? 'text-chalk' : 'text-muted'}`}>{activeSpeed?.hasField ? `${activeSpeed.avgSpeedMph} mph` : '—'}</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Corrections</div><div className="text-xs font-black text-chalk nums">{activeStats.manualCorrections}</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Camera shift</div><div className="text-xs font-black text-chalk nums">{(Math.hypot(autoCameraDx, autoCameraDy) * 100).toFixed(1)}%</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Camera zoom</div><div className="text-xs font-black text-chalk nums">{autoCameraScale.toFixed(3)}×</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Motion blur</div><div className="text-xs font-black text-chalk nums">{Math.round(autoBlurLevel * 100)}%</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Player scale</div><div className="text-xs font-black text-chalk nums">{autoPlayerScale.toFixed(2)}×</div></div>
                  <div className="rounded-lg border border-line bg-panel p-2"><div className="text-[9px] uppercase text-muted">Tracking mode</div><div className={`text-xs font-black ${autoMotionCompensated ? 'text-up' : 'text-muted'}`}>{autoMotionCompensated ? 'compensated' : 'local'}</div></div>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2/40 px-3 py-2 text-[11px] font-bold text-muted">
                <span>{completedRoutes}/11 routes finished</span>
                <span className={formationLocated.length === 11 ? 'text-up' : 'text-gold'}>{formationLocated.length === 11 ? 'Formation ready ✓' : `${11 - formationLocated.length} locations remaining`}</span>
              </div>
              {speedLeaders.length > 0 ? (
                <div className="rounded-xl border border-up/25 bg-up/5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-black text-chalk">Player speed &amp; distance</div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted">top mph · yds covered</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {speedLeaders.map((entry, index) => (
                      <div key={entry.track.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] ${entry.track.id === activeTrackId ? 'border-fai/40 bg-fai/5' : 'border-line bg-panel/40'}`}>
                        <span className="w-4 text-center font-black text-muted nums">{index + 1}</span>
                        <span className="flex-1 truncate font-bold text-chalk">{entry.track.label ?? 'Tracked player'}</span>
                        <span className="text-[10px] text-muted nums">avg {entry.speed.avgSpeedMph}</span>
                        <span className="min-w-12 text-right text-[10px] text-muted nums">{entry.speed.distanceYards} yd</span>
                        <span className="min-w-14 text-right font-black text-up nums">{entry.speed.topSpeedMph} mph</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] leading-relaxed text-muted">Speeds are CV-derived from the field map — accurate to the homography you set, not a lab timer.</div>
                </div>
              ) : playerTracks.length > 0 && (
                <div className="rounded-xl border border-line bg-panel-2/30 p-3 text-[11px] leading-relaxed text-muted">
                  <span className="font-black text-chalk">Player speeds need the field map.</span> Click the 4 field points in the CV notebook&apos;s calibration step so tracks carry yard coordinates — then top and average speed appear here. Image tracking alone can&apos;t measure real speed.
                </div>
              )}
              <FormationBoard tracks={formationTracks} atTime={formationStartTime} />
              {hasFieldTracks && <FieldMap tracks={playerTracks} atTime={videoTime} />}
              {fieldHeatmap?.hasField && <FieldHeatmap heatmap={fieldHeatmap} scopeLabel={heatmapScopeLabel} />}
              {trackingMessage && <div className="text-xs font-bold text-gold">{trackingMessage}</div>}
            </div>
          )}

          {canEdit && toolMode === 'draw' && (
            <div className="rounded-xl border border-line bg-panel-2/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Draw</span>
                {(Object.keys(KIND_LABEL) as FilmAnnotationKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setDrawKind(kind)}
                    className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                      drawKind === kind ? 'border-fai text-chalk' : 'border-line text-muted hover:text-chalk'
                    }`}
                    style={drawKind === kind ? { boxShadow: `inset 0 0 0 9999px ${KIND_COLOR[kind]}22` } : undefined}
                  >
                    <span style={{ color: KIND_COLOR[kind] }}>●</span> {KIND_LABEL[kind]}
                  </button>
                ))}
                <select
                  value={drawAthleteId}
                  onChange={(event) => setDrawAthleteId(event.target.value)}
                  className={selectClass + ' ml-auto'}
                >
                  <option value="">Unassigned player…</option>
                  {roster.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>{athlete.name}</option>
                  ))}
                </select>
              </div>
              <div className="mt-2 text-[11px] text-muted">
                Draw on the film to chart a {KIND_LABEL[drawKind].toLowerCase()}. Paths save with the play below.
              </div>
              {pending.some((annotation) => !isThrowAnalysisAnnotation(annotation)) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {pending.filter((annotation) => !isThrowAnalysisAnnotation(annotation)).map((annotation) => {
                    const athlete = roster.find((item) => item.id === annotation.athleteId)
                    return (
                      <span
                        key={annotation.id}
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-[11px]"
                      >
                        <span style={{ color: annotation.color }}>●</span>
                        {KIND_LABEL[annotation.kind]}
                        {athlete ? ` · ${athlete.name.split(' ').slice(-1)[0]}` : ''}
                        <button
                          type="button"
                          onClick={() => setPending((prev) => prev.filter((item) => item.id !== annotation.id))}
                          className="ml-1 text-muted hover:text-down"
                          aria-label="Remove drawing"
                        >
                          ×
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {canEdit ? (
          <Card className="p-5">
            <SectionTitle right={editingId ? <Pill tone="gold">Editing</Pill> : undefined}>
              {editingId ? 'Edit Play' : 'Tag a Play'}
            </SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.opponent ?? ''}
                onChange={(event) => setField('opponent', event.target.value || undefined)}
                placeholder="Opponent"
                className={inputClass + ' col-span-2'}
                list="film-opponents"
              />
              <datalist id="film-opponents">
                {opponents.map((opp) => (
                  <option key={opp} value={opp} />
                ))}
              </datalist>

              <select
                value={form.down ?? ''}
                onChange={(event) => setField('down', numberField(event.target.value))}
                className={selectClass}
              >
                <option value="">Down…</option>
                {[1, 2, 3, 4].map((down) => (
                  <option key={down} value={down}>{down} down</option>
                ))}
              </select>
              <input
                type="number"
                value={form.distance ?? ''}
                onChange={(event) => setField('distance', numberField(event.target.value))}
                placeholder="Distance (yds)"
                className={inputClass}
              />

              <select
                value={form.hash ?? ''}
                onChange={(event) => setField('hash', (event.target.value || undefined) as FilmPlay['hash'])}
                className={selectClass}
              >
                <option value="">Hash…</option>
                <option value="L">Left hash</option>
                <option value="M">Middle</option>
                <option value="R">Right hash</option>
              </select>
              <input
                type="number"
                value={form.yardLine ?? ''}
                onChange={(event) => setField('yardLine', numberField(event.target.value))}
                placeholder="Yard line"
                className={inputClass}
              />

              <select
                value={form.formation ?? ''}
                onChange={(event) => setField('formation', event.target.value || undefined)}
                className={selectClass}
              >
                <option value="">Formation…</option>
                {formationOpts.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
              <select
                value={form.personnel ?? ''}
                onChange={(event) => setField('personnel', event.target.value || undefined)}
                className={selectClass}
              >
                <option value="">Personnel…</option>
                {personnelOpts.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>

              <select
                value={form.call ?? ''}
                onChange={(event) => {
                  const call = (event.target.value || undefined) as PlayCall | undefined
                  setForm((prev) => ({ ...prev, call, concept: undefined }))
                }}
                className={selectClass}
              >
                <option value="">Play type…</option>
                {PLAY_CALLS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
              <select
                value={form.concept ?? ''}
                onChange={(event) => setField('concept', event.target.value || undefined)}
                className={selectClass}
                disabled={conceptOptions.length === 0}
              >
                <option value="">Concept…</option>
                {conceptOptions.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>

              <select
                value={form.ballCarrierId ?? ''}
                onChange={(event) => setField('ballCarrierId', event.target.value || undefined)}
                className={selectClass}
              >
                <option value="">Ball carrier…</option>
                {roster.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>{athlete.name}</option>
                ))}
              </select>
              <input
                type="number"
                value={form.gain ?? ''}
                onChange={(event) => setField('gain', numberField(event.target.value))}
                placeholder="Gain (yds)"
                className={inputClass}
              />

              <input
                type="number"
                value={form.boxCount ?? ''}
                onChange={(event) => setField('boxCount', numberField(event.target.value))}
                placeholder="Box count (defenders)"
                title="Defenders in the box on this snap — feeds the box-count / run advantage number"
                className={inputClass}
              />
              <input
                type="number"
                value={form.hiddenYards ?? ''}
                onChange={(event) => setField('hiddenYards', numberField(event.target.value))}
                placeholder="Hidden yds (+ ours)"
                title="Special teams, penalties, turnover field position. Positive = in our favor. Feeds the hidden-yardage margin."
                className={inputClass}
              />

              <input
                value={form.result ?? ''}
                onChange={(event) => setField('result', event.target.value || undefined)}
                placeholder="Result (TD, INT, …)"
                className={inputClass + ' col-span-2'}
              />
              <input
                value={form.note ?? ''}
                onChange={(event) => setField('note', event.target.value || undefined)}
                placeholder="Note (optional)"
                className={inputClass + ' col-span-2'}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={savePlay}
                className="rounded-lg bg-fai px-5 py-2 text-sm font-bold text-ink"
              >
                {editingId ? 'Save changes' : '+ Log Play'}
              </button>
              {!editingId && recent.length > 0 && (
                <button
                  type="button"
                  onClick={duplicateLastPlay}
                  title="Copy the previous play's context (formation, personnel, call…) into a new play. Shortcut: D"
                  className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-muted hover:text-chalk"
                >
                  Same as last <kbd className="ml-1 rounded border border-line px-1 text-[10px] text-muted">D</kbd>
                </button>
              )}
              {(editingId || pending.length > 0 || form.opponent) && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-muted hover:text-chalk"
                >
                  Clear
                </button>
              )}
              {pending.length > 0 && <Pill tone="fai">{pending.length} drawn</Pill>}
            </div>
          </Card>
        ) : (
          <Card className="p-5 text-sm text-muted">
            Sign in as a coach to break down film and chart plays. The tendency report below is
            live for everyone.
          </Card>
        )}
        {canEdit && (
          <FilmCatalogManager
            catalog={filmCatalog}
            onAdd={addFilmCatalogEntry}
            onRemove={removeFilmCatalogEntry}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Scouting report</span>
        <select
          value={opponentFilter}
          onChange={(event) => setOpponentFilter(event.target.value)}
          className={selectClass}
        >
          <option value="">All opponents</option>
          {opponents.map((opp) => (
            <option key={opp} value={opp}>{opp}</option>
          ))}
        </select>
        {report.totalPlays > 0 && (
          <>
            <button
              type="button"
              onClick={() => downloadReport('csv')}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-xs font-black text-chalk hover:border-fai/40"
            >
              ⬇ Excel (CSV)
            </button>
            <button
              type="button"
              onClick={() => downloadReport('html')}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-xs font-black text-chalk hover:border-fai/40"
            >
              ⬇ Report (HTML / PDF)
            </button>
          </>
        )}
      </div>

      {report.totalPlays === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {selectedFilmPlays.length ? 'Plays are saved, but none have a scrimmage call for this tendency report.' : 'No saved plays for this opponent selection.'}{canEdit ? ' Tag the run/pass call on a play to start the tendency report.' : ''}
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <TendencyTable title="By Down &amp; Distance" groups={report.byDownDistance} />
            <TendencyTable title="By Field Zone" groups={report.byFieldZone} />
          </div>
          <div className="space-y-6">
            <TendencyTable title="By Formation" groups={report.byFormation} />
            <TendencyTable title="By Personnel" groups={report.byPersonnel} />
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <Card className="p-5">
          <SectionTitle>Charted Plays</SectionTitle>
          <div className="space-y-1.5">
            {recent.map((play) => {
              const carrier = roster.find((item) => item.id === play.ballCarrierId)
              const savedThrow = throwAnalysisAnnotation(play.annotations ?? [])?.throwAnalysis
              const savedThrowMetrics = savedThrow ? computeThrowMetrics(savedThrow) : undefined
              return (
                <div
                  key={play.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-panel-2/40 px-3 py-2 text-sm"
                >
                  {play.opponent && <span className="font-bold text-chalk">{play.opponent}</span>}
                  {play.down && (
                    <Pill>{play.down} &amp; {play.distance ?? '?'}</Pill>
                  )}
                  {play.formation && <span className="text-muted">{resolveLabel('formation', play.formation)}</span>}
                  {play.call && <Pill tone={play.call === 'run' ? 'gold' : 'fai'}>{resolveLabel('call', play.call)}</Pill>}
                  {savedThrow?.throwFamily && <Pill tone="gold">🎯 {THROW_FAMILIES.find((item) => item.key === savedThrow.throwFamily)?.label ?? savedThrow.throwFamily}</Pill>}
                  {typeof savedThrowMetrics?.averageBallSpeedMph === 'number' && <span className="text-xs font-black text-flame nums">{savedThrowMetrics.averageBallSpeedMph.toFixed(1)} mph</span>}
                  {play.concept && <span className="text-xs text-muted">{resolveLabel('concept', play.concept)}</span>}
                  {carrier && <span className="text-xs text-muted">· {carrier.name}</span>}
                  {typeof play.gain === 'number' && (
                    <span className={`text-xs font-bold nums ${play.gain >= 0 ? 'text-up' : 'text-down'}`}>
                      {play.gain >= 0 ? '+' : ''}{play.gain}
                    </span>
                  )}
                  {play.annotations && play.annotations.length > 0 && (
                    <Pill tone="fai">✎ {play.annotations.length}</Pill>
                  )}
                  {canEdit && (
                    <div className="ml-auto flex items-center gap-1">
                      {(typeof play.startTimeSec === 'number' || typeof play.videoTimeSec === 'number') && (
                        <button
                          type="button"
                          onClick={() => jumpTo(play)}
                          title="Jump to this play in the source film"
                          className="rounded-md border border-line px-2 py-0.5 text-xs font-bold text-muted hover:border-fai/40 hover:text-chalk"
                        >
                          ▶ {Math.round((play.startTimeSec ?? play.videoTimeSec) as number)}s
                          {typeof play.endTimeSec === 'number' ? `–${Math.round(play.endTimeSec)}s` : ''}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => editPlay(play)}
                        className="rounded-md border border-line px-2 py-0.5 text-xs font-bold text-muted hover:border-fai/40 hover:text-chalk"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFilmPlay(play.id)}
                        className="rounded-md border border-line px-2 py-0.5 text-xs font-bold text-muted hover:border-down/40 hover:text-down"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
