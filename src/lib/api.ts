// Client for merton-api, served on the same origin under /api/v1 (no CORS, no
// BFF). The session lives in an HttpOnly cookie the browser sends itself;
// authenticated mutations also carry the session-bound X-CSRF-Token.

const BASE = '/api/v1';
const SAFE_METHODS = new Set(['GET', 'HEAD']);

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface FieldProblem {
	field: string;
	message: string;
}

/** An RFC 9457 problem from the API, or a network failure (status 0). */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly detail: string,
		readonly errors: FieldProblem[] = [],
		readonly retryAfter: number | null = null
	) {
		super(detail);
		this.name = 'ApiError';
	}

	/** The message for one field of a validation_failed problem. */
	field(name: string): string | undefined {
		return this.errors.find((e) => e.field === name)?.message;
	}
}

let csrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

/** Forget the CSRF token; it is bound to the session, so call this on login and logout. */
export function clearCsrfToken() {
	csrfToken = null;
}

/** Called when an authenticated request finds the session gone (401). */
export function onUnauthorized(handler: () => void) {
	unauthorizedHandler = handler;
}

interface Options {
	/** Send X-CSRF-Token. Defaults to true for unsafe methods; login and register need none. */
	csrf?: boolean;
}

export async function api<T>(
	method: Method,
	path: string,
	body?: unknown,
	options: Options = {}
): Promise<T> {
	const csrf = options.csrf ?? !SAFE_METHODS.has(method);
	let response = await send(method, path, body, csrf);
	// The token can go stale (for example after the server's key rotates): refresh once.
	if (csrf && response.status === 403 && (await peekCode(response)) === 'csrf_invalid') {
		clearCsrfToken();
		response = await send(method, path, body, csrf);
	}
	if (!response.ok) {
		const error = await toError(response);
		if (error.code === 'unauthenticated' && !path.startsWith('/auth/')) unauthorizedHandler?.();
		throw error;
	}
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

async function send(method: Method, path: string, body: unknown, csrf: boolean) {
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (csrf) headers['X-CSRF-Token'] = await token();
	try {
		return await fetch(BASE + path, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			credentials: 'same-origin'
		});
	} catch {
		throw new ApiError(0, 'network_error', 'Cannot reach the server. Check that it is running.');
	}
}

async function token(): Promise<string> {
	if (csrfToken) return csrfToken;
	const response = await fetch(`${BASE}/auth/csrf`, { credentials: 'same-origin' });
	if (!response.ok) throw await toError(response);
	csrfToken = ((await response.json()) as { csrf_token: string }).csrf_token;
	return csrfToken;
}

async function peekCode(response: Response): Promise<string | undefined> {
	try {
		return ((await response.clone().json()) as { code?: string }).code;
	} catch {
		return undefined;
	}
}

async function toError(response: Response): Promise<ApiError> {
	const retry = Number(response.headers.get('Retry-After'));
	const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : null;
	try {
		const p = (await response.json()) as {
			code?: string;
			detail?: string;
			errors?: FieldProblem[];
		};
		return new ApiError(
			response.status,
			p.code ?? 'unknown_error',
			p.detail ?? response.statusText,
			p.errors ?? [],
			retryAfter
		);
	} catch {
		return new ApiError(
			response.status,
			'unknown_error',
			`Unexpected response (${response.status})`,
			[],
			retryAfter
		);
	}
}
