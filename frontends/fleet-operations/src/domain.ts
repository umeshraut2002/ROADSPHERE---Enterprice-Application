export type VehicleHealth = 'Healthy' | 'Attention' | 'Critical'
export type VehicleStatus = 'Driving' | 'Parked' | 'Charging' | 'Offline'

export type Vehicle = {
  id: string
  name: string
  plate: string
  model: string
  location: string
  health: VehicleHealth
  status: VehicleStatus
  battery: number
  range: number
  odometer: number
  driver: string
  updated: string
  color: string
}

export type Activity = {
  id: string
  title: string
  description: string
  time: string
  kind: 'alert' | 'trip' | 'charge' | 'service'
}

export type TelemetryReceivedV1 = {
  eventId: string
  vehicleId: string
  recordedAt: string
  batteryPercent: number
  batteryTemperatureC: number
  speedKph: number
  latitude: number
  longitude: number
  charging: boolean
}

export type DiagnosticAlert = {
  code: 'BATTERY_TEMPERATURE' | 'LOW_BATTERY'
  severity: 'ATTENTION' | 'CRITICAL'
  vehicleId: string
  eventId: string
  message: string
}

/** Validate the v1 synthetic telemetry contract before accepting an event. */
export function parseTelemetry(input: unknown): TelemetryReceivedV1 {
  if (!input || typeof input !== 'object') throw new Error('Telemetry body must be a JSON object.')
  const value = input as Record<string, unknown>
  const requiredString = (key: string, maxLength: number) => {
    const candidate = value[key]
    if (typeof candidate !== 'string' || candidate.trim().length === 0 || candidate.length > maxLength) {
      throw new Error(`${key} must be a non-empty string of at most ${maxLength} characters.`)
    }
    return candidate.trim()
  }
  const requiredNumber = (key: string, minimum: number, maximum: number) => {
    const candidate = value[key]
    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < minimum || candidate > maximum) {
      throw new Error(`${key} must be a finite number between ${minimum} and ${maximum}.`)
    }
    return candidate
  }
  const recordedAt = requiredString('recordedAt', 40)
  if (!Number.isFinite(Date.parse(recordedAt))) throw new Error('recordedAt must be a valid ISO date/time.')
  if (typeof value.charging !== 'boolean') throw new Error('charging must be a boolean.')
  return {
    eventId: requiredString('eventId', 80),
    vehicleId: requiredString('vehicleId', 32),
    recordedAt,
    batteryPercent: requiredNumber('batteryPercent', 0, 100),
    batteryTemperatureC: requiredNumber('batteryTemperatureC', -40, 100),
    speedKph: requiredNumber('speedKph', 0, 260),
    latitude: requiredNumber('latitude', -90, 90),
    longitude: requiredNumber('longitude', -180, 180),
    charging: value.charging,
  }
}

/** Deterministic synthetic rules; they are illustrative and are not vehicle-safety advice. */
export function evaluateTelemetry(event: TelemetryReceivedV1): DiagnosticAlert[] {
  const alerts: DiagnosticAlert[] = []
  if (event.batteryTemperatureC >= 42) alerts.push({ code: 'BATTERY_TEMPERATURE', severity: 'CRITICAL', vehicleId: event.vehicleId, eventId: event.eventId, message: `Battery temperature is ${event.batteryTemperatureC} °C.` })
  else if (event.batteryTemperatureC >= 38) alerts.push({ code: 'BATTERY_TEMPERATURE', severity: 'ATTENTION', vehicleId: event.vehicleId, eventId: event.eventId, message: `Battery temperature is ${event.batteryTemperatureC} °C.` })
  if (event.batteryPercent < 20) alerts.push({ code: 'LOW_BATTERY', severity: 'ATTENTION', vehicleId: event.vehicleId, eventId: event.eventId, message: `Battery level is ${event.batteryPercent}%.` })
  return alerts
}

export function projectTelemetryStatus(event: TelemetryReceivedV1): VehicleStatus {
  if (event.charging) return 'Charging'
  if (event.speedKph > 2) return 'Driving'
  return 'Parked'
}

/** Apply one accepted telemetry event to its vehicle projection. */
export function projectTelemetryVehicle(vehicle: Vehicle, event: TelemetryReceivedV1, alerts: DiagnosticAlert[]): Vehicle {
  if (vehicle.id !== event.vehicleId) return vehicle
  const critical = alerts.some((alert) => alert.severity === 'CRITICAL')
  const needsAttention = alerts.length > 0
  const estimatedRange = Math.round(vehicle.range * (event.batteryPercent / Math.max(vehicle.battery, 1)))
  return {
    ...vehicle,
    battery: event.batteryPercent,
    range: Math.max(0, estimatedRange),
    status: projectTelemetryStatus(event),
    health: critical ? 'Critical' : needsAttention ? 'Attention' : 'Healthy',
    updated: 'just now',
  }
}

export const initialVehicles: Vehicle[] = [
  { id: 'RS-2048', name: 'Northstar', plate: 'M-TR 4821', model: 'Volvo EX90 · 2025', location: 'Berlin, Mitte', health: 'Healthy', status: 'Driving', battery: 82, range: 412, odometer: 18420, driver: 'Maya Chen', updated: '2 min ago', color: '#75859c' },
  { id: 'RS-2037', name: 'Cobalt', plate: 'B-RS 1934', model: 'Polestar 3 · 2025', location: 'Berlin, Kreuzberg', health: 'Attention', status: 'Parked', battery: 46, range: 228, odometer: 24803, driver: 'Leo Fischer', updated: '8 min ago', color: '#c3a06c' },
  { id: 'RS-2022', name: 'Atlas', plate: 'HH-VE 7021', model: 'Mercedes EQE SUV · 2024', location: 'Hamburg, HafenCity', health: 'Healthy', status: 'Charging', battery: 31, range: 158, odometer: 31604, driver: 'Sofia Weber', updated: '1 min ago', color: '#a6a9b4' },
  { id: 'RS-2019', name: 'Juniper', plate: 'F-RS 4418', model: 'BMW iX · 2024', location: 'Frankfurt, Westend', health: 'Critical', status: 'Parked', battery: 17, range: 74, odometer: 29117, driver: 'Jonas Meyer', updated: '14 min ago', color: '#657a72' },
  { id: 'RS-2011', name: 'Saffron', plate: 'M-AB 8510', model: 'Audi Q8 e-tron · 2024', location: 'Munich, Maxvorstadt', health: 'Healthy', status: 'Driving', battery: 91, range: 448, odometer: 12898, driver: 'Ella Martin', updated: '3 min ago', color: '#a98578' },
  { id: 'RS-2006', name: 'Monarch', plate: 'S-TR 2082', model: 'Porsche Taycan · 2025', location: 'Stuttgart, Mitte', health: 'Attention', status: 'Offline', battery: 64, range: 301, odometer: 8720, driver: 'Noah Klein', updated: '2 hr ago', color: '#8b84aa' },
  { id: 'RS-1998', name: 'Willow', plate: 'D-VE 1196', model: 'Volkswagen ID.7 · 2025', location: 'Düsseldorf, Altstadt', health: 'Healthy', status: 'Parked', battery: 73, range: 350, odometer: 13930, driver: 'Amira Hassan', updated: '11 min ago', color: '#7995a6' },
  { id: 'RS-1984', name: 'Solstice', plate: 'L-RS 6384', model: 'Tesla Model Y · 2024', location: 'Leipzig, Zentrum', health: 'Healthy', status: 'Driving', battery: 58, range: 274, odometer: 22381, driver: 'Emil Bauer', updated: '5 min ago', color: '#be8a83' },
]

export const initialActivity: Activity[] = [
  { id: 'EV-91842', title: 'Battery temperature elevated', description: 'Juniper · Critical diagnostic', time: '09:42', kind: 'alert' },
  { id: 'TR-68109', title: 'Trip completed', description: 'Northstar · 24.8 km · 32 min', time: '09:31', kind: 'trip' },
  { id: 'CH-39104', title: 'Charging session started', description: 'Atlas · Mitte Supercharger', time: '09:22', kind: 'charge' },
  { id: 'MT-10873', title: 'Service booking confirmed', description: 'Cobalt · Brake inspection', time: '09:08', kind: 'service' },
]

export const weeklyDistance = [
  { day: 'Mon', distance: 128 }, { day: 'Tue', distance: 176 }, { day: 'Wed', distance: 144 },
  { day: 'Thu', distance: 211 }, { day: 'Fri', distance: 182 }, { day: 'Sat', distance: 97 }, { day: 'Sun', distance: 119 },
]

export const money = (amount: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount)
