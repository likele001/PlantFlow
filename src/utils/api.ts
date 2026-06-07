export type ApiOk<T> = { success: true; data: T }
export type ApiErr = { success: false; error: string }
export type ApiResponse<T> = ApiOk<T> | ApiErr

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

  const data = (await res.json().catch(() => null)) as ApiResponse<T> | null
  if (!data) {
    return { success: false, error: 'Bad response' }
  }
  return data
}

