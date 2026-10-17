import { DomainError } from './domain.mjs'

export function createTelemetryIngestionClient(baseUrl, fetchImpl = fetch) {
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
      throw new DomainError(503, 'Telemetry ingestion unavailable', 'The telemetry ingestion service could not be reached.')
    }
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new DomainError(response.status,
        typeof body.title === 'string' ? body.title : 'Telemetry ingestion request failed',
        typeof body.detail === 'string' ? body.detail : 'The telemetry ingestion service rejected the request.')
    }
    return body
  }

  return {
    async ready() {
      const health = await request('/actuator/health/readiness')
      if (health.status !== 'UP') throw new DomainError(503, 'Telemetry ingestion unavailable', 'The telemetry ingestion service is not ready.')
      return true
    },

    async accept(event, correlationId) {
      return request('/api/v1/telemetry', {
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
