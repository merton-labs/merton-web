import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
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
