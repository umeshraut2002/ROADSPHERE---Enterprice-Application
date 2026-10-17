import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DomainError } from '../src/domain.mjs'
import { createTelemetryIngestionClient } from '../src/telemetry-ingestion-client.mjs'

test('checks ingestion readiness and forwards versioned telemetry with correlation metadata', async () => {
  const calls = []
  const client = createTelemetryIngestionClient('http://telemetry.example/', async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/actuator/health/readiness')) return Response.json({ status: 'UP' })
    return Response.json({ eventId: 'ingestion-event', status: 'ACCEPTED' }, { status: 202 })
  })
  const event = { eventId: 'ingestion-event', vehicleId: 'RS-2048', recordedAt: '2026-10-17T08:00:00Z', batteryPercent: 70, batteryTemperatureC: 25, speedKph: 0, latitude: 52.52, longitude: 13.405, charging: false }

  assert.ok(client)
  await client.ready()
  const result = await client.accept(event, 'ingestion-correlation')

  assert.equal(result.status, 'ACCEPTED')
  assert.equal(calls[1].url, 'http://telemetry.example/api/v1/telemetry')
  assert.equal(calls[1].options.headers['x-correlation-id'], 'ingestion-correlation')
  assert.deepEqual(JSON.parse(calls[1].options.body), event)
})

test('maps unavailable and rejected ingestion requests to safe API errors', async () => {
  const unavailable = createTelemetryIngestionClient('http://telemetry.example', async () => { throw new TypeError('socket path') })
  await assert.rejects(unavailable.ready(), (error) => error instanceof DomainError && error.status === 503 && !error.message.includes('socket path'))

  const rejected = createTelemetryIngestionClient('http://telemetry.example', async () => new Response(JSON.stringify({ title: 'Vehicle not found', detail: 'Telemetry references an unknown vehicle.' }), { status: 404 }))
  await assert.rejects(rejected.accept({ eventId: 'e' }), (error) => error instanceof DomainError && error.status === 404 && error.title === 'Vehicle not found')
})
