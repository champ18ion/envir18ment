import { config } from '../index.js'

export function getApiUrl(): string {
  return (config.get('apiUrl') as string) ?? 'https://ortq5x07ducezk3kwh3luvwv.187.127.142.231.sslip.io'
}

export function getToken(): string | null {
  return (config.get('token') as string) ?? null
}

export async function apiFetch(path: string, init?: RequestInit) {
  const token = getToken()
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (res.status === 401) {
    console.log('\n  Session expired. Run: e18 login')
    process.exit(1)
  }
  return res
}

export async function resolveEnv(ref: string): Promise<string> {
  const parts = ref.split('/')
  if (parts.length !== 3) throw new Error(`Invalid format. Use: workspace/project/env`)
  const [w, p, e] = parts
  const res = await apiFetch(`/api/resolve?w=${w}&p=${p}&e=${e}`)
  if (!res.ok) {
    const body = await res.json() as { error: string }
    throw new Error(body.error)
  }
  const data = await res.json() as { environmentId: string }
  return data.environmentId
}
