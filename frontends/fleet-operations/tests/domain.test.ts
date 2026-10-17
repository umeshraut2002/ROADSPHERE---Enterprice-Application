import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateTelemetry, parseTelemetry, projectTelemetryStatus, projectTelemetryVehicle, initialVehicles, type TelemetryReceivedV1 } from '../src/domain.ts'

const validEvent: TelemetryReceivedV1 = {
  eventId: 'evt-001', vehicleId: 'RS-2048', recordedAt: '2026-10-17T08:45:00Z',
  batteryPercent: 64, batteryTemperatureC: 28, speedKph: 54, latitude: 52.52, longitude: 13.405, charging: false,
}

test('accepts a valid synthetic telemetry event', () => {
  assert.deepEqual(parseTelemetry(validEvent), validEvent)
})

test('rejects malformed, out-of-range, or incomplete events', () => {
  assert.throws(() => parseTelemetry(null), /JSON object/)
  assert.throws(() => parseTelemetry({ ...validEvent, batteryPercent: 101 }), /batteryPercent/)
  assert.throws(() => parseTelemetry({ ...validEvent, latitude: 100 }), /latitude/)
  assert.throws(() => parseTelemetry({ ...validEvent, recordedAt: 'tomorrow' }), /recordedAt/)
})

test('evaluates independent battery diagnostic thresholds', () => {
  assert.deepEqual(evaluateTelemetry(validEvent), [])
  assert.equal(evaluateTelemetry({ ...validEvent, batteryTemperatureC: 39 })[0]?.severity, 'ATTENTION')
  assert.deepEqual(evaluateTelemetry({ ...validEvent, batteryTemperatureC: 43, batteryPercent: 12 }).map((alert) => alert.code), ['BATTERY_TEMPERATURE', 'LOW_BATTERY'])
})

test('projects charging before speed, then driving, then parked', () => {
  assert.equal(projectTelemetryStatus({ ...validEvent, charging: true, speedKph: 70 }), 'Charging')
  assert.equal(projectTelemetryStatus(validEvent), 'Driving')
  assert.equal(projectTelemetryStatus({ ...validEvent, speedKph: 1 }), 'Parked')
})

test('updates only the matching vehicle and clears health when telemetry recovers', () => {
  const juniper = initialVehicles.find((vehicle) => vehicle.id === 'RS-2019')!
  const recovery = { ...validEvent, vehicleId: juniper.id, batteryPercent: 50, batteryTemperatureC: 24, speedKph: 0 }
  const projected = projectTelemetryVehicle(juniper, recovery, evaluateTelemetry(recovery))
  assert.equal(projected.health, 'Healthy')
  assert.equal(projected.status, 'Parked')
  assert.equal(projected.battery, 50)
  assert.equal(projected.updated, 'just now')
  assert.equal(projectTelemetryVehicle(juniper, validEvent, []).health, juniper.health)
})
