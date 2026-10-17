import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createState, DomainError, evaluateTelemetry, projectTelemetry, validateTelemetry } from './domain.mjs'
import { createVehicleRegistryClient } from './vehicle-registry-client.mjs'
import { createVehicleStatusClient } from './vehicle-status-client.mjs'
import { createTelemetryIngestionClient } from './telemetry-ingestion-client.mjs'

const MAX_BODY_BYTES = 16 * 1024
const allowedOrigins = new Set((process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(',').map((origin) => origin.trim()).filter(Boolean))
const validCorrelationId = /^[A-Za-z0-9._:-]{1,80}$/
const metricRoutes = new Set([
  'GET /health/live', 'GET /health/ready', 'GET /metrics',
  'GET /api/v1/vehicles', 'POST /api/v1/vehicles', 'POST /api/v1/telemetry', 'GET /api/v1/diagnostics',
  'GET /api/v1/activity', 'GET /api/v1/notifications', 'GET /api/v1/bookings', 'POST /api/v1/bookings',
  'GET /api/v1/invoices', 'POST /api/v1/payments/simulate',
])

function problem(res, requestId, status, title, detail, instance) {
  res.writeHead(status, { 'content-type': 'application/problem+json; charset=utf-8', 'x-request-id': requestId })
  res.end(JSON.stringify({ type: `https://roadsphere.example/problems/${status}`, title, status, detail, instance, requestId }))
}

function sendJson(res, requestId, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId, ...extraHeaders })
  res.end(JSON.stringify(body))
}

function sendText(res, requestId, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store', 'x-request-id': requestId })
  res.end(body)
}

async function readJson(req) {
  const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new DomainError(415, 'Unsupported media type', 'Send a request body with Content-Type: application/json.')
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new DomainError(413, 'Request too large', `JSON request bodies must not exceed ${MAX_BODY_BYTES} bytes.`)
  }
  try { return JSON.parse(body) } catch { throw new DomainError(400, 'Invalid JSON', 'Request body must contain valid JSON.') }
}

function parsePage(url) {
  const page = Number(url.searchParams.get('page') ?? 0)
  const size = Number(url.searchParams.get('size') ?? 50)
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100) throw new DomainError(400, 'Invalid pagination', 'page must be a non-negative integer and size must be between 1 and 100.')
  return { page, size }
}

function validateVehicleRegistration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError(400, 'Invalid vehicle registration', 'Request body must be a JSON object.')
  const allowed = new Set(['ownerId', 'plate', 'make', 'model', 'modelYear'])
  const extra = Object.keys(value).find((key) => !allowed.has(key))
  if (extra) throw new DomainError(400, 'Invalid vehicle registration', `Unexpected field: ${extra}.`)
  const text = (key, maxLength) => {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].trim().length > maxLength) {
      throw new DomainError(400, 'Invalid vehicle registration', `${key} must be non-empty and at most ${maxLength} characters.`)
    }
    return value[key].trim()
  }
  const registration = {
    ownerId: text('ownerId', 80),
    plate: text('plate', 20),
    make: text('make', 80),
    model: text('model', 100),
    modelYear: value.modelYear,
  }
  if (!/^[A-Za-z0-9 -]+$/.test(registration.plate) || !/[A-Za-z0-9]/.test(registration.plate)) {
    throw new DomainError(400, 'Invalid vehicle registration', 'plate must contain letters or numbers, spaces, and hyphens only.')
  }
  if (!Number.isInteger(registration.modelYear) || registration.modelYear < 1990 || registration.modelYear > new Date().getFullYear() + 1) {
    throw new DomainError(400, 'Invalid vehicle registration', 'modelYear must be between 1990 and next year.')
  }
  return registration
}

function normalizedPlate(plate) {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

function vehicleFromRegistry(record, existing) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || typeof record.ownerId !== 'string' ||
      typeof record.plate !== 'string' || typeof record.make !== 'string' || typeof record.model !== 'string' ||
      !Number.isInteger(record.modelYear) || typeof record.registeredAt !== 'string' || !Number.isFinite(Date.parse(record.registeredAt))) {
    throw new DomainError(502, 'Invalid vehicle registry response', 'The local vehicle registry returned an invalid vehicle record.')
  }
  const name = existing?.name ?? `${record.make} ${record.model}`
  return {
    ...(existing ?? {}),
    id: record.id,
    ownerId: record.ownerId,
    name,
    plate: record.plate,
    model: `${record.make} ${record.model} · ${record.modelYear}`,
    location: existing?.location ?? 'Berlin, Mitte',
    health: existing?.health ?? 'Healthy',
    status: existing?.status ?? 'Parked',
    batteryPercent: existing?.batteryPercent ?? 78,
    rangeKm: existing?.rangeKm ?? 366,
    batteryTemperatureC: existing?.batteryTemperatureC ?? 28,
    updatedAt: existing?.updatedAt ?? record.registeredAt,
  }
}

function syncRegistryVehicles(state, records) {
  const currentById = new Map(state.vehicles.map((vehicle) => [vehicle.id, vehicle]))
  state.vehicles = records.map((record) => vehicleFromRegistry(record, currentById.get(record?.id)))
}

function applyStatusProjection(vehicle, projection) {
  if (!projection || typeof projection !== 'object' || projection.vehicleId !== vehicle.id ||
      !['Driving', 'Parked', 'Charging'].includes(projection.status) ||
      !['Healthy', 'Attention', 'Critical'].includes(projection.health) ||
      !Number.isFinite(projection.batteryPercent) || !Number.isFinite(projection.rangeKm) ||
      !Number.isFinite(projection.batteryTemperatureC) || typeof projection.recordedAt !== 'string' ||
      !Number.isFinite(Date.parse(projection.recordedAt))) {
    throw new DomainError(502, 'Invalid vehicle status response', 'The local vehicle status service returned an invalid projection.')
  }
  return {
    ...vehicle,
    status: projection.status,
    health: projection.health,
    batteryPercent: projection.batteryPercent,
    rangeKm: projection.rangeKm,
    batteryTemperatureC: projection.batteryTemperatureC,
    updatedAt: projection.recordedAt,
  }
}

async function syncStatusProjections(state, statusClient) {
  if (!statusClient) return
  const projections = await statusClient.listAll()
  const projectionById = new Map(projections.map((projection) => [projection?.vehicleId, projection]))
  state.vehicles = state.vehicles.map((vehicle) => {
    const projection = projectionById.get(vehicle.id)
    return projection ? applyStatusProjection(vehicle, projection) : vehicle
  })
}

function localVehicle(state, registration) {
  const normalized = normalizedPlate(registration.plate)
  const duplicate = state.vehicles.some((vehicle) => (vehicle.ownerId ?? 'fleet-demo') === registration.ownerId && normalizedPlate(vehicle.plate) === normalized)
  if (duplicate) throw new DomainError(409, 'Duplicate vehicle registration', 'This owner already has a vehicle with the same normalized registration.')
  const registeredAt = new Date().toISOString()
  return {
    id: `VH-${randomUUID()}`,
    ownerId: registration.ownerId,
    name: `${registration.make} ${registration.model}`,
    plate: registration.plate.toUpperCase(),
    model: `${registration.make} ${registration.model} · ${registration.modelYear}`,
    location: 'Berlin, Mitte',
    health: 'Healthy',
    status: 'Parked',
    batteryPercent: 78,
    rangeKm: 366,
    batteryTemperatureC: 28,
    updatedAt: registeredAt,
  }
}

function decodePathSegment(value) {
  try { return decodeURIComponent(value) }
  catch { throw new DomainError(400, 'Invalid URL path', 'A path parameter contains malformed percent encoding.') }
}

function telemetryFingerprint(event) {
  return JSON.stringify({
    eventId: event.eventId,
    vehicleId: event.vehicleId,
    recordedAt: event.recordedAt,
    batteryPercent: event.batteryPercent,
    batteryTemperatureC: event.batteryTemperatureC,
    speedKph: event.speedKph,
    latitude: event.latitude,
    longitude: event.longitude,
    charging: event.charging,
  })
}

function metricRoute(method, pathname) {
  const key = `${method} ${pathname}`
  if (metricRoutes.has(key)) return pathname
  if (method === 'GET' && /^\/api\/v1\/vehicles\/[^/]+$/.test(pathname)) return '/api/v1/vehicles/{vehicleId}'
  if (method === 'GET' && /^\/api\/v1\/bookings\/[^/]+$/.test(pathname)) return '/api/v1/bookings/{bookingId}'
  return '/unmatched'
}

export function createApp({ state = createState(), logger = (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`), registryClient = createVehicleRegistryClient(process.env.VEHICLE_REGISTRY_URL), statusClient = createVehicleStatusClient(process.env.VEHICLE_STATUS_URL), telemetryClient = createTelemetryIngestionClient(process.env.TELEMETRY_INGESTION_URL) } = {}) {
  const requestCounts = new Map()
  const recordRequest = (entry) => {
    const method = ['GET', 'POST', 'OPTIONS'].includes(entry.method) ? entry.method : 'OTHER'
    const route = metricRoute(method, entry.path)
    const status = Number(entry.status) || 500
    const key = `${method}|${route}|${status}`
    const metric = requestCounts.get(key) ?? { method, route, status, count: 0 }
    metric.count += 1
    requestCounts.set(key, metric)
    logger(entry)
  }
  const server = createServer({ maxHeaderSize: 8 * 1024 }, async (req, res) => {
    const started = Date.now()
    const url = new URL(req.url ?? '/', 'http://localhost')
    const requestIdHeader = req.headers['x-correlation-id']
    const requestId = typeof requestIdHeader === 'string' && validCorrelationId.test(requestIdHeader) ? requestIdHeader : randomUUID()
    const origin = req.headers.origin
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'Origin')
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
      res.setHeader('access-control-allow-headers', 'Content-Type, X-Correlation-ID')
    }
    if (req.method === 'OPTIONS') {
      if (origin && !allowedOrigins.has(origin)) problem(res, requestId, 403, 'Origin not allowed', 'This browser origin is not configured for the local demo API.', url.pathname)
      else { res.writeHead(204, { 'x-request-id': requestId }); res.end() }
      recordRequest({ requestId, method: req.method, path: url.pathname, status: res.statusCode, durationMs: Date.now() - started })
      return
    }
    try {
      if (origin && !allowedOrigins.has(origin)) throw new DomainError(403, 'Origin not allowed', 'This browser origin is not configured for the local demo API.')
      const route = `${req.method} ${url.pathname}`
      if (route === 'GET /health/live') return sendJson(res, requestId, 200, { status: 'UP' })
      if (route === 'GET /health/ready') {
        if (registryClient) await registryClient.ready()
        if (statusClient) await statusClient.ready()
        if (telemetryClient) await telemetryClient.ready()
        const storage = [registryClient ? 'vehicle registry' : 'in-memory vehicle metadata', statusClient ? 'vehicle status projection' : 'in-memory telemetry and demo projections', telemetryClient ? 'durable telemetry outbox' : null].filter(Boolean).join(' plus ')
        return sendJson(res, requestId, 200, { status: 'UP', dependencies: { storage } })
      }
      if (route === 'GET /metrics') {
        const samples = [...requestCounts.values()].sort((left, right) => `${left.method}|${left.route}|${left.status}`.localeCompare(`${right.method}|${right.route}|${right.status}`))
        const lines = [
          '# HELP roadsphere_http_requests_total HTTP requests handled by the local demo API.',
          '# TYPE roadsphere_http_requests_total counter',
          ...samples.map(({ method, route, status, count }) => `roadsphere_http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`),
        ]
        return sendText(res, requestId, 200, `${lines.join('\n')}\n`)
      }
      if (route === 'GET /api/v1/vehicles') {
        const { page, size } = parsePage(url)
        if (registryClient) syncRegistryVehicles(state, await registryClient.listAll())
        await syncStatusProjections(state, statusClient)
        const records = state.vehicles.slice(page * size, (page + 1) * size)
        return sendJson(res, requestId, 200, { items: records, page, size, total: state.vehicles.length })
      }
      if (route === 'POST /api/v1/vehicles') {
        const registration = validateVehicleRegistration(await readJson(req))
        let vehicle
        if (registryClient) {
          const created = await registryClient.register(registration, requestId)
          vehicle = vehicleFromRegistry(created)
          state.vehicles.unshift(vehicle)
        } else {
          vehicle = localVehicle(state, registration)
          state.vehicles.unshift(vehicle)
        }
        return sendJson(res, requestId, 201, { vehicle, registryBacked: Boolean(registryClient) }, { location: `/api/v1/vehicles/${vehicle.id}` })
      }
      const vehicleMatch = url.pathname.match(/^\/api\/v1\/vehicles\/([^/]+)$/)
      if (req.method === 'GET' && vehicleMatch) {
        const vehicleId = decodePathSegment(vehicleMatch[1])
        let vehicle
        if (registryClient) {
          const record = await registryClient.get(vehicleId)
          vehicle = vehicleFromRegistry(record, state.vehicles.find((item) => item.id === vehicleId))
          const index = state.vehicles.findIndex((item) => item.id === vehicleId)
          if (index >= 0) state.vehicles[index] = vehicle
          else state.vehicles.push(vehicle)
        } else {
          vehicle = state.vehicles.find((item) => item.id === vehicleId)
          if (!vehicle) throw new DomainError(404, 'Vehicle not found', 'No synthetic vehicle exists with this ID.')
        }
        if (statusClient) {
          try {
            vehicle = applyStatusProjection(vehicle, await statusClient.get(vehicleId))
            const index = state.vehicles.findIndex((item) => item.id === vehicleId)
            if (index >= 0) state.vehicles[index] = vehicle
          } catch (error) {
            if (!(error instanceof DomainError) || error.status !== 404) throw error
          }
        }
        return sendJson(res, requestId, 200, vehicle)
      }
      if (route === 'POST /api/v1/telemetry') {
        const telemetry = validateTelemetry(await readJson(req))
        const previous = state.events.get(telemetry.eventId)
        if (previous) {
          if (previous.fingerprint !== telemetryFingerprint(telemetry)) throw new DomainError(409, 'Event ID conflict', 'This eventId has already been used with a different telemetry body.')
          return sendJson(res, requestId, 200, { eventId: telemetry.eventId, correlationId: requestId, status: 'DUPLICATE', alerts: previous.alerts }, { 'idempotency-replayed': 'true' })
        }
        const vehicleIndex = state.vehicles.findIndex((item) => item.id === telemetry.vehicleId)
        if (vehicleIndex < 0) throw new DomainError(404, 'Vehicle not found', 'Telemetry references an unknown synthetic vehicle.')
        if (Date.parse(telemetry.recordedAt) < Date.parse(state.vehicles[vehicleIndex].updatedAt)) throw new DomainError(409, 'Stale telemetry', 'recordedAt is older than the latest projected vehicle state.')
        const alerts = evaluateTelemetry(telemetry)
        let targetStatus = null
        if (telemetryClient) {
          targetStatus = await telemetryClient.accept(telemetry, requestId)
          if (!targetStatus || !['ACCEPTED', 'DUPLICATE'].includes(targetStatus.status) || targetStatus.eventId !== telemetry.eventId) {
            throw new DomainError(502, 'Invalid telemetry ingestion response', 'The telemetry ingestion service returned an invalid event result.')
          }
          state.vehicles[vehicleIndex] = projectTelemetry(state.vehicles[vehicleIndex], telemetry, alerts)
          if (targetStatus.status === 'DUPLICATE') {
            if (state.events.size >= 10_000) state.events.delete(state.events.keys().next().value)
            state.events.set(telemetry.eventId, { fingerprint: telemetryFingerprint(telemetry), alerts: [] })
            return sendJson(res, requestId, 200, { eventId: telemetry.eventId, correlationId: requestId, status: 'DUPLICATE', alerts: [] }, { 'idempotency-replayed': 'true' })
          }
        } else if (statusClient) {
          targetStatus = await statusClient.accept(telemetry, requestId)
          if (!targetStatus || !['ACCEPTED', 'DUPLICATE'].includes(targetStatus.status) || targetStatus.eventId !== telemetry.eventId) {
            throw new DomainError(502, 'Invalid vehicle status response', 'The local vehicle status service returned an invalid event result.')
          }
          state.vehicles[vehicleIndex] = applyStatusProjection(state.vehicles[vehicleIndex], targetStatus.vehicle)
          if (targetStatus.status === 'DUPLICATE') {
            if (state.events.size >= 10_000) state.events.delete(state.events.keys().next().value)
            state.events.set(telemetry.eventId, { fingerprint: telemetryFingerprint(telemetry), alerts: [] })
            return sendJson(res, requestId, 200, { eventId: telemetry.eventId, correlationId: requestId, status: 'DUPLICATE', alerts: [] }, { 'idempotency-replayed': 'true' })
          }
        } else {
          state.vehicles[vehicleIndex] = projectTelemetry(state.vehicles[vehicleIndex], telemetry, alerts)
        }
        if (state.events.size >= 10_000) state.events.delete(state.events.keys().next().value)
        state.events.set(telemetry.eventId, { fingerprint: telemetryFingerprint(telemetry), alerts })
        state.alerts = [...alerts, ...state.alerts].slice(0, 100)
        state.activities = [{ id: telemetry.eventId, vehicleId: telemetry.vehicleId, title: alerts.length ? 'Diagnostic alert created' : 'Telemetry received', description: `${state.vehicles[vehicleIndex].name} · ${alerts.length ? alerts.map((alert) => alert.code).join(', ') : 'status refreshed'}`, recordedAt: telemetry.recordedAt }, ...state.activities].slice(0, 100)
        const notifications = alerts.map((alert) => ({
          id: `NT-${alert.id}`,
          vehicleId: telemetry.vehicleId,
          title: alert.code === 'BATTERY_TEMPERATURE' ? 'Battery temperature elevated' : 'Battery level low',
          description: `${state.vehicles[vehicleIndex].name} · ${alert.message}`,
          kind: 'alert',
          createdAt: telemetry.recordedAt,
          read: false,
        }))
        state.notifications = [...notifications, ...state.notifications].slice(0, 100)
        return sendJson(res, requestId, 202, { eventId: telemetry.eventId, correlationId: requestId, status: 'ACCEPTED', vehicle: state.vehicles[vehicleIndex], alerts })
      }
      if (route === 'GET /api/v1/diagnostics') {
        const { page, size } = parsePage(url)
        return sendJson(res, requestId, 200, { items: state.alerts.slice(page * size, (page + 1) * size), page, size, total: state.alerts.length })
      }
      if (route === 'GET /api/v1/activity') {
        const { page, size } = parsePage(url)
        return sendJson(res, requestId, 200, { items: state.activities.slice(page * size, (page + 1) * size), page, size, total: state.activities.length })
      }
      if (route === 'GET /api/v1/notifications') {
        const { page, size } = parsePage(url)
        return sendJson(res, requestId, 200, { items: state.notifications.slice(page * size, (page + 1) * size), page, size, total: state.notifications.length })
      }
      if (route === 'GET /api/v1/bookings') {
        const { page, size } = parsePage(url)
        return sendJson(res, requestId, 200, { items: state.bookings.slice(page * size, (page + 1) * size), page, size, total: state.bookings.length })
      }
      if (route === 'GET /api/v1/invoices') {
        const { page, size } = parsePage(url)
        return sendJson(res, requestId, 200, { items: state.invoices.slice(page * size, (page + 1) * size), page, size, total: state.invoices.length })
      }
      if (route === 'POST /api/v1/payments/simulate') {
        const body = await readJson(req)
        const acceptedKeys = new Set(['invoiceId', 'paymentAttemptId', 'outcome'])
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !acceptedKeys.has(key))) throw new DomainError(400, 'Invalid payment simulation', 'Provide only invoiceId, paymentAttemptId, and outcome.')
        if (typeof body.invoiceId !== 'string' || !body.invoiceId.trim() || typeof body.paymentAttemptId !== 'string' || !body.paymentAttemptId.trim() || body.paymentAttemptId.length > 80) throw new DomainError(400, 'Invalid payment simulation', 'invoiceId and paymentAttemptId are required strings; paymentAttemptId is limited to 80 characters.')
        if (!['SUCCESS', 'FAILURE', 'RETRY'].includes(body.outcome)) throw new DomainError(400, 'Invalid payment simulation', 'outcome must be SUCCESS, FAILURE, or RETRY.')
        const fingerprint = JSON.stringify({ invoiceId: body.invoiceId.trim(), paymentAttemptId: body.paymentAttemptId.trim(), outcome: body.outcome })
        const previous = state.paymentAttempts.get(body.paymentAttemptId.trim())
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new DomainError(409, 'Payment attempt conflict', 'This paymentAttemptId has already been used with a different request.')
          return sendJson(res, requestId, 200, previous.result, { 'idempotency-replayed': 'true' })
        }
        const invoice = state.invoices.find((item) => item.id === body.invoiceId.trim())
        if (!invoice) throw new DomainError(404, 'Invoice not found', 'No synthetic invoice exists with this ID.')
        if (invoice.status !== 'OPEN') throw new DomainError(409, 'Invoice already settled', 'This synthetic invoice is no longer open for payment simulation.')
        const result = { paymentAttemptId: body.paymentAttemptId.trim(), invoiceId: invoice.id, amount: invoice.amount, currency: invoice.currency, outcome: body.outcome, simulated: true, completedAt: new Date().toISOString() }
        if (state.paymentAttempts.size >= 10_000) state.paymentAttempts.delete(state.paymentAttempts.keys().next().value)
        state.paymentAttempts.set(result.paymentAttemptId, { fingerprint, result })
        if (body.outcome === 'SUCCESS') invoice.status = 'PAID'
        state.activities.unshift({ id: result.paymentAttemptId, title: `Payment simulation ${body.outcome.toLowerCase()}`, description: `${invoice.id} · ${invoice.currency} ${invoice.amount}`, recordedAt: result.completedAt })
        state.activities = state.activities.slice(0, 100)
        state.notifications.unshift({ id: `NT-${result.paymentAttemptId}`, title: `Payment simulation ${body.outcome.toLowerCase()}`, description: `${invoice.id} · ${invoice.currency} ${invoice.amount}`, kind: 'billing', createdAt: result.completedAt, read: false })
        state.notifications = state.notifications.slice(0, 100)
        return sendJson(res, requestId, 201, result)
      }
      const bookingMatch = url.pathname.match(/^\/api\/v1\/bookings\/([^/]+)$/)
      if (req.method === 'GET' && bookingMatch) {
        const bookingId = decodePathSegment(bookingMatch[1])
        const booking = state.bookings.find((item) => item.id === bookingId)
        if (!booking) throw new DomainError(404, 'Booking not found', 'No simulated booking exists with this ID.')
        return sendJson(res, requestId, 200, booking)
      }
      if (route === 'POST /api/v1/bookings') {
        const body = await readJson(req)
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['vehicleId', 'serviceType', 'scheduledAt'].includes(key))) throw new DomainError(400, 'Invalid booking', 'Provide only vehicleId, serviceType, and scheduledAt.')
        if (typeof body.vehicleId !== 'string' || !state.vehicles.some((vehicle) => vehicle.id === body.vehicleId)) throw new DomainError(404, 'Vehicle not found', 'Booking must reference an existing synthetic vehicle.')
        if (typeof body.serviceType !== 'string' || body.serviceType.trim().length < 3 || body.serviceType.length > 80) throw new DomainError(400, 'Invalid booking', 'serviceType must contain between 3 and 80 characters.')
        if (typeof body.scheduledAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(body.scheduledAt) || !Number.isFinite(Date.parse(body.scheduledAt))) throw new DomainError(400, 'Invalid booking', 'scheduledAt must be an ISO 8601 date-time with a timezone.')
        const scheduledTime = Date.parse(body.scheduledAt)
        if (scheduledTime <= Date.now()) throw new DomainError(400, 'Invalid booking', 'scheduledAt must be in the future.')
        const conflict = state.bookings.some((booking) => booking.vehicleId === body.vehicleId && Math.abs(Date.parse(booking.scheduledAt) - scheduledTime) < 30 * 60 * 1000)
        if (conflict) throw new DomainError(409, 'Booking conflict', 'This vehicle already has a simulated booking within 30 minutes of that time.')
        if (state.bookings.length >= 1_000) throw new DomainError(429, 'Demo booking limit reached', 'Restart the local demo API to clear its in-memory booking sample.')
        const booking = { id: `BK-${randomUUID()}`, vehicleId: body.vehicleId, serviceType: body.serviceType.trim(), scheduledAt: body.scheduledAt, status: 'CONFIRMED', createdAt: new Date().toISOString() }
        state.bookings.unshift(booking)
        state.activities.unshift({ id: booking.id, vehicleId: booking.vehicleId, title: 'Service booking confirmed', description: `${booking.serviceType} · ${state.vehicles.find((vehicle) => vehicle.id === booking.vehicleId).name}`, recordedAt: booking.createdAt })
        state.activities = state.activities.slice(0, 100)
        state.notifications.unshift({ id: `NT-${booking.id}`, vehicleId: booking.vehicleId, title: 'Service booking confirmed', description: `${booking.serviceType} · ${state.vehicles.find((vehicle) => vehicle.id === booking.vehicleId).name}`, kind: 'service', createdAt: booking.createdAt, read: false })
        state.notifications = state.notifications.slice(0, 100)
        return sendJson(res, requestId, 201, booking, { location: `/api/v1/bookings/${booking.id}` })
      }
      throw new DomainError(404, 'Route not found', 'No local demo API route matches this request.')
    } catch (error) {
      const status = error instanceof DomainError ? error.status : 500
      const title = error instanceof DomainError ? error.title : 'Internal server error'
      const detail = error instanceof DomainError ? error.message : 'The local demo API could not complete this request.'
      problem(res, requestId, status, title, detail, url.pathname)
    } finally {
      recordRequest({ requestId, method: req.method, path: url.pathname, status: res.statusCode, durationMs: Date.now() - started })
    }
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 12_000
  server.keepAliveTimeout = 5_000
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8080)
  const host = process.env.HOST ?? '127.0.0.1'
  const server = createApp()
  server.listen(port, host, () => process.stdout.write(`RoadSphere local demo API listening on http://${host}:${port}\n`))
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
