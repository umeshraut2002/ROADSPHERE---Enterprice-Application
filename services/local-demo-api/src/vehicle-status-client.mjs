import { DomainError } from './domain.mjs'

export function createVehicleStatusClient(baseUrl, fetchImpl = fetch) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return null

  const origin = baseUrl.trim().replace(/\/+$/, '')

  async function request(path, options = {}) {
    let response
    try {
      response = await fetchImpl(`${origin}${path}`, {
        ...options,
        headers: { accept: 'application/json', ...options.headers },
        signal: AbortSignal.timeout(3_000),
      })
    } catch {
      throw new DomainError(503, 'Vehicle status unavailable', 'The local vehicle status service could not be reached.')
    }

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new DomainError(
        response.status,
        typeof body.title === 'string' ? body.title : 'Vehicle status request failed',
        typeof body.detail === 'string' ? body.detail : 'The local vehicle status service rejected the request.',
      )
    }
    return body
  }

  return {
    async ready() {
      const health = await request('/actuator/health/readiness')
      if (health.status !== 'UP') throw new DomainError(503, 'Vehicle status unavailable', 'The local vehicle status service is not ready.')
      return true
    },

    async list(page, size) {
      const result = await request(`/api/v1/vehicle-status?page=${page}&size=${size}`)
      if (!Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0) {
        throw new DomainError(502, 'Invalid vehicle status response', 'The local vehicle status service returned an invalid page.')
      }
      return result
    },

    async listAll() {
      const items = []
      let total = 0
      let page = 0
      do {
        const result = await this.list(page, 100)
        items.push(...result.items)
        total = result.total
        page += 1
        if (page > 1_000) throw new DomainError(502, 'Invalid vehicle status response', 'The local vehicle status service returned too many pages.')
      } while (items.length < total)
      return items
    },

    async get(vehicleId) {
      return request(`/api/v1/vehicle-status/${encodeURIComponent(vehicleId)}`)
    },

    async accept(event, correlationId) {
      return request('/api/v1/vehicle-status/events/telemetry-received', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
        body: JSON.stringify(event),
      })
    },
  }
}
