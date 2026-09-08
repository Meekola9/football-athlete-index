import { useLayoutEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore'
import { useAccountAccess } from './hooks/useAccountAccess'
import { roleLabel } from './lib/access'
import { signUpAccount } from './store/accounts'
import Dashboard from './pages/Dashboard'
import Leaderboards from './pages/Leaderboards'
import Athletes from './pages/Athletes'
import DeploymentBoard from './pages/DeploymentBoard'
import Playmakers from './pages/Playmakers'
import FilmRoom from './pages/FilmRoom'
import FilmLibrary from './pages/FilmLibrary'
import Sideline from './pages/Sideline'
import AwarenessQuiz from './pages/AwarenessQuiz'
import PlayerDevelopment from './pages/PlayerDevelopment'
import StatsGuide from './pages/StatsGuide'
import AthleteProfile from './pages/AthleteProfile'
import AthleteEditor from './pages/AthleteEditor'
import SessionEntry from './pages/SessionEntry'
import BulkImport from './pages/BulkImport'
import DataPage from './pages/DataPage'
import TVMode from './pages/TVMode'
import AccountSetup from './pages/AccountSetup'
import MyAthleteAccount from './pages/MyAthleteAccount'
import StaffAccess from './pages/StaffAccess'
import PwaControls, { ConnectivityBadge } from './components/PwaControls'

interface NavItem {
  to: string
  label: string
  icon?: string
  end?: boolean
}

const PUBLIC_NAV: NavItem[] = [
  { to: '/', label: 'Coach Dashboard', end: true },
  { to: '/sideline', label: 'Sideline' },
  { to: '/leaderboards', label: 'Leaderboards' },
  { to: '/athletes', label: 'Athletes' },
  { to: '/playmakers', label: 'Playmakers' },
  { to: '/film', label: 'Film Room' },
  { to: '/film-library', label: 'Player Study Guide' },
  { to: '/development', label: 'Development' },
  { to: '/stats', label: 'Stats Guide' },
]

function Brand() {
  const { teamName, publicTeamName, viewerMode, storageMode, teamRole } = useStore()
  const subtitle = viewerMode
    ? `${publicTeamName ?? 'Team'} · View only`
    : teamName
      ? `${teamName}${teamRole ? ` · ${roleLabel(String(teamRole).toLowerCase() as never)}` : ''}`
      : storageMode === 'cloud'
        ? 'Cloud account'
        : 'On-device mode'

  return (
    <div className="flex items-center gap-2">
      <div className="brand-mark">FAI</div>
      <div className="hidden leading-tight min-[390px]:block">
        <div className="text-sm font-black tracking-tight text-chalk">Football Athlete Index</div>
        <div className="hidden text-[10px] font-semibold text-muted sm:block">{subtitle}</div>
      </div>
    </div>
  )
}

function navForAccount(viewerMode: boolean, role: string | undefined, capabilities: ReturnType<typeof useAccountAccess>['capabilities']): NavItem[] {
  if (viewerMode) return PUBLIC_NAV
  if (role === 'athlete') {
    return [
      { to: '/account/profile', label: 'My Profile', end: true },
      { to: '/quiz', label: 'Awareness Quiz' },
      { to: '/leaderboards', label: 'Rankings' },
      { to: '/film-library', label: 'Player Study Guide' },
      { to: '/development', label: 'Development' },
      { to: '/stats', label: 'Stats Guide' },
    ]
  }

  const nav: NavItem[] = [
    { to: '/', label: 'Coach Dashboard', end: true },
    { to: '/sideline', label: 'Sideline' },
    { to: '/leaderboards', label: 'Leaderboards' },
    { to: '/athletes', label: 'Athletes' },
  ]
  if (capabilities.canManageRoster || capabilities.canManageTesting || role === 'owner' || role === 'admin') nav.push({ to: '/deployment', label: 'Deployment' })
  if (capabilities.canManageAwards || role === 'owner' || role === 'admin') nav.push({ to: '/playmakers', label: 'Playmakers' })
  if (capabilities.canManageFilm || role === 'owner' || role === 'admin') nav.push({ to: '/film', label: 'Film Room' })
  nav.push({ to: '/film-library', label: 'Player Study Guide' }, { to: '/development', label: 'Development' }, { to: '/stats', label: 'Stats Guide' })
  if (capabilities.canManageTesting) nav.push({ to: '/entry', label: 'Enter Testing' })
  if (capabilities.canManageRoster) nav.push({ to: '/import', label: 'Bulk Import' })
  if (capabilities.canManageData) nav.push({ to: '/data', label: 'Data' })
  if (capabilities.canManageStaff) nav.push({ to: '/staff', label: 'Staff' })
  return nav
}

function Header() {
  const { storageMode, viewerMode, signOut } = useStore()
  const access = useAccountAccess()
  const nav = navForAccount(viewerMode, access.role, access.capabilities)

  return (
    <header className="app-header sticky top-0 z-40">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <NavLink to={access.role === 'athlete' ? '/account/profile' : '/'} aria-label="FAI home"><Brand /></NavLink>
        <nav className="nav-strip hidden md:flex">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
          <ConnectivityBadge />
          {access.role !== 'athlete' && <NavLink to="/tv" className="ml-1 rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-bold text-chalk">TV Mode</NavLink>}
          {storageMode === 'cloud' && <button type="button" onClick={() => void signOut()} className="ml-1 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-muted">Sign out</button>}
          {viewerMode && <NavLink to="/login" className="ml-1 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-muted">Sign In</NavLink>}
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <ConnectivityBadge />
          <NavLink to="/film-library" className="grid h-9 min-w-9 place-items-center rounded-lg border border-fai/30 bg-fai/10 px-2 text-[10px] font-black text-fai">STUDY</NavLink>
          <NavLink to={access.role === 'athlete' ? '/account/profile' : '/stats'} className="grid h-9 min-w-9 place-items-center rounded-lg border border-line bg-panel px-2 text-[10px] font-black text-muted">{access.role === 'athlete' ? 'ME' : 'GUIDES'}</NavLink>
          {access.role !== 'athlete' && <NavLink to="/tv" className="grid h-9 min-w-9 place-items-center rounded-lg border border-flame/40 bg-flame/10 px-2 text-xs font-black text-flame">TV</NavLink>}
        </div>
      </div>
    </header>
  )
}

function MobileNavigation({ viewerMode }: { viewerMode: boolean }) {
  const access = useAccountAccess()
  const items: NavItem[] = viewerMode
    ? [
        { to: '/', label: 'Dashboard', icon: 'DB', end: true },
        { to: '/athletes', label: 'Athletes', icon: 'AT' },
        { to: '/leaderboards', label: 'Rankings', icon: 'RK' },
        { to: '/login', label: 'Sign In', icon: 'IN' },
      ]
    : access.role === 'athlete'
      ? [
          { to: '/account/profile', label: 'My Profile', icon: 'ME', end: true },
          { to: '/leaderboards', label: 'Rankings', icon: 'RK' },
          { to: '/development', label: 'Develop', icon: 'DV' },
          { to: '/stats', label: 'Guide', icon: 'GD' },
        ]
      : [
          { to: '/', label: 'Dashboard', icon: 'DB', end: true },
          { to: '/athletes', label: 'Athletes', icon: 'AT' },
          ...(access.capabilities.canManageTesting ? [{ to: '/entry', label: 'Test', icon: 'TE' }] : []),
          { to: '/leaderboards', label: 'Rankings', icon: 'RK' },
          { to: access.capabilities.canManageStaff ? '/staff' : '/data', label: 'More', icon: 'MO' },
        ]

  return (
    <nav className="mobile-dock fixed inset-x-0 bottom-0 z-40 px-1 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Mobile navigation">
      <div className={`mx-auto grid max-w-lg ${items.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-bold transition ${isActive ? 'text-fai' : 'text-muted active:bg-panel-2'}`}>
            <span className="grid h-6 place-items-center text-[10px] font-black tracking-[0.08em] leading-none" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function Loading() {
  return <div className="grid min-h-screen place-items-center text-muted"><div className="animate-pulse text-sm font-semibold uppercase tracking-widest">Loading FAI…</div></div>
}

function LoginScreen() {
  const { signIn, authError, viewerMode } = useStore()
  const [mode, setMode] = useState<'sign-in' | 'create'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string>()
  const [message, setMessage] = useState<string>()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFormError(undefined)
    setMessage(undefined)
    try {
      if (mode === 'create') {
        await signUpAccount(email, password)
        setMessage('Account created. Check your email if confirmation is required, then sign in to claim your athlete profile or accept a staff invitation.')
        setMode('sign-in')
        setBusy(false)
      } else await signIn(email, password)
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : 'Account request failed.')
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="brand-mark">FAI</div>
          <div><h1 className="text-xl font-black text-chalk">{mode === 'create' ? 'Create FAI Account' : 'Sign In to FAI'}</h1><p className="text-sm text-muted">Athletes and staff use their own login</p></div>
        </div>
        <div className="mb-4 grid grid-cols-2 rounded-xl border border-line bg-ink p-1">
          <button type="button" onClick={() => setMode('sign-in')} className={`rounded-lg px-3 py-2 text-xs font-black ${mode === 'sign-in' ? 'bg-fai text-ink' : 'text-muted'}`}>Sign in</button>
          <button type="button" onClick={() => setMode('create')} className={`rounded-lg px-3 py-2 text-xs font-black ${mode === 'create' ? 'bg-fai text-ink' : 'text-muted'}`}>Create account</button>
        </div>
        {(formError || authError || message) && <div className={`mb-4 rounded-xl border p-3 text-sm ${formError || authError ? 'border-down/40 bg-down/5 text-down' : 'border-fai/30 bg-fai/5 text-fai'}`}>{formError || authError || message}</div>}
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted">Email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-chalk outline-none focus:border-fai" /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted">Password</span><input type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-chalk outline-none focus:border-fai" /></label>
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-fai px-5 py-3 font-black text-ink disabled:cursor-wait disabled:opacity-60">{busy ? 'Working…' : mode === 'create' ? 'Create my account' : 'Sign in to FAI'}</button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-muted">Athletes claim an existing roster profile after signing in. Coaches accept an invitation sent by an owner or administrator.</p>
        {viewerMode && <NavLink to="/" className="mt-4 inline-block text-sm font-semibold text-fai hover:underline">← Back to team view</NavLink>}
      </div>
    </div>
  )
}

function PermissionDenied({ message = 'Your FAI account does not have permission to open this section.' }: { message?: string }) {
  const { viewerMode } = useStore()
  return <div className="mx-auto max-w-xl rounded-2xl border border-down/30 bg-panel p-6 text-center"><h1 className="text-xl font-black text-chalk">{viewerMode ? 'Sign in required' : 'Permission required'}</h1><p className="mt-2 text-sm text-muted">{message}</p>{viewerMode && <NavLink to="/login" className="mt-4 inline-block rounded-xl bg-fai px-4 py-2 text-sm font-bold text-ink">Sign in to your account</NavLink>}<NavLink to="/" className="mt-4 inline-block rounded-xl border border-line px-4 py-2 text-sm font-bold text-chalk">Return to FAI</NavLink></div>
}

function PersistentFilmRoute({ active, children }: { active: boolean; children: React.ReactNode }) {
  const scrollTop = useRef(0)
  useLayoutEffect(() => {
    if (active) window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop.current, behavior: 'auto' }))
    else scrollTop.current = window.scrollY
  }, [active])
  return <section hidden={!active} aria-hidden={!active}>{children}</section>
}

export default function App() {
  const { loading, cloudConfigured, signedIn, teamName, viewerMode, storageMode } = useStore()
  const access = useAccountAccess()
  const location = useLocation()
  const isTv = location.pathname.startsWith('/tv')
  const isFilm = location.pathname === '/film'

  if (loading || access.loading) return <Loading />
  const signedOut = cloudConfigured && !signedIn
  if (signedOut && !viewerMode) return <LoginScreen />
  if (signedOut && location.pathname === '/login') return <LoginScreen />
  if (cloudConfigured && signedIn && !teamName) return <AccountSetup />
  if (isTv) {
    if (access.role === 'athlete') return <Navigate to="/account/profile" replace />
    return <Routes><Route path="/tv" element={<TVMode />} /></Routes>
  }

  const role = access.role
  const isAthlete = role === 'athlete'
  const staffOrPublic = !isAthlete
  const ownerOrAdmin = role === 'owner' || role === 'admin'
  const allowed = (condition: boolean, element: React.ReactElement, message?: string) => condition ? element : <PermissionDenied message={message} />

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      <Header />
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <Routes>
          <Route path="/" element={isAthlete ? <Navigate to="/account/profile" replace /> : <Dashboard />} />
          <Route path="/sideline" element={staffOrPublic ? <Sideline /> : <Navigate to="/account/profile" replace />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
          <Route path="/athletes" element={staffOrPublic ? <Athletes /> : <Navigate to="/account/profile" replace />} />
          <Route path="/deployment" element={allowed(!viewerMode && staffOrPublic && (access.capabilities.canManageRoster || access.capabilities.canManageTesting || ownerOrAdmin), <DeploymentBoard />, 'Your coach role does not include deployment planning access.')} />
          <Route path="/playmakers" element={viewerMode ? <Playmakers /> : allowed(access.capabilities.canManageAwards, <Playmakers />, 'Your coach role does not include Awards access.')} />
          <Route path="/film" element={null} />
          <Route path="/film-library" element={<FilmLibrary />} />
          <Route path="/development" element={<PlayerDevelopment />} />
          <Route path="/archetypes" element={<PlayerDevelopment />} />
          <Route path="/badges" element={<PlayerDevelopment />} />
          <Route path="/vertical" element={<PlayerDevelopment />} />
          <Route path="/quiz" element={<AwarenessQuiz />} />
          <Route path="/stats" element={<StatsGuide />} />
          <Route path="/athletes/new" element={allowed(access.capabilities.canManageRoster, <AthleteEditor />)} />
          <Route path="/athletes/:id" element={isAthlete ? <Navigate to="/account/profile" replace /> : <AthleteProfile />} />
          <Route path="/athletes/:id/edit" element={allowed(access.capabilities.canManageRoster, <AthleteEditor />)} />
          <Route path="/entry" element={allowed(access.capabilities.canManageTesting, <SessionEntry />)} />
          <Route path="/import" element={allowed(access.capabilities.canManageRoster, <BulkImport />, 'Your role does not include roster management.')} />
          <Route path="/data" element={allowed(access.capabilities.canManageData, <DataPage />)} />
          <Route path="/staff" element={allowed(ownerOrAdmin, <StaffAccess />, 'Only an owner or administrator can manage accounts, claims, and staff invitations.')} />
          <Route path="/account/setup" element={<AccountSetup />} />
          <Route path="/account/profile" element={allowed(isAthlete, <MyAthleteAccount />, 'Only an approved athlete account has a self-service profile.')} />
          <Route path="/login" element={<Navigate to={isAthlete ? '/account/profile' : '/'} replace />} />
        </Routes>
        <PersistentFilmRoute active={isFilm}>
          {viewerMode ? <FilmRoom /> : allowed(access.capabilities.canManageFilm, <FilmRoom />, 'Your coach role does not include Film grading.')}
        </PersistentFilmRoute>
      </main>
      <footer className="mx-auto hidden max-w-7xl px-4 pb-10 pt-4 text-center text-xs text-muted md:block">FAI — Football Athlete Index · {viewerMode ? 'Live team view · read only' : storageMode === 'cloud' ? 'Secure role-based cloud access with on-device backup' : 'Local-first with on-device backup'}</footer>
      <PwaControls />
      <MobileNavigation viewerMode={viewerMode} />
    </div>
  )
}
