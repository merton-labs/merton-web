// Cloudflare Worker for the static build (`bun run build:cloudflare`).
//
// It plays the part of deploy/Caddyfile: /api/* goes to merton-api and every
// other path is a file from build/ (wrangler.jsonc serves those directly and
// falls back to index.html for client-side routes). The browser sees one
// origin, so session cookies, the CSRF Origin check and "no CORS" all hold.
//
// API_ORIGIN is the API's base URL, e.g. https://merton-api.up.railway.app,
// set as a variable on the Worker in the Cloudflare dashboard.

export default {
	/**
	 * @param {Request} request
	 * @param {{ API_ORIGIN?: string, ASSETS: { fetch(request: Request): Promise<Response> } }} env
	 */
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
			return env.ASSETS.fetch(request);
		}
		if (!env.API_ORIGIN) {
			return new Response('API_ORIGIN is not set on this Worker.', { status: 503 });
		}
		const target = new URL(url.pathname + url.search, env.API_ORIGIN);
		// Same method, headers (Origin, Cookie, X-CSRF-Token) and body. Redirects
		// go back to the browser rather than being followed here.
		return fetch(new Request(target, request), { redirect: 'manual' });
	}
};
