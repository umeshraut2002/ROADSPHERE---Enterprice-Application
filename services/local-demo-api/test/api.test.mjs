import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../src/server.mjs'
import { createState, DomainError } from '../src/domain.mjs'

const server = createApp({ logger: () => {}, registryClient: null, statusClient: null })
let baseUrl

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})
after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))

test('health and vehicle collection expose bounded, paginated synthetic data', async () => {
  const health = await fetch(`${baseUrl}/health/ready`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).status, 'UP')
  const response = await fetch(`${baseUrl}/api/v1/vehicles?page=0&size=2`)
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.items.length, 2)
  assert.equal(result.total, 8)
  assert.equal((await fetch(`${baseUrl}/api/v1/vehicles?size=101`)).status, 400)
  assert.equal((await fetch(`${baseUrl}/api/v1/vehicles/%E0%A4%A`)).status, 400)
})

test('telemetry validates, projects alerts and recovers, and deduplicates event IDs', async () => {
  const event = { eventId: 'test-event-recovery', vehicleId: 'RS-2019', recordedAt: new Date().toISOString(), batteryPercent: 55, batteryTemperatureC: 24, speedKph: 0, latitude: 50.11, longitude: 8.68, charging: false }
  const bad = await fetch(`${baseUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...event, batteryPercent: 101 }) })
  assert.equal(bad.status, 400)
  assert.equal(bad.headers.get('content-type')?.startsWith('application/problem+json'), true)

  const response = await fetch(`${baseUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-correlation-id': 'corr_demo_01' }, body: JSON.stringify(event) })
  const result = await response.json()
  assert.equal(response.status, 202)
  assert.equal(response.headers.get('x-request-id'), 'corr_demo_01')
  assert.equal(result.vehicle.health, 'Healthy')
  assert.equal(result.vehicle.status, 'Parked')
  assert.equal(result.vehicle.batteryPercent, 55)
  assert.equal(result.alerts.length, 0)

  const duplicate = await fetch(`${baseUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(Object.entries(event).reverse())) })
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json()).status, 'DUPLICATE')
  const changedDuplicate = await fetch(`${baseUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...event, batteryPercent: 54 }) })
  assert.equal(changedDuplicate.status, 409)
  const stale = await fetch(`${baseUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...event, eventId: 'test-event-stale', recordedAt: '2026-10-16T00:00:00Z' }) })
  assert.equal(stale.status, 409)
})

test('creates a diagnostic alert and rejects telemetry for unknown vehicles', async () => {
  const event = { eventId: 'test-event-alert', vehicleId: 'RS-2048', recordedAt: new Date().toISOString(), batteryPercent: 12, batteryTemperatureC: 43, speedKph: 0, latitude: 52.52, longitude: 13.405, charging: false }
  const response = await fetch(`${baseUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) })
  const result = await response.json()
  assert.equal(result.alerts.length, 2)
  assert.equal(result.vehicle.health, 'Critical')
  const diagnostics = await fetch(`${baseUrl}/api/v1/diagnostics`)
  assert.equal((await diagnostics.json()).total, 2)
  const notifications = await fetch(`${baseUrl}/api/v1/notifications`)
  const notificationPage = await notifications.json()
  assert.equal(notificationPage.total, 2)
  assert.ok(notificationPage.items.every((item) => item.kind === 'alert'))
  const duplicate = await fetch(`${baseUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) })
  assert.equal(duplicate.status, 200)
  assert.equal((await (await fetch(`${baseUrl}/api/v1/notifications`)).json()).total, 2)
  const unknown = await fetch(`${baseUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...event, eventId: 'test-event-unknown', vehicleId: 'RS-9999' }) })
  assert.equal(unknown.status, 404)
})

test('creates bookings and prevents overlapping bookings for a vehicle', async () => {
  const scheduledAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
  const request = { vehicleId: 'RS-2048', serviceType: 'Brake inspection', scheduledAt }
  const first = await fetch(`${baseUrl}/api/v1/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
  assert.equal(first.status, 201)
  const created = await first.json()
  assert.equal((await fetch(`${baseUrl}${first.headers.get('location')}`)).status, 200)
  const conflicting = await fetch(`${baseUrl}/api/v1/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, scheduledAt: new Date(Date.parse(scheduledAt) + 15 * 60 * 1000).toISOString() }) })
  assert.equal(conflicting.status, 409)
  const blankType = await fetch(`${baseUrl}/api/v1/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, serviceType: '   ', scheduledAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() }) })
  assert.equal(blankType.status, 400)
  const notifications = await fetch(`${baseUrl}/api/v1/notifications`)
  assert.equal((await notifications.json()).total, 3)
  assert.ok(created.id)
})

test('simulates payment outcomes, replays attempts idempotently, and settles only on success', async () => {
  const invoiceUrl = `${baseUrl}/api/v1/invoices`
  const paymentUrl = `${baseUrl}/api/v1/payments/simulate`
  const invoice = (await (await fetch(invoiceUrl)).json()).items[0]
  assert.equal(invoice.status, 'OPEN')
  const sendAttempt = (paymentAttemptId, outcome) => fetch(paymentUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invoiceId: invoice.id, paymentAttemptId, outcome }) })

  assert.equal((await sendAttempt('pay-failure-1', 'FAILURE')).status, 201)
  assert.equal((await (await fetch(invoiceUrl)).json()).items[0].status, 'OPEN')
  assert.equal((await sendAttempt('pay-retry-1', 'RETRY')).status, 201)
  const success = await sendAttempt('pay-success-1', 'SUCCESS')
  const result = await success.json()
  assert.equal(success.status, 201)
  assert.equal(result.simulated, true)
  assert.equal(result.currency, 'EUR')
  assert.equal((await (await fetch(invoiceUrl)).json()).items[0].status, 'PAID')

  const replay = await sendAttempt('pay-success-1', 'SUCCESS')
  assert.equal(replay.status, 200)
  assert.equal(replay.headers.get('idempotency-replayed'), 'true')
  assert.equal((await sendAttempt('pay-success-1', 'FAILURE')).status, 409)
  assert.equal((await sendAttempt('pay-success-2', 'SUCCESS')).status, 409)
  const notifications = await fetch(`${baseUrl}/api/v1/notifications`)
  assert.equal((await notifications.json()).total, 6)
})

test('exports Prometheus request counters with bounded route labels', async () => {
  const response = await fetch(`${baseUrl}/metrics`)
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/plain; version=0\.0\.4/)
  assert.match(body, /# TYPE roadsphere_http_requests_total counter/)
  assert.match(body, /method="GET",route="\/health\/ready",status="200"/)
  assert.match(body, /method="POST",route="\/api\/v1\/telemetry",status="202"/)
  assert.doesNotMatch(body, /test-event-alert|RS-2048/)
})

test('limits browser origins and request bodies', async () => {
  const forbidden = await fetch(`${baseUrl}/api/v1/vehicles`, { headers: { origin: 'https://example.invalid' } })
  assert.equal(forbidden.status, 403)
  const oversized = await fetch(`${baseUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload: 'x'.repeat(17 * 1024) }) })
  assert.equal(oversized.status, 413)
})

test('uses the vehicle registry for durable registration, reads, and readiness', async (t) => {
  let ready = true
  let nextId = 1
  const records = [{ id: 'RS-2048', ownerId: 'fleet-demo', plate: 'M-TR 4821', make: 'Volvo', model: 'EX90', modelYear: 2025, registeredAt: '2026-10-16T08:00:00Z' }]
  const registryClient = {
    ready: async () => {
      if (!ready) throw new DomainError(503, 'Vehicle registry unavailable', 'The local vehicle registry is not ready.')
    },
    listAll: async () => [...records],
    get: async (id) => {
      const record = records.find((item) => item.id === id)
      if (!record) throw new DomainError(404, 'Vehicle not found', 'No synthetic vehicle exists with this ID.')
      return record
    },
    register: async (registration) => {
      const normalized = registration.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      if (records.some((record) => record.ownerId === registration.ownerId && record.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === normalized)) {
        throw new DomainError(409, 'Duplicate vehicle registration', 'This owner already has a vehicle with the same normalized registration.')
      }
      const record = { ...registration, id: `VH-test-${nextId++}`, plate: registration.plate.toUpperCase(), registeredAt: new Date().toISOString() }
      records.push(record)
      return record
    },
  }
  const registryServer = createApp({ state: createState(), registryClient, statusClient: null, logger: () => {} })
  await new Promise((resolve) => registryServer.listen(0, '127.0.0.1', resolve))
  t.after(async () => new Promise((resolve, reject) => registryServer.close((error) => error ? reject(error) : resolve())))
  const registryUrl = `http://127.0.0.1:${registryServer.address().port}`

  const unavailable = await fetch(`${registryUrl}/health/ready`)
  assert.equal(unavailable.status, 200)
  assert.match((await unavailable.json()).dependencies.storage, /vehicle registry/)
  ready = false
  assert.equal((await fetch(`${registryUrl}/health/ready`)).status, 503)
  ready = true

  const registration = { ownerId: 'compose-smoke-owner', plate: 'CI 2048', make: 'Synthetic', model: 'CI smoke', modelYear: 2025 }
  const created = await fetch(`${registryUrl}/api/v1/vehicles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(registration) })
  const result = await created.json()
  assert.equal(created.status, 201)
  assert.equal(created.headers.get('location'), `/api/v1/vehicles/${result.vehicle.id}`)
  assert.equal(result.registryBacked, true)
  assert.equal(result.vehicle.model, 'Synthetic CI smoke · 2025')

  const duplicate = await fetch(`${registryUrl}/api/v1/vehicles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...registration, plate: 'CI-2048' }) })
  assert.equal(duplicate.status, 409)
  const page = await (await fetch(`${registryUrl}/api/v1/vehicles?page=0&size=100`)).json()
  assert.equal(page.total, 2)
  assert.ok(page.items.some((vehicle) => vehicle.id === result.vehicle.id))
  assert.equal((await fetch(`${registryUrl}/api/v1/vehicles/${result.vehicle.id}`)).status, 200)
  const metrics = await (await fetch(`${registryUrl}/metrics`)).text()
  assert.match(metrics, /method="POST",route="\/api\/v1\/vehicles",status="201"/)
})

test('supports normalized duplicate checks when running without the registry', async (t) => {
  const localServer = createApp({ state: createState(), registryClient: null, statusClient: null, logger: () => {} })
  await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve))
  t.after(async () => new Promise((resolve, reject) => localServer.close((error) => error ? reject(error) : resolve())))
  const localUrl = `http://127.0.0.1:${localServer.address().port}`
  const registration = { ownerId: 'fleet-demo', plate: 'LOCAL 2048', make: 'Synthetic', model: 'Local demo', modelYear: 2025 }
  const created = await fetch(`${localUrl}/api/v1/vehicles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(registration) })
  const result = await created.json()
  assert.equal(created.status, 201)
  assert.equal(result.registryBacked, false)
  assert.match(result.vehicle.id, /^VH-/)
  const duplicateSeed = await fetch(`${localUrl}/api/v1/vehicles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...registration, plate: 'MTR-4821' }) })
  assert.equal(duplicateSeed.status, 409)
  const duplicate = await fetch(`${localUrl}/api/v1/vehicles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...registration, plate: 'LOCAL-2048' }) })
  assert.equal(duplicate.status, 409)
  const otherOwner = await fetch(`${localUrl}/api/v1/vehicles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...registration, ownerId: 'other-owner' }) })
  assert.equal(otherOwner.status, 201)
  assert.equal((await (await fetch(`${localUrl}/api/v1/vehicles`)).json()).total, 10)
})

test('uses the configured vehicle status projection for reads and telemetry', async (t) => {
  const calls = []
  let current = {
    vehicleId: 'RS-2048', status: 'Driving', health: 'Attention', batteryPercent: 68,
    rangeKm: 270, batteryTemperatureC: 39, recordedAt: new Date().toISOString(),
  }
  const statusClient = {
    ready: async () => true,
    listAll: async () => [current],
    get: async () => current,
    accept: async (event, correlationId) => {
      calls.push({ event, correlationId })
      current = {
        ...current,
        status: event.charging ? 'Charging' : event.speedKph > 2 ? 'Driving' : 'Parked',
        batteryPercent: event.batteryPercent,
        batteryTemperatureC: event.batteryTemperatureC,
        rangeKm: 222,
        recordedAt: event.recordedAt,
      }
      return { eventId: event.eventId, status: 'ACCEPTED', vehicle: current }
    },
  }
  const statusServer = createApp({ state: createState(), registryClient: null, statusClient, logger: () => {} })
  await new Promise((resolve) => statusServer.listen(0, '127.0.0.1', resolve))
  t.after(async () => new Promise((resolve, reject) => statusServer.close((error) => error ? reject(error) : resolve())))
  const statusUrl = `http://127.0.0.1:${statusServer.address().port}`

  assert.equal((await fetch(`${statusUrl}/health/ready`)).status, 200)
  const initialPage = await (await fetch(`${statusUrl}/api/v1/vehicles`)).json()
  assert.equal(initialPage.items.find((vehicle) => vehicle.id === 'RS-2048').rangeKm, 270)

  const event = { eventId: 'status-service-event-1', vehicleId: 'RS-2048', recordedAt: new Date(Date.now() + 1000).toISOString(), batteryPercent: 45, batteryTemperatureC: 25, speedKph: 0, latitude: 52.52, longitude: 13.405, charging: true }
  const accepted = await fetch(`${statusUrl}/api/v1/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'status_bridge_corr' },
    body: JSON.stringify(event),
  })
  const result = await accepted.json()
  assert.equal(accepted.status, 202)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].correlationId, 'status_bridge_corr')
  assert.equal(result.vehicle.status, 'Charging')
  assert.equal(result.vehicle.rangeKm, 222)

  const replay = await fetch(`${statusUrl}/api/v1/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) })
  assert.equal(replay.status, 200)
  assert.equal((await replay.json()).status, 'DUPLICATE')
  assert.equal(calls.length, 1)
})
