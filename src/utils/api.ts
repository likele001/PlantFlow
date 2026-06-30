export type ApiResponse<T> = { success: boolean; data?: T; error?: string }

export async function apiRequest<T>(
  path: string,
  options?: {
    method?: string
    token?: string | null
    body?: unknown
  },
): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  const raw = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null
  if (!raw) {
    return { success: false, error: 'Bad response' }
  }
  return raw.success
    ? { success: true, data: raw.data as T }
    : { success: false, error: raw.error ?? 'Unknown error' }
}
