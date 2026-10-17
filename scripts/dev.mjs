import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const smokeOnly = process.argv.slice(2).includes('--smoke')
const registryConfigured = Boolean(process.env.VEHICLE_REGISTRY_URL?.trim())
const ports = {
  api: Number(process.env.RS_API_PORT ?? 8080),
  fleet: Number(process.env.RS_FLEET_PORT ?? 5173),
  customer: Number(process.env.RS_CUSTOMER_PORT ?? 5174),
}
const children = new Set()
let stopping = false
let failed = false
let requestedStop = false
let stopPromise = null

function validatePorts() {
  const entries = Object.entries(ports)
  for (const [name, port] of entries) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} port must be an integer from 1 to 65535.`)
  }
  if (new Set(entries.map(([, port]) => port)).size !== entries.length) throw new Error('API, fleet, and customer ports must be different.')
}

function launch(name, args, env, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const entry = { name, child, error: null, result: null }
  entry.closed = new Promise((resolve) => {
    child.once('close', (code, signal) => {
      entry.result = { code, signal }
      children.delete(entry)
      if (!stopping) {
        failed = true
        process.stderr.write(`[${name}] exited unexpectedly (${signal ?? code ?? 'unknown'}).\n`)
      }
      resolve(entry.result)
    })
  })
  child.once('error', (error) => {
    entry.error = error
    process.stderr.write(`[${name}] failed to start: ${error.message}\n`)
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`))
  children.add(entry)
  return entry
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForUrl(entry, url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'No HTTP response yet.'
  while (Date.now() < deadline) {
    if (entry.error) throw new Error(`${entry.name} failed to start: ${entry.error.message}`)
    if (entry.result) throw new Error(`${entry.name} exited before becoming ready.`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (response.ok) return response
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(250)
  }
  throw new Error(`${entry.name} did not answer at ${url} within ${timeoutMs}ms: ${lastError}`)
}

async function verifyLocalVehicleRegistration(apiBase, fleetOrigin) {
  const ownerId = `smoke-${randomUUID()}`
  const plate = `SMOKE-${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const registration = { ownerId, plate, make: 'Synthetic', model: 'Local smoke', modelYear: new Date().getFullYear() }
  const send = (body) => fetch(`${apiBase}/api/v1/vehicles`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: fleetOrigin,
      'x-correlation-id': 'dev-smoke-registration',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4_000),
  })

  const createdResponse = await send(registration)
  if (createdResponse.status !== 201) throw new Error(`Local API vehicle registration failed (HTTP ${createdResponse.status}).`)
  const created = await createdResponse.json()
  if (created.registryBacked !== false || !created.vehicle?.id || createdResponse.headers.get('location') !== `/api/v1/vehicles/${created.vehicle.id}`) {
    throw new Error('Local API vehicle registration returned an unexpected response.')
  }

  const duplicate = await send({ ...registration, plate: plate.replace('-', ' ') })
  if (duplicate.status !== 409) throw new Error(`Normalized duplicate registration returned HTTP ${duplicate.status}, expected 409.`)

  const otherOwner = await send({ ...registration, ownerId: `${ownerId}-other`, plate: plate.replace('-', ' ') })
  if (otherOwner.status !== 201) throw new Error(`The same plate for a different owner returned HTTP ${otherOwner.status}, expected 201.`)
  const secondCreated = await otherOwner.json()

  const pageResponse = await fetch(`${apiBase}/api/v1/vehicles?page=0&size=100`, { signal: AbortSignal.timeout(4_000) })
  if (!pageResponse.ok) throw new Error(`Local API vehicle read after registration failed (HTTP ${pageResponse.status}).`)
  const page = await pageResponse.json()
  const returnedIds = new Set(page.items.map((vehicle) => vehicle.id))
  if (page.total !== 10 || !returnedIds.has(created.vehicle.id) || !returnedIds.has(secondCreated.vehicle.id)) {
    throw new Error('Local API vehicle reads did not include both smoke registrations.')
  }
  process.stdout.write('PASS local API registration, normalized duplicate rejection, owner isolation, and read-after-write.\n')
}

function stopChildren() {
  if (stopPromise) return stopPromise
  stopping = true
  const running = [...children]
  for (const entry of running) entry.child.kill('SIGTERM')
  stopPromise = (async () => {
    if (running.length === 0) return
    await Promise.race([Promise.all(running.map((entry) => entry.closed)), delay(4000)])
    for (const entry of children) entry.child.kill('SIGKILL')
    await Promise.all([...children].map((entry) => entry.closed))
  })()
  return stopPromise
}

async function main() {
  validatePorts()
  const apiFile = path.join(root, 'services/local-demo-api/src/server.mjs')
  const fleetVite = path.join(root, 'frontends/fleet-operations/node_modules/vite/bin/vite.js')
  const customerVite = path.join(root, 'frontends/customer-portal/node_modules/vite/bin/vite.js')
  for (const file of [apiFile, fleetVite, customerVite]) {
    if (!existsSync(file)) throw new Error(`Missing local runtime dependency: ${path.relative(root, file)}. Install each app with npm ci first.`)
  }

  const api = launch('api', [apiFile], {
    HOST: '127.0.0.1',
    PORT: String(ports.api),
    CORS_ORIGINS: `http://localhost:${ports.fleet},http://localhost:${ports.customer},http://127.0.0.1:${ports.fleet},http://127.0.0.1:${ports.customer}`,
  })
  const apiBase = `http://127.0.0.1:${ports.api}`
  await waitForUrl(api, `${apiBase}/health/ready`)

  const fleet = launch('fleet', [fleetVite, '--host', '127.0.0.1', '--port', String(ports.fleet), '--strictPort'], {
    RS_DEV_API_TARGET: apiBase,
  }, path.join(root, 'frontends/fleet-operations'))
  const customer = launch('customer', [customerVite, '--host', '127.0.0.1', '--port', String(ports.customer), '--strictPort'], {
    RS_DEV_API_TARGET: apiBase,
  }, path.join(root, 'frontends/customer-portal'))

  const fleetUrl = `http://127.0.0.1:${ports.fleet}/`
  const customerUrl = `http://127.0.0.1:${ports.customer}/`
  const [fleetResponse, customerResponse] = await Promise.all([
    waitForUrl(fleet, fleetUrl),
    waitForUrl(customer, customerUrl),
  ])
  for (const [name, response] of [['fleet', fleetResponse], ['customer', customerResponse]]) {
    const document = await response.text()
    if (!document.includes('<div id="root">')) throw new Error(`${name} portal returned an unexpected development document.`)
  }
  const vehicleResponse = await fetch(`${apiBase}/api/v1/vehicles?size=1`, {
    headers: { origin: `http://127.0.0.1:${ports.fleet}` },
  })
  if (!vehicleResponse.ok || vehicleResponse.headers.get('access-control-allow-origin') !== `http://127.0.0.1:${ports.fleet}`) {
    throw new Error(`API vehicle read or fleet CORS check failed (HTTP ${vehicleResponse.status}).`)
  }
  const vehiclePage = await vehicleResponse.json()
  if ((registryConfigured ? vehiclePage.total < 8 : vehiclePage.total !== 8) || vehiclePage.items.length !== 1) throw new Error('API did not return its expected paginated synthetic vehicle sample.')

  for (const [name, origin] of [['fleet', fleetUrl], ['customer', customerUrl]]) {
    const proxiedResponse = await fetch(`${origin}api/v1/vehicles?size=1`, { signal: AbortSignal.timeout(4_000) })
    if (!proxiedResponse.ok) throw new Error(`${name} same-origin API proxy returned HTTP ${proxiedResponse.status}.`)
    const proxiedPage = await proxiedResponse.json()
    if (proxiedPage.total !== vehiclePage.total || proxiedPage.items.length !== 1) throw new Error(`${name} same-origin API proxy returned an unexpected vehicle page.`)
  }
  process.stdout.write('PASS fleet and customer same-origin API proxy reads.\n')

  if (smokeOnly) {
    if (registryConfigured) {
      process.stdout.write('SKIP local registration writes because VEHICLE_REGISTRY_URL points to a configured registry.\n')
    } else {
      await verifyLocalVehicleRegistration(apiBase, `http://127.0.0.1:${ports.fleet}`)
    }
  }

  process.stdout.write(`RoadSphere is ready: API ${apiBase}, fleet ${fleetUrl}, customer ${customerUrl}.\n`)
  if (smokeOnly) {
    process.stdout.write('Local application smoke check passed.\n')
    await stopChildren()
    if (failed) process.exitCode = 1
    return
  }
  process.stdout.write('Press Ctrl+C to stop all three processes.\n')
  await Promise.race([...children].map((entry) => entry.closed))
  if (failed) process.exitCode = 1
  await stopChildren()
}

process.once('SIGINT', () => { requestedStop = true; void stopChildren().then(() => { process.exitCode = 0 }) })
process.once('SIGTERM', () => { requestedStop = true; void stopChildren().then(() => { process.exitCode = 0 }) })

main().catch(async (error) => {
  if (requestedStop) {
    await stopChildren()
    process.exitCode = 0
    return
  }
  process.stderr.write(`RoadSphere local startup failed: ${error instanceof Error ? error.message : String(error)}\n`)
  await stopChildren()
  process.exitCode = 1
})
