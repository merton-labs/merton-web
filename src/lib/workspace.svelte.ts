// What the signed-in user's screens need, loaded in order: portfolios and
// instruments first, then the selected portfolio's cash accounts and ledger.

import { errorMessage } from './api.js';
import { resetMarketData } from './market-data.svelte.js';
import { loadPortfolios, resetPortfolios, session } from './portfolio.svelte.js';
import { loadInstruments, loadPortfolioLedger, resetLedger } from './transactions.svelte.js';

export const workspace = $state({
	ready: false,
	/** The portfolio whose cash accounts and ledger are loaded. */
	ledgerFor: '',
	error: ''
});

let loading = false;

export async function loadWorkspace() {
	if (loading) return;
	loading = true;
	workspace.error = '';
	try {
		await Promise.all([loadPortfolios(), loadInstruments()]);
		workspace.ready = true;
	} catch (e) {
		workspace.error = errorMessage(e);
	} finally {
		loading = false;
	}
}

export async function loadLedger(portfolioId: string) {
	workspace.ledgerFor = '';
	workspace.error = '';
	try {
		await loadPortfolioLedger(portfolioId);
		if (session.portfolioId === portfolioId) workspace.ledgerFor = portfolioId;
	} catch (e) {
		workspace.error = errorMessage(e);
	}
}

/** Forget everything on sign-out, so the next user starts clean. */
export function resetWorkspace() {
	resetPortfolios();
	resetLedger();
	resetMarketData();
	workspace.ready = false;
	workspace.ledgerFor = '';
	workspace.error = '';
}
