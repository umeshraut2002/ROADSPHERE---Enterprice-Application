import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowUpRight, Bell, Battery, CalendarDays, CarFront,
  Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleHelp,
  Clock3, CreditCard, Download, Gauge, LayoutDashboard, MapPin, Menu,
  MoreHorizontal, Plus, Search, Settings2, Shield, SlidersHorizontal,
  Sparkles, TriangleAlert, Wifi, Wrench, X, Zap,
} from 'lucide-react'
import { evaluateTelemetry, initialActivity, initialVehicles, money, parseTelemetry, projectTelemetryVehicle, weeklyDistance, type Activity as FeedItem, type Vehicle } from './domain'
import { api, type ApiNotification, type ApiVehicle, type TelemetryResponse, type VehicleRegistrationRequest, type VehicleRegistrationResponse } from './api/client'

type Mode = 'Fleet operations' | 'Customer portal'
type View = 'Overview' | 'Vehicles' | 'Trips' | 'Charging' | 'Maintenance' | 'Diagnostics' | 'Billing' | 'Preferences'

const fleetNavigation: { label: View; icon: typeof LayoutDashboard; section: string }[] = [
  { label: 'Overview', icon: LayoutDashboard, section: 'WORKSPACE' },
  { label: 'Vehicles', icon: CarFront, section: 'WORKSPACE' },
  { label: 'Trips', icon: MapPin, section: 'WORKSPACE' },
  { label: 'Charging', icon: Zap, section: 'WORKSPACE' },
  { label: 'Maintenance', icon: Wrench, section: 'WORKSPACE' },
  { label: 'Diagnostics', icon: Activity, section: 'WORKSPACE' },
  { label: 'Billing', icon: CreditCard, section: 'ACCOUNT' },
  { label: 'Preferences', icon: Settings2, section: 'ACCOUNT' },
]

const tripData = [
  { id: 'TR-68109', vehicle: 'Northstar', from: 'Berlin, Mitte', to: 'Potsdam, Zentrum', distance: '24.8 km', duration: '32 min', time: 'Today, 09:31', energy: '5.2 kWh' },
  { id: 'TR-68088', vehicle: 'Saffron', from: 'Munich, Maxvorstadt', to: 'Munich Airport', distance: '36.4 km', duration: '41 min', time: 'Today, 08:54', energy: '7.1 kWh' },
  { id: 'TR-68034', vehicle: 'Willow', from: 'Düsseldorf, Altstadt', to: 'Essen, Rüttenscheid', distance: '31.2 km', duration: '38 min', time: 'Today, 08:15', energy: '6.3 kWh' },
  { id: 'TR-67972', vehicle: 'Cobalt', from: 'Berlin, Kreuzberg', to: 'Berlin, Charlottenburg', distance: '18.6 km', duration: '29 min', time: 'Yesterday, 17:42', energy: '4.4 kWh' },
]

const recentInvoices = [
  { id: 'INV-2026-0425', label: 'Fleet subscription · November', date: 'Nov 01, 2026', amount: 1240, status: 'Due' },
  { id: 'INV-2026-0418', label: 'Fleet subscription · October', date: 'Oct 01, 2026', amount: 1240, status: 'Paid' },
  { id: 'INV-2026-0392', label: 'Charging services · September', date: 'Sep 30, 2026', amount: 386, status: 'Paid' },
  { id: 'INV-2026-0381', label: 'Fleet subscription · September', date: 'Sep 01, 2026', amount: 1240, status: 'Paid' },
]

type DiagnosticEntry = { id: string; title: string; vehicle: string; note: string; level: 'Critical' | 'Attention'; time: string }
type NotificationEntry = { id: string; title: string; description: string; time: string; kind: ApiNotification['kind'] }
const diagnosticItems: DiagnosticEntry[] = [
  { id: 'EV-91842', title: 'Battery temperature elevated', vehicle: 'Juniper · RS-2019', note: 'Cell temperature reached 43 °C. Vehicle is parked safely.', level: 'Critical', time: '09:42' },
  { id: 'EV-91827', title: 'Brake pad wear approaching limit', vehicle: 'Cobalt · RS-2037', note: 'Estimated 1,200 km remaining. Service inspection recommended.', level: 'Attention', time: '08:54' },
  { id: 'EV-91783', title: 'Tire pressure slightly low', vehicle: 'Monarch · RS-2006', note: 'Front left tire at 2.1 bar. Check at next stop.', level: 'Attention', time: 'Yesterday' },
]
const initialNotifications: NotificationEntry[] = [
  { id: 'EV-91842', title: 'Battery temperature elevated', description: 'Juniper · Critical diagnostic', time: '18 min ago', kind: 'alert' },
  { id: 'MT-10873', title: 'Service booking confirmed', description: 'Cobalt · Brake inspection', time: '52 min ago', kind: 'service' },
]

function App() {
  const [mode] = useState<Mode>('Fleet operations')
  const [view, setView] = useState<View>('Overview')
  const [vehicles, setVehicles] = useState(initialVehicles)
  const [activity, setActivity] = useState(initialActivity)
  const [diagnostics, setDiagnostics] = useState(diagnosticItems)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [selected, setSelected] = useState<Vehicle | null>(null)
  const [modal, setModal] = useState<'vehicle' | 'booking' | null>(null)
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All vehicles')
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [bookings, setBookings] = useState(2)
  const [paymentDone, setPaymentDone] = useState(false)
  const [preferences, setPreferences] = useState({ email: true, push: true, weekly: false })
  const [processedTelemetryIds, setProcessedTelemetryIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    let active = true
    api.request<{ items: ApiVehicle[] }>('/v1/vehicles').then(({ items }) => {
      if (!active) return
      setVehicles((current) => {
        const localById = new Map(current.map((vehicle) => [vehicle.id, vehicle]))
        const remoteIds = new Set(items.map((vehicle) => vehicle.id))
        const synchronized = items.map((remote) => {
          const local = localById.get(remote.id) ?? initialVehicles[0]
          const elapsedMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(remote.updatedAt)) / 60_000))
          return { ...local, ...remote, battery: remote.batteryPercent, range: remote.rangeKm, updated: elapsedMinutes < 1 ? 'just now' : `${elapsedMinutes} min ago` }
        })
        return [...synchronized, ...current.filter((vehicle) => !remoteIds.has(vehicle.id))]
      })
    }).catch(() => {
      // The fleet portal retains its clearly labelled local fixtures when the optional API is offline.
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    api.request<{ items: ApiNotification[] }>('/v1/notifications').then(({ items }) => {
      if (!active || items.length === 0) return
      setNotifications(items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        time: new Date(item.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        kind: item.kind,
      })))
    }).catch(() => {
      // Keep the synthetic notification fixtures when the optional API is offline.
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    api.request<{ items: { id: string; status: string }[] }>('/v1/invoices').then(({ items }) => {
      if (active && items.some((invoice) => invoice.id === 'INV-2026-0425' && invoice.status === 'PAID')) setPaymentDone(true)
    }).catch(() => {
      // Billing stays in the local demo state when the optional API is offline.
    })
    return () => { active = false }
  }, [])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }
  const navTo = (next: View) => {
    setView(next)
    setMobileNav(false)
    setQuery('')
  }
  const simulateTelemetry = async () => {
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const vehicleId = 'RS-2048'
    const telemetry = parseTelemetry({ eventId: `EV-${crypto.randomUUID()}`, vehicleId, recordedAt: new Date().toISOString(), batteryPercent: 82, batteryTemperatureC: 39, speedKph: 54, latitude: 52.52, longitude: 13.405, charging: false })
    if (processedTelemetryIds.has(telemetry.eventId)) {
      notify('Duplicate synthetic telemetry event ignored.')
      return
    }
    setProcessedTelemetryIds((ids) => new Set(ids).add(telemetry.eventId))
    const localAlerts = evaluateTelemetry(telemetry)
    let apiResult: TelemetryResponse | null = null
    try {
      apiResult = await api.request<TelemetryResponse>('/v1/telemetry', { method: 'POST', body: JSON.stringify(telemetry) })
    } catch {
      // Keep the demo action usable when the optional local API is not running.
    }
    const alerts = apiResult?.alerts ?? localAlerts
    const event: FeedItem = alerts.length
      ? { id: telemetry.eventId, title: 'Battery temperature elevated', description: `Northstar · ${alerts[0].severity.toLowerCase()} diagnostic`, time: now, kind: 'alert' }
      : { id: telemetry.eventId, title: 'Telemetry heartbeat received', description: 'Northstar · Vehicle status refreshed', time: now, kind: 'trip' }
    setActivity((items) => [event, ...items].slice(0, 5))
    setVehicles((items) => items.map((vehicle) => {
      if (vehicle.id !== vehicleId) return vehicle
      if (!apiResult) return projectTelemetryVehicle(vehicle, telemetry, localAlerts)
      return { ...vehicle, health: apiResult.vehicle.health, status: apiResult.vehicle.status, battery: apiResult.vehicle.batteryPercent, range: apiResult.vehicle.rangeKm, updated: 'just now' }
    }))
    const diagnosticRows = alerts.map((alert) => ({
      id: 'id' in alert ? alert.id : telemetry.eventId,
      title: alert.code === 'BATTERY_TEMPERATURE' ? 'Battery temperature elevated' : 'Battery level low',
      vehicle: `Northstar · ${vehicleId}`,
      note: alert.message,
      level: alert.severity === 'CRITICAL' ? 'Critical' as const : 'Attention' as const,
      time: now,
    }))
    setDiagnostics((items) => [...diagnosticRows, ...items.filter((item) => !item.vehicle.endsWith(`· ${vehicleId}`))].slice(0, 20))
    const newNotifications: NotificationEntry[] = alerts.map((alert) => ({
      id: 'id' in alert ? `NT-${alert.id}` : telemetry.eventId,
      title: alert.code === 'BATTERY_TEMPERATURE' ? 'Battery temperature elevated' : 'Battery level low',
      description: `Northstar · ${alert.message}`,
      time: 'just now',
      kind: 'alert',
    }))
    if (newNotifications.length) setNotifications((items) => [...newNotifications, ...items].slice(0, 10))
    notify(apiResult
      ? `Telemetry accepted by the local API; ${alerts.length} synthetic alert${alerts.length === 1 ? '' : 's'} recorded.`
      : 'Local API unavailable; synthetic telemetry was applied in this browser only.')
  }
  const addVehicle = async (registration: Omit<VehicleRegistrationRequest, 'ownerId'>) => {
    try {
      const result = await api.request<VehicleRegistrationResponse>('/v1/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...registration, ownerId: 'fleet-demo' }),
      })
      const vehicle = vehicleFromApi(result.vehicle)
      setVehicles((items) => [vehicle, ...items.filter((item) => item.id !== vehicle.id)])
      setModal(null)
      notify(result.registryBacked
        ? `${vehicle.name} was registered in the local vehicle registry.`
        : `${vehicle.name} was added to local demo API memory.`)
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      const normalizedPlate = registration.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      if (vehicles.some((item) => item.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === normalizedPlate)) {
        throw new Error('This demo fleet already has a vehicle with that registration.')
      }
      const vehicle = localVehicleFromRegistration(registration)
      setVehicles((items) => [vehicle, ...items])
      setModal(null)
      notify('Local API unavailable; the vehicle was added in this browser only.')
    }
  }
  const addBooking = async (service: string, vehicle: string, date: string) => {
    const selectedVehicle = vehicles.find((item) => item.name === vehicle)
    let apiBooking = false
    let bookingId = ''
    if (selectedVehicle) {
      try {
        const booking = await api.request<{ id: string }>('/v1/bookings', { method: 'POST', body: JSON.stringify({ vehicleId: selectedVehicle.id, serviceType: service, scheduledAt: new Date(`${date}T10:30:00`).toISOString() }) })
        apiBooking = true
        bookingId = booking.id
      } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0
        if (status >= 400 && status < 500) {
          setModal(null)
          notify(typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'The API rejected this booking.')
          return
        }
      }
    }
    setBookings((count) => count + 1)
    const event: FeedItem = { id: `MT-${Math.floor(12000 + Math.random() * 800)}`, title: `${service} booked`, description: `${vehicle} · ${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, time: 'just now', kind: 'service' }
    setActivity((items) => [event, ...items].slice(0, 5))
    setNotifications((items) => [{ id: bookingId || event.id, title: 'Service booking confirmed', description: `${service} · ${vehicle}`, time: 'just now', kind: 'service' as const }, ...items].slice(0, 10))
    setModal(null)
    notify(apiBooking ? 'Booking confirmed by the local API. No service center was contacted.' : 'API unavailable; booking added to the browser-only demo schedule.')
  }
  const simulatePayment = async () => {
    if (paymentDone) return
    let apiCompleted = false
    const attemptId = `PAY-${crypto.randomUUID()}`
    try {
      await api.request('/v1/payments/simulate', { method: 'POST', body: JSON.stringify({ invoiceId: 'INV-2026-0425', paymentAttemptId: attemptId, outcome: 'SUCCESS' }) })
      apiCompleted = true
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0
      if (status >= 400 && status < 500) {
        notify(typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'The API rejected this payment simulation.')
        return
      }
    }
    setPaymentDone(true)
    setNotifications((items) => [{ id: attemptId, title: 'Payment simulation successful', description: 'INV-2026-0425 · EUR 1,240', time: 'just now', kind: 'billing' as const }, ...items].slice(0, 10))
    notify(apiCompleted ? 'Simulated payment recorded by the local API. No bank or payment provider was contacted.' : 'Local API unavailable; payment result was simulated in this browser only.')
  }

  const navGroups = ['WORKSPACE', 'ACCOUNT']
  const visibleVehicles = useMemo(() => {
    const scope = mode === 'Customer portal' ? vehicles.slice(0, 3) : vehicles
    return scope.filter((item) => {
      const matchesQuery = `${item.name} ${item.id} ${item.plate} ${item.model} ${item.location} ${item.driver}`.toLowerCase().includes(query.toLowerCase())
      const matchesFilter = filter === 'All vehicles' || (filter === 'Needs attention' ? item.health !== 'Healthy' : item.status === filter)
      return matchesQuery && matchesFilter
    })
  }, [vehicles, mode, query, filter])

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><span /></div><span className="brand-name">roadsphere</span><span className="brand-period">·</span></div>
        <button className="workspace-select" aria-label="Current workspace"><div className="workspace-avatar">N</div><span className="workspace-copy"><b>Northstar Mobility</b><small>Enterprise workspace</small></span><ChevronDown size={15} /></button>
        <div className="mode-caption">FLEET OPERATIONS</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navGroups.map((group) => <div className="nav-group" key={group}>
            <div className="nav-group-title">{group}</div>
            {fleetNavigation.filter((item) => item.section === group).map(({ label, icon: Icon }) => <button key={label} onClick={() => navTo(label)} className={`nav-link ${view === label ? 'selected' : ''}`} aria-current={view === label ? 'page' : undefined}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Diagnostics' && <span className="nav-count">3</span>}</button>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="plan-card"><div className="plan-label"><Sparkles size={14} /> FLEET PLAN</div><strong>Scale your operations</strong><p>Unlock advanced reporting for your team.</p><button onClick={() => notify('Plan details are available in the learning demo.')}>Explore plans <ChevronRight size={14} /></button></div>
          <button className="profile-row" onClick={() => navTo('Preferences')}><div className="profile-avatar">AM</div><span><b>Alex Morgan</b><small>Fleet administrator</small></span><MoreHorizontal size={18} /></button>
        </div>
      </aside>

      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><strong>{view}</strong></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." aria-label="Search vehicles and records" /><kbd>⌘ K</kbd></label>
            <span className="topbar-divider" />
            <button className="icon-button notification-trigger" aria-label="Notifications" onClick={() => setNotifyOpen((open) => !open)}><Bell size={18} /><i /></button>
            <button className="help-button" onClick={() => notify('Help center: RoadSphere is a synthetic learning demo.')}><CircleHelp size={17} /><span>Help</span></button>
          </div>
          {notifyOpen && <div className="notification-popover"><div className="popover-heading"><strong>Notifications</strong><button onClick={() => setNotifyOpen(false)} aria-label="Close notifications"><X size={16} /></button></div>{notifications.slice(0, 5).map((item) => <div className="notification-item" key={item.id}><span className={`notification-dot ${item.kind === 'alert' ? 'danger' : ''}`} /><div><b>{item.title}</b><small>{item.description} · {item.time}</small></div></div>)}{notifications.length === 0 && <div className="notification-item"><div><small>You are all caught up.</small></div></div>}<button className="popover-footer" onClick={() => { navTo('Diagnostics'); setNotifyOpen(false) }}>View all activity <ChevronRight size={14} /></button></div>}
        </header>

        <div className="page-content">
          <div className="demo-banner"><span className="demo-pulse" /> DEMO ENVIRONMENT <span className="demo-separator">/</span> Synthetic data · local API state resets when it restarts <button onClick={() => notify('RoadSphere demo uses synthetic vehicles, locations and EUR prices. No real data or payments.')}>About demo</button></div>
          {view === 'Overview' && <Overview mode={mode} vehicles={vehicles} activity={activity} bookings={bookings} onNavigate={navTo} onSelect={setSelected} onTelemetry={simulateTelemetry} onCreate={() => setModal(mode === 'Customer portal' ? 'vehicle' : 'booking')} />}
          {view === 'Vehicles' && <VehiclesPage mode={mode} vehicles={visibleVehicles} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onSelect={setSelected} onAdd={() => setModal('vehicle')} />}
          {view === 'Trips' && <TripsPage query={query} onSelectVehicle={(name) => setSelected(vehicles.find((vehicle) => vehicle.name === name) ?? null)} />}
          {view === 'Charging' && <ChargingPage onBook={() => setModal('booking')} notify={notify} />}
          {view === 'Maintenance' && <MaintenancePage bookings={bookings} onBook={() => setModal('booking')} />}
          {view === 'Diagnostics' && <DiagnosticsPage items={diagnostics} onSelect={(id) => setSelected(vehicles.find((vehicle) => vehicle.id === id) ?? null)} />}
          {view === 'Billing' && <BillingPage paymentDone={paymentDone} onPayment={simulatePayment} />}
          {view === 'Preferences' && <PreferencesPage preferences={preferences} setPreferences={setPreferences} notify={notify} />}
          <footer className="page-footer"><span>© 2026 RoadSphere Mobility Systems</span><span><i /> All systems operational <span className="footer-sep">·</span> Demo build 0.1.0</span></footer>
        </div>
      </main>

      {selected && <VehicleDialog vehicle={selected} onClose={() => setSelected(null)} onNotify={notify} />}
      {modal === 'vehicle' && <AddVehicleDialog onClose={() => setModal(null)} onAdd={addVehicle} />}
      {modal === 'booking' && <BookingDialog vehicles={vehicles} onClose={() => setModal(null)} onBook={addBooking} />}
      {toast && <div className="toast" role="status"><CircleCheck size={17} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss message"><X size={15} /></button></div>}
    </div>
  )
}

export default App

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>
}

function Button({ children, variant = 'primary', onClick, icon }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'quiet'; onClick: () => void; icon?: ReactNode }) {
  return <button className={`button button-${variant}`} onClick={onClick}>{icon}{children}</button>
}

function Overview({ mode, vehicles, activity, bookings, onNavigate, onSelect, onTelemetry, onCreate }: { mode: Mode; vehicles: Vehicle[]; activity: FeedItem[]; bookings: number; onNavigate: (view: View) => void; onSelect: (vehicle: Vehicle) => void; onTelemetry: () => void; onCreate: () => void }) {
  const healthy = vehicles.filter((vehicle) => vehicle.health === 'Healthy').length
  const needsAttention = vehicles.filter((vehicle) => vehicle.health !== 'Healthy').length
  const active = vehicles.filter((vehicle) => vehicle.status === 'Driving' || vehicle.status === 'Charging').length
  const title = mode === 'Fleet operations' ? 'Good morning, Alex' : 'Your mobility, at a glance'
  const description = mode === 'Fleet operations' ? 'Here’s what’s happening across your fleet today.' : 'Everything you need to keep moving, in one place.'
  return <>
    <PageHeading eyebrow={mode === 'Fleet operations' ? 'MONDAY, OCTOBER 19, 2026' : 'CUSTOMER OVERVIEW'} title={title} description={description} action={<><Button variant="secondary" icon={<Activity size={16} />} onClick={onTelemetry}>Simulate telemetry</Button><Button onClick={onCreate} icon={<Plus size={16} />}>{mode === 'Fleet operations' ? 'Schedule service' : 'Add vehicle'}</Button></>} />
    <div className="metric-grid">
      <MetricCard title={mode === 'Fleet operations' ? 'Total vehicles' : 'My vehicles'} value={`${vehicles.length}`} foot={<><span className="trend-positive"><ArrowUpRight size={13} /> 8.2%</span><span>vs last month</span></>} icon={<CarFront size={18} />} accent="blue" />
      <MetricCard title="Active now" value={`${active}`} foot={<><span className="trend-positive"><ArrowUpRight size={13} /> 12.5%</span><span>vs last week</span></>} icon={<Wifi size={17} />} accent="green" />
      <MetricCard title="Fleet health" value={`${Math.round((healthy / Math.max(vehicles.length, 1)) * 100)}%`} foot={<><span className="metric-dot green-dot" /><span>{healthy} vehicles in good condition</span></>} icon={<Shield size={17} />} accent="purple" />
      <MetricCard title="Needs attention" value={`${needsAttention}`} foot={<><span className={needsAttention ? 'trend-warning' : 'trend-positive'}>{needsAttention ? 'Review suggested' : 'All clear'}</span><span> · {bookings} open bookings</span></>} icon={<TriangleAlert size={17} />} accent="amber" />
    </div>
    <div className="dashboard-grid">
      <section className="panel utilization-panel">
        <div className="panel-head"><div><h2>Fleet utilization</h2><p>Distance driven across your fleet</p></div><button className="select-control" onClick={() => onNavigate('Trips')}>This week <ChevronDown size={14} /></button></div>
        <div className="chart-summary"><strong>1,057 <small>km</small></strong><span className="chart-change"><ArrowUpRight size={14} /> 12.8% <small>vs last week</small></span></div>
        <div className="bar-chart" role="img" aria-label="Weekly fleet distance chart. Monday 128 kilometers, Tuesday 176, Wednesday 144, Thursday 211, Friday 182, Saturday 97, Sunday 119.">
          <div className="chart-guides"><span>240 km</span><span>180 km</span><span>120 km</span><span>60 km</span><span>0 km</span></div>
          <div className="chart-bars">{weeklyDistance.map(({ day, distance }) => <div className="bar-column" key={day}><div className="bar-value">{distance}</div><div className={`bar-track ${day === 'Thu' ? 'bar-highlight' : ''}`}><i style={{ height: `${(distance / 240) * 100}%` }} /></div><span>{day}</span></div>)}</div>
        </div>
        <div className="chart-legend"><span><i /> Distance (km)</span><button onClick={() => onNavigate('Trips')}>View trip reports <ChevronRight size={14} /></button></div>
      </section>
      <section className="panel map-panel">
        <div className="panel-head"><div><h2>Live fleet map</h2><p>Vehicle positions · Germany</p></div><button className="more-button" onClick={() => onNavigate('Vehicles')} aria-label="See all vehicles"><MoreHorizontal size={18} /></button></div>
        <div className="map-visual" role="img" aria-label="Illustrative synthetic vehicle positions around Berlin and Germany">
          <div className="map-water water-one" /><div className="map-water water-two" />
          <div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" /><div className="map-road road-four" />
          <span className="map-city city-berlin">BERLIN</span><span className="map-city city-hamburg">HAMBURG</span><span className="map-city city-munich">MÜNCHEN</span><span className="map-city city-frankfurt">FRANKFURT</span><span className="map-city city-leipzig">LEIPZIG</span>
          <button className="map-pin pin-berlin" aria-label="Open Northstar in Berlin" onClick={() => onSelect(vehicles[0])}><CarFront size={14} /></button><button className="map-pin pin-hamburg" aria-label="Open Atlas in Hamburg" onClick={() => onSelect(vehicles[2] ?? vehicles[0])}><CarFront size={14} /></button><button className="map-pin pin-munich" aria-label="Open Saffron in Munich" onClick={() => onSelect(vehicles.find((item) => item.name === 'Saffron') ?? vehicles[0])}><CarFront size={14} /></button><button className="map-pin pin-frankfurt" aria-label="Open Juniper in Frankfurt" onClick={() => onSelect(vehicles.find((item) => item.name === 'Juniper') ?? vehicles[0])}><TriangleAlert size={13} /></button>
          <div className="map-center-label"><span /> Germany · Demo locations</div>
        </div>
        <div className="map-foot"><span><i className="map-key key-active" /> Active <b>{active}</b></span><span><i className="map-key key-parked" /> Parked <b>{vehicles.length - active}</b></span><button onClick={() => onNavigate('Vehicles')}>View fleet <ChevronRight size={14} /></button></div>
      </section>
    </div>
    <div className="lower-grid">
      <section className="panel vehicle-panel"><div className="panel-head"><div><h2>Vehicles</h2><p>Latest status across your fleet</p></div><button className="text-link" onClick={() => onNavigate('Vehicles')}>View all <ChevronRight size={14} /></button></div>
        <div className="compact-vehicles">{vehicles.slice(0, 4).map((vehicle) => <button className="compact-vehicle" key={vehicle.id} onClick={() => onSelect(vehicle)}><VehicleAvatar vehicle={vehicle} /><span className="compact-vehicle-name"><b>{vehicle.name}</b><small>{vehicle.model.split(' · ')[0]} <span>·</span> {vehicle.plate}</small></span><span className="compact-location"><MapPin size={13} />{vehicle.location.split(',')[0]}</span><StatusPill status={vehicle.health} /><span className="compact-battery"><Battery size={15} /><b>{vehicle.battery}%</b></span><ChevronRight size={15} className="row-chevron" /></button>)}</div>
      </section>
      <section className="panel activity-panel"><div className="panel-head"><div><h2>Recent activity</h2><p>Latest events from your fleet</p></div><button className="more-button" onClick={() => onNavigate('Diagnostics')} aria-label="View more activity"><MoreHorizontal size={18} /></button></div>
        <div className="activity-list">{activity.map((item) => <ActivityRow item={item} key={item.id} />)}</div><button className="activity-link" onClick={() => onNavigate('Diagnostics')}>View activity log <ChevronRight size={14} /></button>
      </section>
    </div>
    <div className="integration-strip"><div className="integration-icon"><Gauge size={18} /></div><div><strong>Keep your fleet running smoothly</strong><p>Get ahead of maintenance with predictive vehicle health insights.</p></div><button onClick={() => onNavigate('Maintenance')}>Explore maintenance <ChevronRight size={14} /></button></div>
  </>
}

function MetricCard({ title, value, foot, icon, accent }: { title: string; value: string; foot: React.ReactNode; icon: React.ReactNode; accent: string }) {
  return <section className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${accent}`}>{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></section>
}

function VehicleAvatar({ vehicle }: { vehicle: Vehicle }) { return <span className="vehicle-avatar" style={{ '--car-color': vehicle.color } as CSSProperties}><CarFront size={19} /></span> }

function StatusPill({ status }: { status: Vehicle['health'] }) { return <span className={`status-pill ${status.toLowerCase()}`}><i />{status}</span> }

function ActivityRow({ item }: { item: FeedItem }) {
  const icon = item.kind === 'alert' ? <TriangleAlert size={15} /> : item.kind === 'charge' ? <Zap size={15} /> : item.kind === 'service' ? <Wrench size={15} /> : <MapPin size={15} />
  return <div className="activity-row"><span className={`activity-icon ${item.kind}`}>{icon}</span><div className="activity-copy"><b>{item.title}</b><small>{item.description}</small></div><time>{item.time}</time></div>
}

function VehiclesPage({ mode, vehicles, query, setQuery, filter, setFilter, onSelect, onAdd }: { mode: Mode; vehicles: Vehicle[]; query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void; onSelect: (vehicle: Vehicle) => void; onAdd: () => void }) {
  return <><PageHeading eyebrow={mode === 'Fleet operations' ? 'FLEET MANAGEMENT' : 'YOUR GARAGE'} title="Vehicles" description={mode === 'Fleet operations' ? 'Monitor vehicle status, health, and activity across your fleet.' : 'Manage your connected vehicles and check their latest status.'} action={<Button onClick={onAdd} icon={<Plus size={16} />}>Add vehicle</Button>} />
    <div className="vehicle-summary-row"><div><b>{vehicles.length}</b><span> vehicles shown</span></div><div className="summary-health"><span><i className="health-dot ok" />Healthy <b>{vehicles.filter((v) => v.health === 'Healthy').length}</b></span><span><i className="health-dot warn" />Needs attention <b>{vehicles.filter((v) => v.health !== 'Healthy').length}</b></span></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><label className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, model, plate..." /></label><label className="filter-select"><SlidersHorizontal size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter vehicles"><option>All vehicles</option><option>Needs attention</option><option>Driving</option><option>Parked</option><option>Charging</option><option>Offline</option></select><ChevronDown size={14} /></label><button className="button button-secondary export-button" onClick={() => downloadVehicles(vehicles)}><Download size={15} /> Export</button></div>
      {vehicles.length ? <div className="table-scroll"><table><thead><tr><th>VEHICLE</th><th>HEALTH</th><th>STATUS</th><th>LOCATION</th><th>BATTERY</th><th>LAST UPDATE</th><th aria-label="Row actions" /></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.id} onClick={() => onSelect(vehicle)}><td><div className="table-vehicle"><VehicleAvatar vehicle={vehicle} /><span><b>{vehicle.name}</b><small>{vehicle.model} · {vehicle.plate}</small></span></div></td><td><StatusPill status={vehicle.health} /></td><td><span className={`operational-status ${vehicle.status.toLowerCase()}`}><i />{vehicle.status}</span></td><td><span className="table-location"><MapPin size={14} />{vehicle.location}</span></td><td><div className="battery-cell"><span className="battery-track"><i className={vehicle.battery < 25 ? 'low' : ''} style={{ width: `${vehicle.battery}%` }} /></span><b>{vehicle.battery}%</b></div></td><td className="muted-cell">{vehicle.updated}</td><td><button className="row-more" aria-label={`Open ${vehicle.name} details`} onClick={(event) => { event.stopPropagation(); onSelect(vehicle) }}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><Search size={22} /><strong>No vehicles found</strong><p>Try a different search or filter.</p><button className="text-link" onClick={() => { setQuery(''); setFilter('All vehicles') }}>Clear filters</button></div>}
      <div className="table-foot"><span>Showing <b>{vehicles.length ? 1 : 0}–{vehicles.length}</b> of <b>{vehicles.length}</b> vehicles</span><div><button disabled aria-label="Previous page"><ChevronRight size={15} className="flip-icon" /></button><button disabled aria-label="Next page"><ChevronRight size={15} /></button></div></div>
    </section>
  </>
}

function downloadVehicles(vehicles: Vehicle[]) {
  const rows = [['ID', 'Name', 'Model', 'Plate', 'Health', 'Status', 'Location', 'Battery'], ...vehicles.map(({ id, name, model, plate, health, status, location, battery }) => [id, name, model, plate, health, status, location, `${battery}%`])]
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = 'roadsphere-vehicles-demo.csv'; link.click(); URL.revokeObjectURL(url)
}

function TripsPage({ query, onSelectVehicle }: { query: string; onSelectVehicle: (name: string) => void }) {
  const trips = tripData.filter((trip) => `${trip.id} ${trip.vehicle} ${trip.from} ${trip.to}`.toLowerCase().includes(query.toLowerCase()))
  return <><PageHeading eyebrow="FLEET ACTIVITY" title="Trip history" description="Review completed journeys, distance, and energy use." action={<Button variant="secondary" onClick={() => downloadTrips(trips)} icon={<Download size={16} />}>Export trips</Button>} /><div className="trip-metrics"><MetricCard title="Trips this week" value="184" foot={<><span className="trend-positive"><ArrowUpRight size={13} /> 6.4%</span><span>vs last week</span></>} icon={<MapPin size={17} />} accent="blue" /><MetricCard title="Distance covered" value="2,840 km" foot={<><span>Across 8 vehicles</span></>} icon={<RouteIcon />} accent="purple" /><MetricCard title="Avg. energy use" value="18.4 kWh" foot={<><span>per 100 km</span></>} icon={<Zap size={17} />} accent="green" /></div><section className="panel table-panel"><div className="panel-head inner-panel-head"><div><h2>Recent trips</h2><p>Most recent completed journeys</p></div><span className="demo-tag">SYNTHETIC SAMPLE</span></div><div className="table-scroll"><table><thead><tr><th>TRIP</th><th>VEHICLE</th><th>ROUTE</th><th>DISTANCE</th><th>ENERGY</th><th>STARTED</th></tr></thead><tbody>{trips.map((trip) => <tr key={trip.id}><td className="id-cell">{trip.id}</td><td><button className="inline-vehicle" onClick={() => onSelectVehicle(trip.vehicle)}>{trip.vehicle}</button></td><td><span className="route-cell"><span>{trip.from}</span><ChevronRight size={13} /><span>{trip.to}</span></span></td><td>{trip.distance}<small className="sub-cell">{trip.duration}</small></td><td>{trip.energy}</td><td className="muted-cell">{trip.time}</td></tr>)}</tbody></table></div>{!trips.length && <div className="empty-state"><strong>No matching trips</strong><p>Try another search term.</p></div>}</section></>
}
function RouteIcon() { return <Activity size={17} /> }
function downloadTrips(trips: typeof tripData) { const rows = [['Trip', 'Vehicle', 'From', 'To', 'Distance', 'Duration', 'Energy', 'Time'], ...trips.map((trip) => [trip.id, trip.vehicle, trip.from, trip.to, trip.distance, trip.duration, trip.energy, trip.time])]; const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'roadsphere-trips-demo.csv'; anchor.click(); URL.revokeObjectURL(url) }

function ChargingPage({ onBook, notify }: { onBook: () => void; notify: (message: string) => void }) {
  const [filter, setFilter] = useState('All stations')
  const stations = [
    { name: 'Mitte Supercharger', operator: 'RoadSphere Charge', location: 'Berlin, Mitte', distance: '1.2 km', available: 6, total: 8, power: '250 kW', price: '€0.49 / kWh' },
    { name: 'Kreuzberg City Hub', operator: 'Ionity', location: 'Berlin, Kreuzberg', distance: '2.8 km', available: 3, total: 6, power: '150 kW', price: '€0.59 / kWh' },
    { name: 'Hauptbahnhof West', operator: 'RoadSphere Charge', location: 'Berlin, Moabit', distance: '4.1 km', available: 0, total: 4, power: '100 kW', price: '€0.45 / kWh' },
  ]
  const filtered = filter === 'Available now' ? stations.filter((station) => station.available > 0) : stations
  return <><PageHeading eyebrow="ELECTRIC MOBILITY" title="Charging" description="Find a nearby station or review simulated charging activity." action={<Button onClick={onBook} icon={<Plus size={16} />}>Book a charge</Button>} /><div className="trip-metrics"><MetricCard title="Sessions this month" value="42" foot={<><span className="trend-positive"><ArrowUpRight size={13} /> 14.2%</span><span>vs last month</span></>} icon={<Zap size={17} />} accent="blue" /><MetricCard title="Energy delivered" value="1,284 kWh" foot={<><span>Across your fleet</span></>} icon={<Battery size={17} />} accent="green" /><MetricCard title="Charging spend" value={money(386)} foot={<><span>Illustrative amount · EUR</span></>} icon={<CreditCard size={17} />} accent="purple" /></div><div className="content-columns"><section className="panel stations-panel"><div className="panel-head"><div><h2>Nearby stations</h2><p>Synthetic availability · Berlin</p></div><label className="filter-select"><SlidersHorizontal size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter stations"><option>All stations</option><option>Available now</option></select><ChevronDown size={14} /></label></div><div className="station-list">{filtered.map((station) => <div className="station-card" key={station.name}><div className="station-icon"><Zap size={19} /></div><div className="station-info"><b>{station.name}</b><small>{station.operator} <span>·</span> {station.location}</small><div className="station-tags"><span>{station.power}</span><span>{station.price}</span></div></div><div className="station-availability"><strong className={station.available ? '' : 'unavailable'}>{station.available}/{station.total}</strong><small>connectors free</small></div><button className="button button-secondary" disabled={!station.available} onClick={() => notify(`${station.name} selected. Booking confirms only a demo reservation.`)}>Details</button></div>)}{!filtered.length && <div className="empty-state"><strong>No available stations</strong><p>Try all stations to see the current demo inventory.</p></div>}</div></section><section className="panel sessions-panel"><div className="panel-head"><div><h2>Recent sessions</h2><p>Illustrative charging history</p></div></div><div className="session-row"><div className="session-symbol"><Zap size={16} /></div><div><b>Atlas</b><small>Today · 09:22 · Mitte Supercharger</small></div><strong>+42.8 kWh</strong></div><div className="session-row"><div className="session-symbol"><Zap size={16} /></div><div><b>Northstar</b><small>Yesterday · 18:42 · Kreuzberg City Hub</small></div><strong>+31.2 kWh</strong></div><div className="session-row"><div className="session-symbol"><Zap size={16} /></div><div><b>Cobalt</b><small>Oct 15 · 11:06 · Mitte Supercharger</small></div><strong>+28.4 kWh</strong></div><div className="session-note"><CircleHelp size={15} /> Station availability and session amounts are synthetic demo data.</div></section></div></>
}

function MaintenancePage({ bookings, onBook }: { bookings: number; onBook: () => void }) {
  return <><PageHeading eyebrow="VEHICLE CARE" title="Maintenance" description="Plan service visits and keep vehicle health on track." action={<Button onClick={onBook} icon={<CalendarDays size={16} />}>Schedule service</Button>} /><div className="trip-metrics"><MetricCard title="Open bookings" value={`${bookings}`} foot={<><span>Across fleet</span></>} icon={<CalendarDays size={17} />} accent="blue" /><MetricCard title="Service due soon" value="2 vehicles" foot={<><span className="trend-warning">Within 30 days</span></>} icon={<Wrench size={17} />} accent="amber" /><MetricCard title="Completed this month" value="12" foot={<><span className="trend-positive"><ArrowUpRight size={13} /> 3 more</span><span>than September</span></>} icon={<CircleCheck size={17} />} accent="green" /></div><section className="panel maintenance-panel"><div className="panel-head inner-panel-head"><div><h2>Upcoming service</h2><p>Scheduled maintenance appointments</p></div><span className="demo-tag">DEMO SCHEDULE</span></div><div className="maintenance-list"><MaintenanceRow date="22" month="OCT" name="Brake system inspection" vehicle="Cobalt · RS-2037" location="Berlin Autohaus Mitte" time="10:30" status="Confirmed" /><MaintenanceRow date="24" month="OCT" name="Battery health check" vehicle="Juniper · RS-2019" location="Frankfurt EV Service Center" time="14:00" status="Needs confirmation" /><MaintenanceRow date="29" month="OCT" name="Routine annual service" vehicle="Monarch · RS-2006" location="Stuttgart Mobility Hub" time="09:15" status="Confirmed" /></div></section><div className="maintenance-tip"><div><Sparkles size={18} /><strong>Stay ahead of service needs</strong></div><p>Use vehicle diagnostics to spot emerging issues before they interrupt a journey.</p><span>Illustrative training data · Not a real vehicle inspection</span></div></>
}
function MaintenanceRow({ date, month, name, vehicle, location, time, status }: { date: string; month: string; name: string; vehicle: string; location: string; time: string; status: string }) { return <div className="maintenance-row"><div className="calendar-date"><b>{date}</b><small>{month}</small></div><div className="maintenance-copy"><b>{name}</b><small>{vehicle} <span>·</span> {location}</small></div><span className="maintenance-time"><Clock3 size={14} />{time}</span><span className={`booking-status ${status === 'Confirmed' ? 'confirmed' : 'pending'}`}><i />{status}</span><button className="row-more" aria-label={`More options for ${name}`}><MoreHorizontal size={17} /></button></div> }

function DiagnosticsPage({ items, onSelect }: { items: DiagnosticEntry[]; onSelect: (id: string) => void }) {
  const [severity, setSeverity] = useState('All severity')
  const rows = items.filter((item) => severity === 'All severity' || item.level === severity)
  const criticalCount = items.filter((item) => item.level === 'Critical').length
  const attentionCount = items.filter((item) => item.level === 'Attention').length
  return <><PageHeading eyebrow="VEHICLE HEALTH" title="Diagnostics" description="Triage synthetic vehicle health events and recommended follow-up." action={<label className="filter-select"><SlidersHorizontal size={15} /><select value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Filter diagnostic severity"><option>All severity</option><option>Critical</option><option>Attention</option></select><ChevronDown size={14} /></label>} /><div className="diagnostic-summary"><div className="diagnostic-count critical-count"><span><TriangleAlert size={17} /> Critical</span><strong>{criticalCount}</strong></div><div className="diagnostic-count attention-count"><span><CircleAlert size={17} /> Needs attention</span><strong>{attentionCount}</strong></div><div className="diagnostic-count resolved-count"><span><CircleCheck size={17} /> Resolved today</span><strong>4</strong></div></div><section className="panel diagnostics-panel"><div className="panel-head inner-panel-head"><div><h2>Active diagnostic alerts</h2><p>Most recent issues across the fleet</p></div><span className="demo-tag">SIMULATED EVENTS</span></div><div className="diagnostic-list">{rows.map((item) => <article className="diagnostic-card" key={item.id}><span className={`diagnostic-mark ${item.level.toLowerCase()}`}>{item.level === 'Critical' ? <TriangleAlert size={18} /> : <CircleAlert size={18} />}</span><div className="diagnostic-copy"><div className="diagnostic-title"><b>{item.title}</b><span className={`severity-tag ${item.level.toLowerCase()}`}>{item.level}</span></div><span>{item.vehicle} <i>·</i> {item.id}</span><p>{item.note}</p></div><time>{item.time}</time><button className="button button-secondary" onClick={() => onSelect(item.vehicle.split(' · ').at(-1) ?? '')}>Investigate</button></article>)}{!rows.length && <div className="empty-state"><strong>No alerts match this filter</strong><p>Choose another severity to see the synthetic event sample.</p></div>}</div></section></>
}

function BillingPage({ paymentDone, onPayment }: { paymentDone: boolean; onPayment: () => void }) {
  return <><PageHeading eyebrow="ACCOUNT & PAYMENTS" title="Billing" description="Review illustrative invoices and subscription charges." action={<Button variant="secondary" onClick={() => window.print()} icon={<Download size={16} />}>Download statement</Button>} /><div className="billing-summary"><section className="balance-card"><div><span>Next estimated invoice</span><span className="balance-icon"><CreditCard size={18} /></span></div><strong>{money(1240)}</strong><p>Due November 01, 2026 <i /> Fleet plan · 8 vehicles</p><div className="balance-actions"><Button onClick={onPayment} icon={<Check size={15} />}>{paymentDone ? 'Payment simulated' : 'Simulate payment'}</Button><span>Demo payment only</span></div></section><section className="panel plan-detail"><div className="plan-detail-head"><span className="plan-detail-icon"><Sparkles size={18} /></span><span><small>ACTIVE SUBSCRIPTION</small><b>Fleet Scale</b></span><span className="active-badge"><i /> Active</span></div><div className="plan-features"><span><Check size={14} /> Fleet dashboard</span><span><Check size={14} /> Predictive alerts</span><span><Check size={14} /> Priority support</span></div><div className="plan-price"><strong>€155</strong><span>per vehicle / month</span></div></section></div><section className="panel invoices-panel"><div className="panel-head inner-panel-head"><div><h2>Recent invoices</h2><p>Billing history and simulated payment records</p></div><button className="text-link" onClick={() => window.print()}>Export history <Download size={14} /></button></div><div className="table-scroll"><table><thead><tr><th>INVOICE</th><th>DESCRIPTION</th><th>DATE</th><th>AMOUNT</th><th>STATUS</th><th /></tr></thead><tbody>{recentInvoices.map((invoice) => { const status = invoice.id === 'INV-2026-0425' && paymentDone ? 'Paid' : invoice.status; return <tr key={invoice.id}><td className="id-cell">{invoice.id}</td><td>{invoice.label}</td><td className="muted-cell">{invoice.date}</td><td>{money(invoice.amount)}</td><td><span className={`booking-status ${status === 'Paid' ? 'confirmed' : 'pending'}`}><i />{status}</span></td><td><button className="row-more" aria-label={`Download ${invoice.id}`} onClick={() => window.print()}><Download size={15} /></button></td></tr> })}</tbody></table></div></section><p className="billing-disclaimer"><CircleHelp size={15} /> All charges are illustrative EUR amounts. The payment simulator never contacts a bank or payment network.</p></>
}

function PreferencesPage({ preferences, setPreferences, notify }: { preferences: { email: boolean; push: boolean; weekly: boolean }; setPreferences: (value: { email: boolean; push: boolean; weekly: boolean }) => void; notify: (message: string) => void }) {
  const toggle = (key: keyof typeof preferences) => { setPreferences({ ...preferences, [key]: !preferences[key] }); notify('Preference updated in this browser session.') }
  return <><PageHeading eyebrow="ACCOUNT SETTINGS" title="Preferences" description="Choose how RoadSphere keeps you informed." action={<Button variant="secondary" onClick={() => notify('Preferences are already saved for this demo session.')} icon={<Check size={15} />}>Save changes</Button>} /><div className="settings-layout"><section className="panel settings-panel"><div className="panel-head inner-panel-head"><div><h2>Notifications</h2><p>Manage the updates you receive</p></div></div><PreferenceToggle title="Vehicle health alerts" description="Get notified when a vehicle needs attention." checked={preferences.push} onChange={() => toggle('push')} /><PreferenceToggle title="Booking confirmations" description="Receive email updates about service bookings." checked={preferences.email} onChange={() => toggle('email')} /><PreferenceToggle title="Weekly fleet summary" description="A Monday digest of trips, charging, and vehicle health." checked={preferences.weekly} onChange={() => toggle('weekly')} /></section><section className="panel account-panel"><div className="panel-head inner-panel-head"><div><h2>Account profile</h2><p>Demo workspace details</p></div></div><div className="account-person"><div className="profile-avatar large">AM</div><span><b>Alex Morgan</b><small>alex.morgan@example.test</small></span></div><div className="account-field"><span>Role</span><strong>Fleet administrator</strong></div><div className="account-field"><span>Workspace</span><strong>Northstar Mobility</strong></div><div className="account-field"><span>Locale</span><strong>English (UK)</strong></div><p className="account-note">Synthetic profile for local demonstration. No real account is connected.</p></section></div></>
}
function PreferenceToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: () => void }) { return <div className="preference-row"><div><b>{title}</b><small>{description}</small></div><button className={`toggle ${checked ? 'checked' : ''}`} role="switch" aria-checked={checked} aria-label={title} onClick={onChange}><i /></button></div> }

function VehicleDialog({ vehicle, onClose, onNotify }: { vehicle: Vehicle; onClose: () => void; onNotify: (message: string) => void }) {
  return <Dialog title="Vehicle details" onClose={onClose}><div className="vehicle-dialog-head"><VehicleAvatar vehicle={vehicle} /><div><b>{vehicle.name}</b><span>{vehicle.model} · {vehicle.plate}</span></div><StatusPill status={vehicle.health} /></div><div className="vehicle-detail-grid"><Detail label="Vehicle ID" value={vehicle.id} /><Detail label="Current location" value={vehicle.location} /><Detail label="Vehicle status" value={vehicle.status} /><Detail label="Battery level" value={`${vehicle.battery}% · ${vehicle.range} km range`} /><Detail label="Odometer" value={`${vehicle.odometer.toLocaleString()} km`} /><Detail label="Assigned driver" value={vehicle.driver} /></div><div className="dialog-note"><Activity size={15} /> Last synthetic data update: {vehicle.updated}</div><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={() => { onNotify(`Status refresh requested for ${vehicle.name} in demo mode.`); onClose() }} icon={<Activity size={15} />}>Refresh status</Button></div></Dialog>
}
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-cell"><span>{label}</span><strong>{value}</strong></div> }

function vehicleFromApi(remote: ApiVehicle): Vehicle {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(remote.updatedAt)) / 60_000))
  return {
    id: remote.id,
    name: remote.name,
    plate: remote.plate,
    model: remote.model,
    location: remote.location,
    health: remote.health,
    status: remote.status,
    battery: remote.batteryPercent,
    range: remote.rangeKm,
    odometer: 0,
    driver: 'Unassigned',
    updated: elapsedMinutes < 1 ? 'just now' : `${elapsedMinutes} min ago`,
    color: '#6688a0',
  }
}

function localVehicleFromRegistration(registration: Omit<VehicleRegistrationRequest, 'ownerId'>): Vehicle {
  return {
    id: `LOCAL-${crypto.randomUUID().slice(0, 8)}`,
    name: `${registration.make} ${registration.model}`,
    plate: registration.plate.trim().toUpperCase(),
    model: `${registration.make} ${registration.model} (${registration.modelYear})`,
    location: 'Berlin, Mitte',
    health: 'Healthy',
    status: 'Parked',
    battery: 78,
    range: 366,
    odometer: 0,
    driver: 'Unassigned',
    updated: 'just now',
    color: '#6688a0',
  }
}

function AddVehicleDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (registration: Omit<VehicleRegistrationRequest, 'ownerId'>) => Promise<void> }) {
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [modelYear, setModelYear] = useState(String(new Date().getFullYear()))
  const [plate, setPlate] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const year = Number(modelYear)
    const registrationPlate = plate.trim()
    if (!make.trim() || make.trim().length > 80 || !model.trim() || model.trim().length > 100 || !registrationPlate || registrationPlate.length > 20 || !/^[A-Za-z0-9 -]+$/.test(registrationPlate) || !/[A-Za-z0-9]/.test(registrationPlate) || !Number.isInteger(year) || year < 1990 || year > new Date().getFullYear() + 1) {
      setError(`Enter make, model, and a valid registration (up to 20 characters), and a model year from 1990 to ${new Date().getFullYear() + 1}.`)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onAdd({ make: make.trim(), model: model.trim(), modelYear: year, plate: plate.trim() })
    } catch (requestError) {
      setError(typeof requestError === 'object' && requestError !== null && 'message' in requestError
        ? String(requestError.message)
        : 'The vehicle could not be registered. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }
  return <Dialog title="Add a vehicle" subtitle="Register a synthetic vehicle to this demo workspace." onClose={onClose}><form className="dialog-form" onSubmit={submit} noValidate><label>Make<input value={make} onChange={(event) => setMake(event.target.value)} placeholder="e.g. Volvo" autoFocus /></label><label>Model<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="e.g. EX90" /></label><label>Model year<input type="number" min="1990" max={new Date().getFullYear() + 1} value={modelYear} onChange={(event) => setModelYear(event.target.value)} /></label><label>Registration<input value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="e.g. B-RS 7312" /></label>{error && <p className="form-error" role="alert">{error}</p>}<p className="form-hint">Compose saves this record in PostgreSQL. Standalone demo mode keeps it in API memory. Demo owner: fleet-demo.</p><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><button className="button button-primary" type="submit" disabled={submitting}><Plus size={15} /> {submitting ? 'Registering...' : 'Add vehicle'}</button></div></form></Dialog>
}
function BookingDialog({ vehicles, onClose, onBook }: { vehicles: Vehicle[]; onClose: () => void; onBook: (service: string, vehicle: string, date: string) => void }) {
  const [service, setService] = useState('Routine service'); const [vehicle, setVehicle] = useState(vehicles[0]?.name ?? 'Vehicle'); const [date, setDate] = useState('2026-10-24'); const [error, setError] = useState('')
  const submit = (event: FormEvent) => { event.preventDefault(); if (!date || new Date(`${date}T00:00:00`) < new Date('2026-10-17T00:00:00')) { setError('Choose a date on or after 17 October 2026.'); return } onBook(service, vehicle, date) }
  return <Dialog title="Schedule service" subtitle="Create a simulated maintenance booking." onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Service type<select value={service} onChange={(event) => setService(event.target.value)}><option>Routine service</option><option>Brake inspection</option><option>Battery health check</option><option>Tire rotation</option><option>Charging reservation</option></select></label><label>Vehicle<select value={vehicle} onChange={(event) => setVehicle(event.target.value)}>{vehicles.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Preferred date<input type="date" min="2026-10-17" value={date} onChange={(event) => setDate(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<p className="form-hint">Sent to the local demo API when available; no service center is contacted.</p><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><button className="button button-primary" type="submit"><CalendarDays size={15} /> Confirm booking</button></div></form></Dialog>
}

function Dialog({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-header"><div><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div>
}
