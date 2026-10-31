// Bumped after any write that can change a valuation (transactions, cash
// accounts, prices, FX rates), so pages showing server-computed values refetch.

export const changes = $state({ version: 0 });

export function changed() {
	changes.version++;
}
