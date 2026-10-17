import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DomainError } from '../src/domain.mjs'
import { createVehicleStatusClient } from '../src/vehicle-status-client.mjs'

test('reads status pages and forwards telemetry events to the status ingress', async () => {
  const calls = []
  const client = createVehicleStatusClient('http://status.example/', async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/actuator/health/readiness')) return Response.json({ status: 'UP' })
    if (url.includes('/api/v1/vehicle-status?page=0')) return Response.json({ items: [{ vehicleId: 'RS-2048' }], total: 2 })
    if (url.includes('/api/v1/vehicle-status?page=1')) return Response.json({ items: [{ vehicleId: 'RS-2037' }], total: 2 })
    if (url.endsWith('/api/v1/vehicle-status/RS-2048')) return Response.json({ vehicleId: 'RS-2048' })
    if (url.endsWith('/api/v1/vehicle-status/events/telemetry-received')) return Response.json({ eventId: 'status-client-event', status: 'ACCEPTED' }, { status: 202 })
    throw new Error(`Unexpected status-service URL: ${url}`)
  })

  assert.ok(client)
  await client.ready()
  assert.equal((await client.listAll()).length, 2)
  assert.equal((await client.get('RS-2048')).vehicleId, 'RS-2048')
  const event = { eventId: 'status-client-event', vehicleId: 'RS-2048', recordedAt: '2026-10-17T08:00:00Z', batteryPercent: 70, batteryTemperatureC: 25, speedKph: 0, latitude: 52.52, longitude: 13.405, charging: false }
  const result = await client.accept(event, 'status-client-correlation')
  const ingress = calls.at(-1)
  assert.equal(result.status, 'ACCEPTED')
  assert.equal(ingress.options.method, 'POST')
  assert.equal(ingress.options.headers['x-correlation-id'], 'status-client-correlation')
  assert.deepEqual(JSON.parse(ingress.options.body), event)
})

test('maps unavailable and rejected status-service requests to safe API errors', async () => {
  const unavailable = createVehicleStatusClient('http://status.example', async () => { throw new TypeError('socket path') })
  await assert.rejects(unavailable.ready(), (error) => error instanceof DomainError && error.status === 503 && !error.message.includes('socket path'))

  const rejected = createVehicleStatusClient('http://status.example', async () => new Response(JSON.stringify({ title: 'Stale telemetry', detail: 'Event timestamp is old.' }), { status: 409 }))
  await assert.rejects(rejected.accept({ eventId: 'e' }), (error) => error instanceof DomainError && error.status === 409 && error.title === 'Stale telemetry')
})
