import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultCustomerDemoState, dateInputValue, readCustomerDemoState, validateServiceBooking, writeCustomerDemoState } from '../src/demo-state.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

test('provides synthetic garage and future service appointments on first visit', () => {
  const state = readCustomerDemoState(null)
  assert.equal(state.vehicles.length, 3)
  assert.equal(state.bookings.length, 3)
  assert.ok(state.bookings.every((booking) => Date.parse(booking.scheduledAt) > Date.now()))
  assert.equal(state.paid, false)
})

test('persists and restores customer demo changes under a versioned key', () => {
  const storage = memoryStorage()
  const state = defaultCustomerDemoState()
  state.vehicles.push({ ...state.vehicles[0], id: 'RS-2299', name: 'Aurora' })
  state.paid = true
  state.preferences.weekly = true
  assert.equal(writeCustomerDemoState(state, storage), true)
  const restored = readCustomerDemoState(storage)
  assert.equal(restored.vehicles.length, 4)
  assert.equal(restored.vehicles[3].name, 'Aurora')
  assert.equal(restored.paid, true)
  assert.equal(restored.preferences.weekly, true)
})

test('falls back to safe defaults when stored state is malformed or incompatible', () => {
  const storage = memoryStorage()
  storage.setItem('roadsphere.customer-demo.v1', '{not json')
  assert.equal(readCustomerDemoState(storage).vehicles.length, 3)
  storage.setItem('roadsphere.customer-demo.v1', JSON.stringify({ version: 2, state: defaultCustomerDemoState() }))
  assert.equal(readCustomerDemoState(storage).paid, false)
})

test('formats date inputs in the browser local timezone', () => {
  assert.equal(dateInputValue(new Date(2026, 9, 17, 12)), '2026-10-17')
})

test('rejects past same-day appointments and overlapping demo bookings', () => {
  const now = new Date(2026, 9, 17, 12, 0)
  const sameDay = dateInputValue(now)
  const tomorrow = new Date(2026, 9, 18, 12, 0)
  const futureDate = dateInputValue(tomorrow)
  assert.match(validateServiceBooking('RS-2048', sameDay, [], now) ?? '', /future date/)
  const existing = { ...defaultCustomerDemoState().bookings[0], vehicleId: 'RS-2048', scheduledAt: new Date(`${futureDate}T10:30:00`).toISOString() }
  assert.match(validateServiceBooking('RS-2048', futureDate, [existing], now) ?? '', /already has a demo appointment/)
  assert.equal(validateServiceBooking('RS-2022', futureDate, [existing], now), null)
})
