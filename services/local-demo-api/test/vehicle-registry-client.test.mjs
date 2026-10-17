import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DomainError } from '../src/domain.mjs'
import { createVehicleRegistryClient } from '../src/vehicle-registry-client.mjs'

test('paginates registry reads and forwards registrations with correlation IDs', async () => {
  const calls = []
  const client = createVehicleRegistryClient('http://registry.example/', async (url, options) => {
    calls.push({ url: new URL(url), options })
    if (url.endsWith('/actuator/health/readiness')) return Response.json({ status: 'UP' })
    if (url.includes('/api/v1/vehicles?page=0')) return Response.json({ items: Array.from({ length: 100 }, (_, index) => ({ id: `VH-${index}` })), total: 101 })
    if (url.includes('/api/v1/vehicles?page=1')) return Response.json({ items: [{ id: 'VH-100' }], total: 101 })
    if (url.endsWith('/api/v1/vehicles/VH-encoded%2Fid')) return Response.json({ id: 'VH-encoded/id' })
    if (url.endsWith('/api/v1/vehicles')) return Response.json({ id: 'VH-created' }, { status: 201 })
    throw new Error(`Unexpected registry URL: ${url}`)
  })

  assert.ok(client)
  await client.ready()
  const all = await client.listAll()
  assert.equal(all.length, 101)
  assert.equal(calls.filter((call) => call.url.pathname === '/api/v1/vehicles').length, 2)
  assert.equal((await client.get('VH-encoded/id')).id, 'VH-encoded/id')

  await client.register({ ownerId: 'fleet-demo', plate: 'CI 2048', make: 'Synthetic', model: 'Client test', modelYear: 2025 }, 'corr_client_test')
  const registration = calls.at(-1)
  assert.equal(registration.options.method, 'POST')
  assert.equal(registration.options.headers['x-correlation-id'], 'corr_client_test')
  assert.deepEqual(JSON.parse(registration.options.body), { ownerId: 'fleet-demo', plate: 'CI 2048', make: 'Synthetic', model: 'Client test', modelYear: 2025 })
})

test('sanitizes registry transport failures and preserves safe problem details', async () => {
  const unavailable = createVehicleRegistryClient('http://registry.example', async () => { throw new TypeError('socket details') })
  await assert.rejects(unavailable.ready(), (error) => error instanceof DomainError && error.status === 503 && !error.message.includes('socket details'))

  const rejected = createVehicleRegistryClient('http://registry.example', async () => new Response(JSON.stringify({ title: 'Duplicate registration', detail: 'Owner already has this plate.' }), { status: 409 }))
  await assert.rejects(rejected.register({ ownerId: 'owner', plate: 'X', make: 'A', model: 'B', modelYear: 2025 }), (error) => error instanceof DomainError && error.status === 409 && error.title === 'Duplicate registration' && error.message === 'Owner already has this plate.')

  const malformed = createVehicleRegistryClient('http://registry.example', async () => Response.json({ items: [], total: 'unknown' }))
  await assert.rejects(malformed.list(0, 50), (error) => error instanceof DomainError && error.status === 502)
})
