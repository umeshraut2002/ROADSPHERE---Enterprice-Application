/** Typed API transport. The current portal runs explicitly labelled local demo data until services exist. */
export type ApiError = { status: number; message: string; requestId?: string }

export type VehicleSummary = { id: string; name: string; status: string; batteryPercent: number }
export type ApiVehicle = { id: string; name: string; plate: string; model: string; location: string; health: 'Healthy' | 'Attention' | 'Critical'; status: 'Driving' | 'Parked' | 'Charging' | 'Offline'; batteryPercent: number; rangeKm: number; batteryTemperatureC: number; updatedAt: string }
export type VehicleRegistrationRequest = { ownerId: string; plate: string; make: string; model: string; modelYear: number }
export type VehicleRegistrationResponse = { vehicle: ApiVehicle; registryBacked: boolean }
export type ApiNotification = { id: string; title: string; description: string; kind: 'alert' | 'service' | 'billing'; createdAt: string; vehicleId?: string; read: boolean }
export type TelemetryRequest = { eventId: string; vehicleId: string; recordedAt: string; batteryPercent: number; batteryTemperatureC: number; speedKph: number; latitude: number; longitude: number; charging: boolean }
export type BookingRequest = { vehicleId: string; serviceType: string; scheduledAt: string }
export type TelemetryResponse = {
  eventId: string
  correlationId: string
  status: 'ACCEPTED' | 'DUPLICATE'
  vehicle: { id: string; name: string; health: 'Healthy' | 'Attention' | 'Critical'; status: 'Driving' | 'Parked' | 'Charging'; batteryPercent: number; rangeKm: number; updatedAt: string }
  alerts: { id: string; code: string; severity: 'ATTENTION' | 'CRITICAL'; message: string; vehicleId: string; eventId: string; createdAt: string }[]
}

export class ApiClient {
  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api') {}

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      signal: init?.signal ?? AbortSignal.timeout(4000),
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Partial<ApiError> & { detail?: string }
      throw { status: response.status, message: body.message ?? body.detail ?? `Request failed (${response.status})`, requestId: body.requestId } satisfies ApiError
    }
    return response.json() as Promise<T>
  }
}

export const api = new ApiClient()
