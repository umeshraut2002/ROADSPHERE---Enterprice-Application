import { randomUUID } from 'node:crypto'

export const initialVehicles = [
  { id: 'RS-2048', name: 'Northstar', plate: 'M-TR 4821', model: 'Volvo EX90 · 2025', location: 'Berlin, Mitte', health: 'Healthy', status: 'Driving', batteryPercent: 82, rangeKm: 412, batteryTemperatureC: 28, updatedAt: '2026-10-16T08:43:00Z' },
  { id: 'RS-2037', name: 'Cobalt', plate: 'B-RS 1934', model: 'Polestar 3 · 2025', location: 'Berlin, Kreuzberg', health: 'Attention', status: 'Parked', batteryPercent: 46, rangeKm: 228, batteryTemperatureC: 31, updatedAt: '2026-10-16T08:37:00Z' },
  { id: 'RS-2022', name: 'Atlas', plate: 'HH-VE 7021', model: 'Mercedes EQE SUV · 2024', location: 'Hamburg, HafenCity', health: 'Healthy', status: 'Charging', batteryPercent: 31, rangeKm: 158, batteryTemperatureC: 29, updatedAt: '2026-10-16T08:44:00Z' },
  { id: 'RS-2019', name: 'Juniper', plate: 'F-RS 4418', model: 'BMW iX · 2024', location: 'Frankfurt, Westend', health: 'Critical', status: 'Parked', batteryPercent: 17, rangeKm: 74, batteryTemperatureC: 43, updatedAt: '2026-10-16T08:31:00Z' },
  { id: 'RS-2011', name: 'Saffron', plate: 'M-AB 8510', model: 'Audi Q8 e-tron · 2024', location: 'Munich, Maxvorstadt', health: 'Healthy', status: 'Driving', batteryPercent: 91, rangeKm: 448, batteryTemperatureC: 27, updatedAt: '2026-10-16T08:42:00Z' },
  { id: 'RS-2006', name: 'Monarch', plate: 'S-TR 2082', model: 'Porsche Taycan · 2025', location: 'Stuttgart, Mitte', health: 'Attention', status: 'Offline', batteryPercent: 64, rangeKm: 301, batteryTemperatureC: 30, updatedAt: '2026-10-16T06:45:00Z' },
  { id: 'RS-1998', name: 'Willow', plate: 'D-VE 1196', model: 'Volkswagen ID.7 · 2025', location: 'Düsseldorf, Altstadt', health: 'Healthy', status: 'Parked', batteryPercent: 73, rangeKm: 350, batteryTemperatureC: 26, updatedAt: '2026-10-16T08:34:00Z' },
  { id: 'RS-1984', name: 'Solstice', plate: 'L-RS 6384', model: 'Tesla Model Y · 2024', location: 'Leipzig, Zentrum', health: 'Healthy', status: 'Driving', batteryPercent: 58, rangeKm: 274, batteryTemperatureC: 28, updatedAt: '2026-10-16T08:40:00Z' },
]

export class DomainError extends Error {
  constructor(status, title, detail) {
    super(detail)
    this.status = status
    this.title = title
  }
}

export function validateTelemetry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError(400, 'Invalid telemetry', 'Request body must be a JSON object.')
  const allowed = new Set(['eventId', 'vehicleId', 'recordedAt', 'batteryPercent', 'batteryTemperatureC', 'speedKph', 'latitude', 'longitude', 'charging'])
  const extra = Object.keys(value).filter((key) => !allowed.has(key))
  if (extra.length) throw new DomainError(400, 'Invalid telemetry', `Unexpected field: ${extra[0]}.`)
  for (const [key, limit] of [['eventId', 80], ['vehicleId', 32]]) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > limit) throw new DomainError(400, 'Invalid telemetry', `${key} must be a non-empty string of at most ${limit} characters.`)
  }
  if (typeof value.recordedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value.recordedAt) || !Number.isFinite(Date.parse(value.recordedAt))) {
    throw new DomainError(400, 'Invalid telemetry', 'recordedAt must be an ISO 8601 date-time with a timezone.')
  }
  for (const [key, min, max] of [['batteryPercent', 0, 100], ['batteryTemperatureC', -40, 100], ['speedKph', 0, 260], ['latitude', -90, 90], ['longitude', -180, 180]]) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw new DomainError(400, 'Invalid telemetry', `${key} must be a finite number between ${min} and ${max}.`)
  }
  if (typeof value.charging !== 'boolean') throw new DomainError(400, 'Invalid telemetry', 'charging must be a boolean.')
  return { ...value, eventId: value.eventId.trim(), vehicleId: value.vehicleId.trim() }
}

export function evaluateTelemetry(event) {
  const alerts = []
  if (event.batteryTemperatureC >= 42) alerts.push({ code: 'BATTERY_TEMPERATURE', severity: 'CRITICAL', message: `Battery temperature is ${event.batteryTemperatureC} °C.` })
  else if (event.batteryTemperatureC >= 38) alerts.push({ code: 'BATTERY_TEMPERATURE', severity: 'ATTENTION', message: `Battery temperature is ${event.batteryTemperatureC} °C.` })
  if (event.batteryPercent < 20) alerts.push({ code: 'LOW_BATTERY', severity: 'ATTENTION', message: `Battery level is ${event.batteryPercent}%.` })
  return alerts.map((alert) => ({ ...alert, id: randomUUID(), eventId: event.eventId, vehicleId: event.vehicleId, createdAt: event.recordedAt }))
}

export function projectTelemetry(vehicle, event, alerts) {
  const status = event.charging ? 'Charging' : event.speedKph > 2 ? 'Driving' : 'Parked'
  const previousBattery = Math.max(vehicle.batteryPercent, 1)
  return {
    ...vehicle,
    batteryPercent: event.batteryPercent,
    rangeKm: Math.max(0, Math.round(vehicle.rangeKm * event.batteryPercent / previousBattery)),
    batteryTemperatureC: event.batteryTemperatureC,
    status,
    health: alerts.some((alert) => alert.severity === 'CRITICAL') ? 'Critical' : alerts.length ? 'Attention' : 'Healthy',
    updatedAt: event.recordedAt,
  }
}

export function createState() {
  return {
    vehicles: structuredClone(initialVehicles),
    events: new Map(),
    alerts: [],
    activities: [],
    notifications: [],
    bookings: [],
    invoices: [{ id: 'INV-2026-0425', description: 'Fleet subscription · November', dueAt: '2026-11-01T00:00:00Z', amount: 1240, currency: 'EUR', status: 'OPEN' }],
    paymentAttempts: new Map(),
  }
}
