import { toast } from 'svelte-sonner';
import { errorMessage } from './api.js';
import { instrumentById, instrumentLabel } from './transactions.svelte.js';

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Show a failed API call to the user, naming instruments instead of their ids. */
export function toastError(e: unknown) {
	toast.error(
		errorMessage(e).replace(UUID, (id) => {
			const instrument = instrumentById(id);
			return instrument ? instrumentLabel(instrument) : id;
		})
	);
}
