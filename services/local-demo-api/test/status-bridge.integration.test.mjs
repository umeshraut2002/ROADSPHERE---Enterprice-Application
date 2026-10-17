import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createApp } from '../src/server.mjs'
import { createState } from '../src/domain.mjs'
import { createVehicleStatusClient } from '../src/vehicle-status-client.mjs'

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve(`http://127.0.0.1:${server.address().port}`)
    })
  })
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  return JSON.parse(body)
}

test('forwards Fleet telemetry over HTTP and replays safely after the API restarts', async (t) => {
  const statuses = new Map()
  const events = new Map()
  let postCount = 0
  let forwardedCorrelationId
  const statusServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://status.local')
    if (req.method === 'GET' && url.pathname === '/actuator/health/readiness') return json(res, 200, { status: 'UP' })
    if (req.method === 'GET' && url.pathname === '/api/v1/vehicle-status') {
      const page = Number(url.searchParams.get('page') ?? 0)
      const size = Number(url.searchParams.get('size') ?? 50)
      const items = [...statuses.values()].sort((left, right) => left.vehicleId.localeCompare(right.vehicleId))
      return json(res, 200, { items: items.slice(page * size, (page + 1) * size), page, size, total: items.length })
    }
    const statusMatch = url.pathname.match(/^\/api\/v1\/vehicle-status\/([^/]+)$/)
    if (req.method === 'GET' && statusMatch) {
      const status = statuses.get(decodeURIComponent(statusMatch[1]))
      return status ? json(res, 200, status) : json(res, 404, { title: 'Vehicle status not found', detail: 'No projection exists.' })
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/vehicle-status/events/telemetry-received') {
      postCount += 1
      forwardedCorrelationId = req.headers['x-correlation-id']
      const event = await readJson(req)
      const fingerprint = JSON.stringify(event)
      const previousEvent = events.get(event.eventId)
      if (previousEvent) {
        if (previousEvent.fingerprint !== fingerprint) return json(res, 409, { title: 'Event ID conflict', detail: 'Event body changed.' })
        return json(res, 200, { eventId: event.eventId, status: 'DUPLICATE', vehicle: statuses.get(event.vehicleId) })
      }
      const previous = statuses.get(event.vehicleId)
      if (previous && Date.parse(event.recordedAt) <= Date.parse(previous.recordedAt)) return json(res, 409, { title: 'Stale telemetry', detail: 'Event timestamp is old.' })
      const priorBattery = previous?.batteryPercent ?? 78
      const priorRange = previous?.rangeKm ?? 366
      const temperature = Number(event.batteryTemperatureC)
      const status = event.charging ? 'Charging' : event.speedKph > 2 ? 'Driving' : 'Parked'
      const health = temperature >= 42 ? 'Critical' : temperature >= 38 || event.batteryPercent < 20 ? 'Attention' : 'Healthy'
      const vehicle = {
        vehicleId: event.vehicleId,
        status,
        health,
        batteryPercent: event.batteryPercent,
        batteryTemperatureC: temperature,
        rangeKm: Math.round(priorRange * event.batteryPercent / Math.max(priorBattery, 1)),
        recordedAt: event.recordedAt,
      }
      events.set(event.eventId, { fingerprint })
      statuses.set(event.vehicleId, vehicle)
      return json(res, 202, { eventId: event.eventId, status: 'ACCEPTED', vehicle })
    }
    return json(res, 404, { title: 'Not found', detail: 'Unknown fake status route.' })
  })

  const statusUrl = await listen(statusServer)
  const apiServers = []
  const startApi = async () => {
    const api = createApp({ state: createState(), registryClient: null, statusClient: createVehicleStatusClient(statusUrl), logger: () => {} })
    apiServers.push(api)
    return { api, url: await listen(api) }
  }
  const first = await startApi()
  t.after(async () => Promise.all([...apiServers.map(close), close(statusServer)]))

  const event = {
    eventId: 'fleet-http-event-1',
    vehicleId: 'RS-2048',
    recordedAt: new Date().toISOString(),
    batteryPercent: 54,
    batteryTemperatureC: 43,
    speedKph: 0,
    latitude: 52.52,
    longitude: 13.405,
    charging: false,
  }
  const accepted = await fetch(`${first.url}/api/v1/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'fleet-status-http-test' },
    body: JSON.stringify(event),
  })
  const acceptedBody = await accepted.json()
  assert.equal(accepted.status, 202)
  assert.equal(forwardedCorrelationId, 'fleet-status-http-test')
  assert.equal(acceptedBody.vehicle.health, 'Critical')
  assert.equal((await (await fetch(`${first.url}/api/v1/vehicles`)).json()).items.find((vehicle) => vehicle.id === 'RS-2048').batteryPercent, 54)

  const second = await startApi()
  const replay = await fetch(`${second.url}/api/v1/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })
  assert.equal(replay.status, 200)
  assert.equal((await replay.json()).status, 'DUPLICATE')
  assert.equal(postCount, 2)
})
