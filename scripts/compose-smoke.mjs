import { randomUUID } from 'node:crypto'

const timeoutMs = 4_000
const startupTimeoutMs = 120_000

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

async function waitFor(name, url) {
  const deadline = Date.now() + startupTimeoutMs
  let lastError = 'no response'

  while (Date.now() < deadline) {
    try {
      const response = await request(url)
      if (response.ok) {
        console.log(`PASS ${name} ready (${response.status})`)
        return response
      }
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  throw new Error(`${name} did not become ready within ${startupTimeoutMs} ms: ${lastError}`)
}

async function readJson(response, label) {
  const contentType = response.headers.get('content-type') ?? ''
  assert(contentType.includes('application/json'), `${label} did not return JSON.`)
  return response.json()
}

const targets = [
  ['local API', 'http://127.0.0.1:8080/health/ready'],
  ['vehicle registry', 'http://127.0.0.1:8083/actuator/health/readiness'],
  ['telemetry ingestion', 'http://127.0.0.1:8086/actuator/health/readiness'],
  ['vehicle status', 'http://127.0.0.1:8087/actuator/health/readiness'],
  ['fleet portal', 'http://127.0.0.1:5173/'],
  ['customer portal', 'http://127.0.0.1:5174/'],
]

await Promise.all(targets.map(([name, url]) => waitFor(name, url)))

const registryUrl = 'http://127.0.0.1:8083/api/v1/vehicles?page=0&size=50'
const seededVehicles = await readJson(await request(registryUrl), 'Vehicle registry')
assert(seededVehicles.total === 8, `Expected 8 migrated registry seeds, received ${seededVehicles.total}.`)
assert(seededVehicles.items.length === 8, `Expected 8 registry seed items, received ${seededVehicles.items.length}.`)
console.log('PASS PostgreSQL migration seeded all 8 registry vehicles')

const apiVehiclesUrl = 'http://127.0.0.1:8080/api/v1/vehicles'
const apiSeededVehicles = await readJson(await request(`${apiVehiclesUrl}?page=0&size=50`), 'Local API vehicles')
assert(apiSeededVehicles.total === 8, `Expected the local API to expose 8 registry vehicles, received ${apiSeededVehicles.total}.`)
console.log('PASS local API reads the PostgreSQL vehicle registry')

async function registerVehicle(ownerId, plate) {
  return request(apiVehiclesUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ownerId, plate, make: 'Synthetic', model: 'CI smoke', modelYear: 2025 }),
  })
}

const registered = await registerVehicle('compose-smoke-owner', 'CI 2048')
assert(registered.status === 201, `Expected vehicle registration HTTP 201, received ${registered.status}.`)
const registeredBody = await readJson(registered, 'Local API registration')
assert(registeredBody.registryBacked === true, 'Expected Compose registration to be backed by the vehicle registry.')
console.log('PASS local API registration reached the PostgreSQL-backed registry')

const duplicate = await registerVehicle('compose-smoke-owner', 'CI-2048')
assert(duplicate.status === 409, `Expected normalized duplicate HTTP 409, received ${duplicate.status}.`)
console.log('PASS database rejects normalized duplicate plate for one owner')

const otherOwner = await registerVehicle('compose-smoke-other-owner', 'CI-2048')
assert(otherOwner.status === 201, `Expected same plate for a different owner to return HTTP 201, received ${otherOwner.status}.`)
console.log('PASS same plate remains available to a different owner')

const persistedVehicles = await readJson(await request(registryUrl), 'Vehicle registry after writes')
assert(persistedVehicles.total === 10, `Expected 10 vehicles after two registrations, received ${persistedVehicles.total}.`)
const apiPersistedVehicles = await readJson(await request(`${apiVehiclesUrl}?page=0&size=50`), 'Local API after writes')
assert(apiPersistedVehicles.total === 10, `Expected the local API to expose 10 vehicles after two registrations, received ${apiPersistedVehicles.total}.`)
console.log('PASS registry and API reads reflect persisted registrations')

const telemetryEvent = {
  eventId: `compose-smoke-${randomUUID()}`,
  vehicleId: 'RS-2048',
  recordedAt: new Date().toISOString(),
  batteryPercent: 61,
  batteryTemperatureC: 25,
  speedKph: 0,
  latitude: 52.52,
  longitude: 13.405,
  charging: false,
}

async function submitStatus(event) {
  return request('http://127.0.0.1:8087/api/v1/vehicle-status/events/telemetry-received', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })
}

const projected = await submitStatus(telemetryEvent)
assert(projected.status === 202, `Expected telemetry projection HTTP 202, received ${projected.status}.`)
const projectedBody = await readJson(projected, 'Vehicle status projection')
assert(projectedBody.status === 'ACCEPTED', 'Expected the telemetry event to be accepted.')
assert(projectedBody.vehicle.status === 'Parked' && projectedBody.vehicle.batteryPercent === 61, 'Status projection returned unexpected vehicle state.')
console.log('PASS status service validates and stores the telemetry projection')

const replayed = await submitStatus(telemetryEvent)
assert(replayed.status === 200, `Expected idempotent telemetry replay HTTP 200, received ${replayed.status}.`)
assert((await readJson(replayed, 'Vehicle status replay')).status === 'DUPLICATE', 'Expected duplicate telemetry to be acknowledged.')
console.log('PASS status service acknowledges identical event replay')

const staleEvent = { ...telemetryEvent, eventId: `compose-stale-${randomUUID()}`, recordedAt: new Date(Date.now() - 60_000).toISOString() }
const stale = await submitStatus(staleEvent)
assert(stale.status === 409, `Expected stale telemetry HTTP 409, received ${stale.status}.`)
console.log('PASS status service rejects stale telemetry')

const unknownVehicle = await submitStatus({ ...telemetryEvent, eventId: `compose-unknown-${randomUUID()}`, vehicleId: 'RS-unknown' })
assert(unknownVehicle.status === 404, `Expected unregistered vehicle HTTP 404, received ${unknownVehicle.status}.`)
console.log('PASS status service checks vehicle registration')

const kafkaEvent = {
  ...telemetryEvent,
  eventId: `compose-kafka-${randomUUID()}`,
  recordedAt: new Date(Date.now() + 2_000).toISOString(),
  batteryPercent: 63,
}
const queued = await request('http://127.0.0.1:8086/api/v1/telemetry', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-correlation-id': 'compose-kafka-smoke' },
  body: JSON.stringify(kafkaEvent),
})
assert(queued.status === 202, `Expected telemetry outbox HTTP 202, received ${queued.status}.`)
assert((await readJson(queued, 'Telemetry outbox acceptance')).status === 'ACCEPTED', 'Expected telemetry to enter the durable outbox.')

async function waitForProjection(event) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const response = await request(`http://127.0.0.1:8087/api/v1/vehicle-status/${encodeURIComponent(event.vehicleId)}`)
    if (response.ok) {
      const projection = await readJson(response, 'Kafka status projection')
      if (projection.eventId === event.eventId) return projection
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Kafka telemetry event ${event.eventId} was not projected within 30 seconds.`)
}

const kafkaProjection = await waitForProjection(kafkaEvent)
assert(kafkaProjection.batteryPercent === 63, 'Kafka status projection returned an unexpected battery level.')
console.log('PASS telemetry outbox publishes a keyed Kafka event and the status consumer projects it')

const queuedReplay = await request('http://127.0.0.1:8086/api/v1/telemetry', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(kafkaEvent),
})
assert(queuedReplay.status === 200, `Expected outbox duplicate HTTP 200, received ${queuedReplay.status}.`)
assert((await readJson(queuedReplay, 'Telemetry outbox replay')).status === 'DUPLICATE', 'Expected outbox duplicate detection.')
console.log('PASS telemetry outbox returns a stable result for duplicate event IDs')

const fleetTelemetry = {
  eventId: `compose-fleet-${randomUUID()}`,
  vehicleId: 'RS-2048',
  recordedAt: new Date(Date.now() + 10_000).toISOString(),
  batteryPercent: 54,
  batteryTemperatureC: 43,
  speedKph: 0,
  latitude: 52.52,
  longitude: 13.405,
  charging: false,
}
const bridgedTelemetry = await request('http://127.0.0.1:8080/api/v1/telemetry', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(fleetTelemetry),
})
assert(bridgedTelemetry.status === 202, `Expected Fleet API telemetry HTTP 202, received ${bridgedTelemetry.status}.`)
const bridgedBody = await readJson(bridgedTelemetry, 'Fleet API telemetry projection')
assert(bridgedBody.vehicle.status === 'Parked' && bridgedBody.vehicle.health === 'Critical', 'Fleet API did not return the status-service projection.')
const bridgedStatus = await waitForProjection(fleetTelemetry)
assert(bridgedStatus.eventId === fleetTelemetry.eventId && bridgedStatus.batteryPercent === 54, 'Status service did not persist the Fleet API telemetry event.')
const bridgedReplay = await request('http://127.0.0.1:8080/api/v1/telemetry', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(fleetTelemetry),
})
assert(bridgedReplay.status === 200, `Expected Fleet API duplicate telemetry HTTP 200, received ${bridgedReplay.status}.`)
console.log('PASS Fleet API forwards telemetry to the persistent status projection')
