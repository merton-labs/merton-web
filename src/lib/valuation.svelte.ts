// Holdings valuation and allocation from GET /portfolios/{id}/valuation and
// /allocation (ADR-VAL-02/06/07). Every number here is the server's.

import { api } from './api.js';
import {
	instrumentById,
	type AssetClass,
	type CashAccount,
	type Instrument
} from './transactions.svelte.js';

export type UnvaluedReason = 'MISSING_PRICE' | 'MISSING_FX_RATE' | 'OUT_OF_RANGE';

export const UNVALUED_LABEL: Record<UnvaluedReason, string> = {
	MISSING_PRICE: 'No price on or before the valuation date',
	MISSING_FX_RATE: 'No FX rate on or before the valuation date',
	OUT_OF_RANGE: 'Value too large to represent'
};

export type Quote = { value: string; date: string; stale: boolean };

export type ValuedPosition = {
	instrument: Instrument;
	quantity: string;
	/** In the instrument's quote currency (FIFO, from the ledger). */
	costBasis: string;
	price: Quote | null;
	marketValue: string | null;
	fx: Quote | null;
	/** In the portfolio's base currency. */
	value: string | null;
	unvaluedReason: UnvaluedReason | null;
};

export type ValuedCash = {
	account: CashAccount;
	balance: string;
	fx: Quote | null;
	value: string | null;
	unvaluedReason: UnvaluedReason | null;
};

export type Valuation = {
	asOf: string;
	baseCurrency: string;
	partial: boolean;
	positionsValue: string;
	cashValue: string;
	netValue: string;
	positions: ValuedPosition[];
	cash: ValuedCash[];
};

export type ClassShare = { assetClass: AssetClass | 'CASH'; value: string; percent: string | null };

export type Allocation = {
	classes: ClassShare[];
	netValue: string;
	negativeCash: boolean;
	partial: boolean;
};

type FxQuoteDto = { rate: string; date: string; stale: boolean };

type ValuationDto = {
	as_of: string;
	base_currency: string;
	partial: boolean;
	positions_value: string;
	cash_value: string;
	net_value: string;
	portfolio_id: string;
	positions: {
		instrument_id: string;
		name: string;
		symbol?: string | null;
		asset_class: AssetClass;
		quote_currency: string;
		quantity: string;
		cost_basis: string;
		price?: { price: string; date: string; stale: boolean } | null;
		market_value?: string | null;
		fx?: FxQuoteDto | null;
		value?: string | null;
		unvalued_reason?: UnvaluedReason | null;
	}[];
	cash: {
		cash_account_id: string;
		name: string;
		currency: string;
		balance: string;
		fx?: FxQuoteDto | null;
		value?: string | null;
		unvalued_reason?: UnvaluedReason | null;
	}[];
};

type AllocationDto = {
	classes: { asset_class: AssetClass | 'CASH'; value: string; percent?: string | null }[];
	net_value: string;
	negative_cash: boolean;
	partial: boolean;
};

const fxQuote = (fx?: FxQuoteDto | null): Quote | null =>
	fx ? { value: fx.rate, date: fx.date, stale: fx.stale } : null;

export async function fetchValuation(portfolioId: string, asOf: string): Promise<Valuation> {
	const v = await api<ValuationDto>(
		'GET',
		`/portfolios/${portfolioId}/valuation?as_of=${encodeURIComponent(asOf)}`
	);
	return {
		asOf: v.as_of,
		baseCurrency: v.base_currency,
		partial: v.partial,
		positionsValue: v.positions_value,
		cashValue: v.cash_value,
		netValue: v.net_value,
		positions: v.positions.map((p) => ({
			// The position carries the instrument's fields; prefer the full record when loaded.
			instrument: instrumentById(p.instrument_id) ?? {
				id: p.instrument_id,
				name: p.name,
				symbol: p.symbol ?? null,
				assetClass: p.asset_class,
				quoteCurrency: p.quote_currency,
				isin: null,
				exchange: null
			},
			quantity: p.quantity,
			costBasis: p.cost_basis,
			price: p.price ? { value: p.price.price, date: p.price.date, stale: p.price.stale } : null,
			marketValue: p.market_value ?? null,
			fx: fxQuote(p.fx),
			value: p.value ?? null,
			unvaluedReason: p.unvalued_reason ?? null
		})),
		cash: v.cash.map((c) => ({
			account: { id: c.cash_account_id, portfolioId, name: c.name, currency: c.currency },
			balance: c.balance,
			fx: fxQuote(c.fx),
			value: c.value ?? null,
			unvaluedReason: c.unvalued_reason ?? null
		}))
	};
}

export async function fetchAllocation(portfolioId: string, asOf: string): Promise<Allocation> {
	const a = await api<AllocationDto>(
		'GET',
		`/portfolios/${portfolioId}/allocation?as_of=${encodeURIComponent(asOf)}`
	);
	return {
		classes: a.classes.map((c) => ({
			assetClass: c.asset_class,
			value: c.value,
			percent: c.percent ?? null
		})),
		netValue: a.net_value,
		negativeCash: a.negative_cash,
		partial: a.partial
	};
}

/** A placeholder while the first valuation loads. */
export function emptyValuation(baseCurrency: string, asOf: string): Valuation {
	return {
		asOf,
		baseCurrency,
		partial: false,
		positionsValue: '0',
		cashValue: '0',
		netValue: '0',
		positions: [],
		cash: []
	};
}
