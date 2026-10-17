import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createApp } from '../src/server.mjs'
import { createState } from '../src/domain.mjs'
import { createVehicleRegistryClient } from '../src/vehicle-registry-client.mjs'

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

test('registers and reads vehicles through the real HTTP adapter client', async (t) => {
  const records = [{ id: 'RS-2048', ownerId: 'fleet-demo', plate: 'M-TR 4821', make: 'Volvo', model: 'EX90', modelYear: 2025, registeredAt: '2026-10-16T08:00:00Z' }]
  let nextId = 1
  let registryReady = true
  let forwardedCorrelationId
  const registry = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://registry.local')
    if (req.method === 'GET' && url.pathname === '/actuator/health/readiness') return json(res, 200, { status: registryReady ? 'UP' : 'DOWN' })
    if (req.method === 'GET' && url.pathname === '/api/v1/vehicles') {
      const page = Number(url.searchParams.get('page') ?? 0)
      const size = Number(url.searchParams.get('size') ?? 50)
      return json(res, 200, { items: records.slice(page * size, (page + 1) * size), page, size, total: records.length })
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/vehicles') {
      forwardedCorrelationId = req.headers['x-correlation-id']
      const registration = await readJson(req)
      const normalizedPlate = registration.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      if (records.some((record) => record.ownerId === registration.ownerId && record.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === normalizedPlate)) {
        return json(res, 409, { title: 'Duplicate registration', detail: 'Owner already has this plate.' })
      }
      const created = { ...registration, id: `VH-http-${nextId++}`, plate: registration.plate.toUpperCase(), registeredAt: new Date().toISOString() }
      records.push(created)
      res.setHeader('location', `/api/v1/vehicles/${created.id}`)
      return json(res, 201, created)
    }
    const vehicleMatch = url.pathname.match(/^\/api\/v1\/vehicles\/([^/]+)$/)
    if (req.method === 'GET' && vehicleMatch) {
      const vehicleId = decodeURIComponent(vehicleMatch[1])
      const vehicle = records.find((record) => record.id === vehicleId)
      return vehicle
        ? json(res, 200, vehicle)
        : json(res, 404, { title: 'Vehicle not found', detail: 'No synthetic vehicle exists with this ID.' })
    }
    return json(res, 404, { title: 'Not found', detail: 'Unknown fake registry route.' })
  })

  const registryUrl = await listen(registry)
  const api = createApp({ state: createState(), registryClient: createVehicleRegistryClient(registryUrl), statusClient: null, logger: () => {} })
  const apiUrl = await listen(api)
  t.after(async () => Promise.all([close(api), close(registry)]))

  const readiness = await fetch(`${apiUrl}/health/ready`)
  assert.equal(readiness.status, 200)
  const initial = await (await fetch(`${apiUrl}/api/v1/vehicles?page=0&size=20`)).json()
  assert.equal(initial.total, 1)
  assert.equal(initial.items[0].id, 'RS-2048')

  const registration = { ownerId: 'fleet-demo', plate: 'HTTP 2001', make: 'Synthetic', model: 'Bridge test', modelYear: 2025 }
  const response = await fetch(`${apiUrl}/api/v1/vehicles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'bridge-http-test' },
    body: JSON.stringify(registration),
  })
  const created = await response.json()
  assert.equal(response.status, 201)
  assert.equal(forwardedCorrelationId, 'bridge-http-test')
  assert.equal(created.registryBacked, true)
  assert.equal(created.vehicle.id, 'VH-http-1')

  const duplicate = await fetch(`${apiUrl}/api/v1/vehicles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...registration, plate: 'HTTP-2001' }),
  })
  assert.equal(duplicate.status, 409)

  const reloaded = await (await fetch(`${apiUrl}/api/v1/vehicles?page=0&size=20`)).json()
  assert.equal(reloaded.total, 2)
  assert.ok(reloaded.items.some((vehicle) => vehicle.id === created.vehicle.id))
  assert.equal((await fetch(`${apiUrl}/api/v1/vehicles/${created.vehicle.id}`)).status, 200)

  registryReady = false
  assert.equal((await fetch(`${apiUrl}/health/ready`)).status, 503)
})
