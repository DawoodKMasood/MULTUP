export function getXsrfToken(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export function buildJsonHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getXsrfToken();
    if (token) {
        headers['X-XSRF-TOKEN'] = token;
    }
    return headers;
}

export async function jsonFetch<T>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
    const headers = { ...buildJsonHeaders(), ...(init.headers || {}) } as Record<string, string>;
    const response = await fetch(input, {
        credentials: 'same-origin',
        ...init,
        headers,
    });

    if (!response.ok) {
        let message = 'Request failed';
        try {
            const err = await response.json();
            message = err.error || message;
        } catch {
        }
        throw new Error(message);
    }

    return response.json() as Promise<T>;
}
