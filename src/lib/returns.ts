// Returns per holding from GET /portfolios/{id}/returns (ADR-RET-01): capital
// gain, realized P&L, dividends, fees, taxes and total profit in each
// instrument's quote currency, open and sold positions alike. Every number
// is the server's.

import { api } from './api.js';
import type { AssetClass } from './transactions.svelte.js';
import type { Quote, UnvaluedReason } from './valuation.svelte.js';

export type HoldingReturn = {
	instrumentId: string;
	name: string;
	symbol: string | null;
	assetClass: AssetClass;
	/** Every amount below is in this currency. */
	currency: string;
	quantity: string;
	costBasis: string;
	averageCost: string | null;
	price: Quote | null;
	marketValue: string | null;
	capitalGain: string | null;
	capitalGainPercent: string | null;
	realized: string;
	dividends: string;
	fees: string;
	taxes: string;
	totalProfit: string | null;
	totalProfitPercent: string | null;
	unvaluedReason: UnvaluedReason | null;
};

type ReturnsDto = {
	partial: boolean;
	holdings: {
		instrument_id: string;
		name: string;
		symbol?: string | null;
		asset_class: AssetClass;
		quote_currency: string;
		quantity: string;
		cost_basis: string;
		average_cost?: string | null;
		price?: { price: string; date: string; stale: boolean } | null;
		market_value?: string | null;
		capital_gain?: string | null;
		capital_gain_percent?: string | null;
		realized: string;
		dividends: string;
		fees: string;
		taxes: string;
		total_profit?: string | null;
		total_profit_percent?: string | null;
		unvalued_reason?: UnvaluedReason | null;
	}[];
};

export async function fetchReturns(
	portfolioId: string,
	asOf: string
): Promise<{ partial: boolean; holdings: HoldingReturn[] }> {
	const r = await api<ReturnsDto>(
		'GET',
		`/portfolios/${portfolioId}/returns?as_of=${encodeURIComponent(asOf)}`
	);
	return {
		partial: r.partial,
		holdings: r.holdings.map((h) => ({
			instrumentId: h.instrument_id,
			name: h.name,
			symbol: h.symbol ?? null,
			assetClass: h.asset_class,
			currency: h.quote_currency,
			quantity: h.quantity,
			costBasis: h.cost_basis,
			averageCost: h.average_cost ?? null,
			price: h.price ? { value: h.price.price, date: h.price.date, stale: h.price.stale } : null,
			marketValue: h.market_value ?? null,
			capitalGain: h.capital_gain ?? null,
			capitalGainPercent: h.capital_gain_percent ?? null,
			realized: h.realized,
			dividends: h.dividends,
			fees: h.fees,
			taxes: h.taxes,
			totalProfit: h.total_profit ?? null,
			totalProfitPercent: h.total_profit_percent ?? null,
			unvaluedReason: h.unvalued_reason ?? null
		}))
	};
}
