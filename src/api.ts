const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

type RequestOptions = RequestInit & {
  json?: unknown
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...init } = options
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: json === undefined ? init.body : JSON.stringify(json),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Error HTTP ${response.status}`)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
