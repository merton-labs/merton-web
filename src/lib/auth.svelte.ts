// Session state from /api/v1/auth. The API is the only judge of who is signed
// in: the cookie is HttpOnly, so the browser learns it from GET /auth/me.

import { ApiError, api, clearCsrfToken, onUnauthorized } from './api.js';

export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 128;

export interface User {
	id: string;
	email: string;
}

export const auth = $state<{ user: User | null; ready: boolean }>({ user: null, ready: false });

onUnauthorized(() => {
	clearCsrfToken();
	auth.user = null;
});

/** Ask the API who is signed in. A failure of any kind means signed out. */
export async function loadSession() {
	try {
		auth.user = await api<User>('GET', '/auth/me');
	} catch {
		auth.user = null;
	} finally {
		auth.ready = true;
	}
}

export async function login(email: string, password: string) {
	clearCsrfToken();
	auth.user = await api<User>('POST', '/auth/login', { email, password }, { csrf: false });
}

/** Create the account, then sign in: register alone does not open a session. */
export async function register(email: string, password: string) {
	await api<User>('POST', '/auth/register', { email, password }, { csrf: false });
	await login(email, password);
}

export async function logout() {
	try {
		await api<void>('POST', '/auth/logout');
	} catch (e) {
		// Already signed out is fine; anything else still signs out locally.
		if (!(e instanceof ApiError)) throw e;
	} finally {
		clearCsrfToken();
		auth.user = null;
	}
}

/** A user-facing message for a failed login or registration. */
export function authErrorMessage(e: unknown): string {
	if (!(e instanceof ApiError)) return 'Something went wrong. Try again.';
	switch (e.code) {
		case 'invalid_credentials':
			return 'Incorrect email or password.';
		case 'email_taken':
			return 'An account with this email already exists.';
		case 'rate_limited':
			return e.retryAfter
				? `Too many attempts. Try again in ${e.retryAfter} seconds.`
				: 'Too many attempts. Try again later.';
		case 'service_overloaded':
			return 'The server is busy. Try again in a moment.';
		case 'untrusted_origin':
			return 'The server does not accept requests from this address. Open Merton at its configured URL.';
		case 'validation_failed':
			return 'Check the highlighted fields.';
		default:
			return e.detail;
	}
}
