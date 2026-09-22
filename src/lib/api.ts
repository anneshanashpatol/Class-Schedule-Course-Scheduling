export class ApiError extends Error {
  constructor(message: string, public code = 'UNKNOWN', public details?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string; code?: string; details?: unknown } };
  if (!response.ok) throw new ApiError(body.error?.message ?? '请求失败，请稍后重试', body.error?.code, body.error?.details);
  return body.data as T;
}

export function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}
