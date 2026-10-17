export type Vehicle = {
  id: string
  name: string
  model: string
  plate: string
  status: 'Driving' | 'Parked' | 'Charging'
  battery: number
  range: number
  health: 'All good' | 'Check soon'
  location: string
}

export type ServiceBooking = {
  id: string
  vehicleId: string
  vehicleName: string
  serviceType: string
  scheduledAt: string
  place: string
  status: 'CONFIRMED'
}

export type DemoPreferences = { service: boolean; charging: boolean; weekly: boolean }

export type CustomerDemoState = {
  vehicles: Vehicle[]
  bookings: ServiceBooking[]
  paid: boolean
  preferences: DemoPreferences
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_KEY = 'roadsphere.customer-demo.v1'
const STATE_VERSION = 1

export const initialVehicles: Vehicle[] = [
  { id: 'RS-2048', name: 'Northstar', model: 'Volvo EX90 · 2025', plate: 'M-TR 4821', status: 'Driving', battery: 82, range: 412, health: 'All good', location: 'Berlin, Mitte' },
  { id: 'RS-2022', name: 'Atlas', model: 'Mercedes EQE SUV · 2024', plate: 'HH-VE 7021', status: 'Charging', battery: 31, range: 158, health: 'All good', location: 'Hamburg, HafenCity' },
  { id: 'RS-2019', name: 'Juniper', model: 'BMW iX · 2024', plate: 'F-RS 4418', status: 'Parked', battery: 17, range: 74, health: 'Check soon', location: 'Frankfurt, Westend' },
]

function localDateAfter(days: number, hour: number, minute: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, 0, 0)
  return date
}

export function dateInputValue(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function validateServiceBooking(vehicleId: string, date: string, bookings: ServiceBooking[], now = new Date()): string | null {
  const scheduledAt = new Date(`${date}T10:30:00`)
  if (!Number.isFinite(scheduledAt.getTime())) return 'Choose a valid appointment date.'
  if (scheduledAt.getTime() <= now.getTime()) return 'Choose a future date; demo appointments start at 10:30.'
  const hasConflict = bookings.some((booking) => booking.vehicleId === vehicleId
    && Math.abs(Date.parse(booking.scheduledAt) - scheduledAt.getTime()) < 30 * 60 * 1000)
  if (hasConflict) return 'This vehicle already has a demo appointment within 30 minutes of that time.'
  return null
}

function defaultBookings(): ServiceBooking[] {
  return [
    { id: 'DEMO-BK-1', vehicleId: 'RS-2048', vehicleName: 'Northstar', serviceType: 'Brake system inspection', scheduledAt: localDateAfter(5, 10, 30).toISOString(), place: 'Berlin Autohaus Mitte', status: 'CONFIRMED' },
    { id: 'DEMO-BK-2', vehicleId: 'RS-2019', vehicleName: 'Juniper', serviceType: 'Battery health check', scheduledAt: localDateAfter(7, 14, 0).toISOString(), place: 'Frankfurt EV Service Center', status: 'CONFIRMED' },
    { id: 'DEMO-BK-3', vehicleId: 'RS-2022', vehicleName: 'Atlas', serviceType: 'Routine annual service', scheduledAt: localDateAfter(12, 9, 15).toISOString(), place: 'Hamburg Mobility Hub', status: 'CONFIRMED' },
  ]
}

export function defaultCustomerDemoState(): CustomerDemoState {
  return {
    vehicles: initialVehicles.map((vehicle) => ({ ...vehicle })),
    bookings: defaultBookings(),
    paid: false,
    preferences: { service: true, charging: true, weekly: false },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isVehicle(value: unknown): value is Vehicle {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && typeof value.name === 'string' && typeof value.model === 'string'
    && typeof value.plate === 'string' && ['Driving', 'Parked', 'Charging'].includes(String(value.status))
    && typeof value.battery === 'number' && value.battery >= 0 && value.battery <= 100
    && typeof value.range === 'number' && value.range >= 0
    && ['All good', 'Check soon'].includes(String(value.health)) && typeof value.location === 'string'
}

function isBooking(value: unknown): value is ServiceBooking {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && typeof value.vehicleId === 'string' && typeof value.vehicleName === 'string'
    && typeof value.serviceType === 'string' && typeof value.scheduledAt === 'string'
    && Number.isFinite(Date.parse(value.scheduledAt)) && typeof value.place === 'string' && value.status === 'CONFIRMED'
}

function isDemoState(value: unknown): value is CustomerDemoState {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.vehicles) || !value.vehicles.every(isVehicle)) return false
  if (!Array.isArray(value.bookings) || !value.bookings.every(isBooking)) return false
  if (typeof value.paid !== 'boolean' || !isRecord(value.preferences)) return false
  return typeof value.preferences.service === 'boolean' && typeof value.preferences.charging === 'boolean'
    && typeof value.preferences.weekly === 'boolean'
}

function browserStorage(): StorageLike | null {
  try { return globalThis.localStorage ?? null }
  catch { return null }
}

export function readCustomerDemoState(storage: StorageLike | null = browserStorage()): CustomerDemoState {
  if (!storage) return defaultCustomerDemoState()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return defaultCustomerDemoState()
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== STATE_VERSION || !isDemoState(parsed.state)) return defaultCustomerDemoState()
    return parsed.state
  } catch {
    return defaultCustomerDemoState()
  }
}

export function writeCustomerDemoState(state: CustomerDemoState, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STATE_VERSION, state }))
    return true
  } catch {
    return false
  }
}
