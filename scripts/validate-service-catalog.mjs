import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const servicesRoot = path.join(root, 'services')
const errors = []
const requiredFields = [
  'name', 'port', 'api_prefix', 'owner', 'responsibility',
  'upstream_dependencies', 'downstream_dependencies', 'produces_events',
  'consumes_events', 'data_ownership', 'implementation_status',
]

function fail(message) {
  errors.push(message)
}

function parseManifest(source, file) {
  const fields = new Map()
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf(':')
    if (separator < 1) {
      fail(`${file}:${index + 1}: expected a key and scalar value.`)
      continue
    }
    const key = trimmed.slice(0, separator).trim()
    const rawValue = trimmed.slice(separator + 1).trim()
    let value = rawValue
    if (rawValue.startsWith('"')) {
      try { value = JSON.parse(rawValue) }
      catch { fail(`${file}:${index + 1}: invalid quoted string.`) }
    }
    if (fields.has(key)) fail(`${file}:${index + 1}: duplicate field '${key}'.`)
    fields.set(key, value)
  }
  for (const field of requiredFields) if (!fields.has(field)) fail(`${file}: missing required field '${field}'.`)
  for (const key of fields.keys()) if (!requiredFields.includes(key)) fail(`${file}: unknown field '${key}'.`)
  return Object.fromEntries(fields)
}

function parseCsvLine(line) {
  const values = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"'
      index += 1
    } else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) {
      values.push(value)
      value = ''
    } else value += character
  }
  if (quoted) fail('services/dependency-matrix.csv: unclosed quoted field.')
  values.push(value)
  return values
}

function splitList(value) {
  return value === 'None' ? [] : value.split(',').map((item) => item.trim()).filter(Boolean)
}

const directories = (await readdir(servicesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name !== 'local-demo-api')
  .map((entry) => entry.name)
  .sort()

const manifests = []
for (const directory of directories) {
  const manifestPath = path.join(servicesRoot, directory, 'service.yaml')
  let manifest
  try { manifest = parseManifest(await readFile(manifestPath, 'utf8'), path.relative(root, manifestPath)) }
  catch (error) {
    fail(`${path.relative(root, manifestPath)}: ${error.code === 'ENOENT' ? 'manifest is missing.' : error.message}`)
    continue
  }
  manifests.push(manifest)
  const relative = path.relative(root, path.join(servicesRoot, directory))
  if (manifest.name !== directory) fail(`${relative}: manifest name '${manifest.name}' does not match its directory.`)
  if (!['planned', 'in-progress', 'implemented'].includes(manifest.implementation_status)) {
    fail(`${relative}: implementation_status must be planned, in-progress, or implemented.`)
  }
  if (!manifest.owner || !manifest.responsibility || !manifest.data_ownership) fail(`${relative}: owner, responsibility, and data ownership must be documented.`)
  const port = Number(manifest.port)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail(`${relative}: port must be an integer between 1024 and 65535.`)
  if (!/^\/api\/v1\/[a-z0-9-]+$/.test(manifest.api_prefix)) fail(`${relative}: api_prefix must be a lowercase versioned API path.`)
  for (const field of ['upstream_dependencies', 'downstream_dependencies']) {
    for (const dependency of splitList(manifest[field])) {
      if (dependency === manifest.name) fail(`${relative}: ${field} cannot reference the service itself.`)
    }
  }
  for (const field of ['produces_events', 'consumes_events']) {
    for (const event of splitList(manifest[field])) {
      if (!/^[A-Z][A-Za-z]+\.v\d+$/.test(event)) fail(`${relative}: ${field} contains invalid versioned event '${event}'.`)
    }
  }
  for (const file of ['README.md', 'service.yaml']) {
    try { await readFile(path.join(servicesRoot, directory, file)) }
    catch { fail(`${relative}: required ${file} is missing.`) }
  }
}

if (manifests.length !== 25) fail(`Expected 25 target service manifests, found ${manifests.length}.`)
const names = new Set(manifests.map((manifest) => manifest.name))
const ports = new Map()
const prefixes = new Map()
for (const manifest of manifests) {
  const port = String(manifest.port)
  if (ports.has(port)) fail(`Port ${port} is shared by ${ports.get(port)} and ${manifest.name}.`)
  else ports.set(port, manifest.name)
  if (prefixes.has(manifest.api_prefix)) fail(`API prefix ${manifest.api_prefix} is shared by ${prefixes.get(manifest.api_prefix)} and ${manifest.name}.`)
  else prefixes.set(manifest.api_prefix, manifest.name)
  for (const field of ['upstream_dependencies', 'downstream_dependencies']) {
    for (const dependency of splitList(manifest[field])) if (!names.has(dependency)) fail(`${manifest.name}: ${field} references unknown service '${dependency}'.`)
  }
}

const csvPath = path.join(servicesRoot, 'dependency-matrix.csv')
const csvLines = (await readFile(csvPath, 'utf8')).trim().split(/\r?\n/)
const expectedHeaders = ['Service', 'Port', 'ApiPrefix', 'Upstream', 'Downstream', 'Produces', 'Consumes']
const headers = parseCsvLine(csvLines.shift() ?? '')
if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) fail('services/dependency-matrix.csv: header does not match the expected catalog columns.')
const matrix = new Map()
for (const [index, line] of csvLines.entries()) {
  const row = parseCsvLine(line)
  if (row.length !== expectedHeaders.length) {
    fail(`services/dependency-matrix.csv:${index + 2}: expected ${expectedHeaders.length} columns, found ${row.length}.`)
    continue
  }
  const [name, port, prefix, upstream, downstream, produces, consumes] = row
  if (matrix.has(name)) fail(`services/dependency-matrix.csv:${index + 2}: duplicate service '${name}'.`)
  matrix.set(name, { port, prefix, upstream, downstream, produces, consumes })
}
if (matrix.size !== manifests.length) fail(`Dependency matrix has ${matrix.size} services, expected ${manifests.length}.`)
for (const manifest of manifests) {
  const row = matrix.get(manifest.name)
  if (!row) {
    fail(`services/dependency-matrix.csv: missing ${manifest.name}.`)
    continue
  }
  const expected = {
    port: String(manifest.port),
    prefix: manifest.api_prefix,
    upstream: manifest.upstream_dependencies,
    downstream: manifest.downstream_dependencies,
    produces: manifest.produces_events,
    consumes: manifest.consumes_events,
  }
  for (const [column, value] of Object.entries(expected)) {
    if (row[column] !== value) fail(`${manifest.name}: dependency matrix ${column} '${row[column]}' does not match manifest '${value}'.`)
  }
}

const catalog = await readFile(path.join(root, 'docs/service-catalog.md'), 'utf8')
const documented = [...catalog.matchAll(/^\|\s*\d+\s*\|\s*([a-z0-9-]+)\s*\|/gm)].map((match) => match[1]).sort()
if (JSON.stringify(documented) !== JSON.stringify([...names].sort())) fail('docs/service-catalog.md: listed services do not match the target manifests.')

if (errors.length) {
  process.stderr.write(`Service catalog validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n`)
  for (const error of errors) process.stderr.write(`- ${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Service catalog validation passed: ${manifests.length} target service manifests, valid implementation states, unique ports and API prefixes, valid dependency references, and matching CSV/docs inventory.\n`)
}
