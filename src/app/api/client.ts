/**
 * Обёртка над fetch для API: cookie-сессия (credentials include), CSRF-токен
 * в заголовке всех изменяющих запросов, типизированные ошибки.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

let csrfToken: string | null = null;

/**
 * Разобрать тело как JSON. null — если тело не JSON (например, когда backend
 * не запущен и dev-прокси Vite отдаёт HTML-страницу ошибки). Это отличает
 * «сервер недоступен» от настоящей ошибки приложения.
 */
async function parseJson(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  let res: Response;
  try {
    res = await fetch('/api/csrf', { credentials: 'include' });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = await parseJson(res);
  // Нет валидного JSON с токеном → сервер недоступен, а не ошибка приложения.
  if (!res.ok || !data || typeof data.csrfToken !== 'string') {
    throw new ApiError(res.status, 'network');
  }
  csrfToken = data.csrfToken;
  return csrfToken;
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function api<T>(path: string, { method = 'GET', body }: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrf();
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }

  const data = await parseJson(res);
  if (!res.ok) {
    // Ответ без JSON (HTML-заглушка прокси, 502/504) = сервер недоступен;
    // JSON с кодом ошибки = настоящая ошибка приложения.
    const code = typeof data?.error === 'string' ? data.error : 'network';
    throw new ApiError(res.status, code);
  }
  return (data ?? {}) as T;
}
