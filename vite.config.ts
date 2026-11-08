import tailwindcss from '@tailwindcss/vite';
import nodeAdapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

// `vite build` makes the Node server used by the Docker image. `--mode cloudflare`
// makes a static SPA (pages render on the client anyway) for Cloudflare Workers,
// where cloudflare/worker.js forwards /api to merton-api and serves the files.
const adapter = (mode: string) =>
	mode === 'cloudflare' ? staticAdapter({ fallback: 'index.html' }) : nodeAdapter();

export default defineConfig(({ mode }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(mode)
		})
	],
	server: {
		// Same-origin in dev too: forward API calls to merton-api on its default
		// port 18080. MERTON_API_URL (from the environment or .env) overrides it.
		proxy: {
			'/api': loadEnv(mode, process.cwd(), 'MERTON_').MERTON_API_URL || 'http://127.0.0.1:18080'
		}
	}
}));
