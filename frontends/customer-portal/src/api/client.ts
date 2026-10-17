/** Browser client for the shared RoadSphere API Gateway. Never store secrets in VITE_* variables. */
export type ApiError = { status: number; message: string; requestId?: string }
export type VehicleSummary = { id: string; name: string; status: string; batteryPercent: number }
export type TelemetryRequest = { eventId: string; vehicleId: string; recordedAt: string; batteryPercent: number; batteryTemperatureC: number; speedKph: number; latitude: number; longitude: number; charging: boolean }
export type BookingRequest = { vehicleId: string; serviceType: string; scheduledAt: string }

export class ApiClient {
  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api') {}

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Partial<ApiError>
      throw { status: response.status, message: body.message ?? `Request failed (${response.status})`, requestId: body.requestId } satisfies ApiError
    }
    return response.json() as Promise<T>
  }
}

export const api = new ApiClient()
