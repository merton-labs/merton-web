import { errorMessage } from './api.js';
import { changes } from './changes.svelte.js';

/**
 * Server data that reloads when its inputs change or after any write that can
 * change it. `load` must read its reactive inputs before its first await.
 * Call during component initialisation.
 */
export function live<T>(load: () => Promise<T>) {
	const state = $state({ value: null as T | null, error: '', loading: true });
	$effect(() => {
		void changes.version;
		let current = true;
		state.loading = true;
		load()
			.then((value) => {
				if (current) Object.assign(state, { value, error: '' });
			})
			.catch((e) => {
				if (current) state.error = errorMessage(e);
			})
			.finally(() => {
				if (current) state.loading = false;
			});
		return () => {
			current = false;
		};
	});
	return state;
}
