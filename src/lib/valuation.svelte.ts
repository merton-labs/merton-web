// STAND-IN for GET /portfolios/{id}/valuation and /allocation. It mirrors the
// response shapes and the documented rules (ADR-VAL-02/06/07: latest quote on
// or before as_of, prices stale after 7 days, FX after 3) so the screens can be
// built now. Delete this file when the screens call the API; the server is
// authoritative for every number here.

import { add, isZero, mul } from './decimal.js';
import { fxRates, latestPrice } from './market-data.svelte.js';
import { currentPortfolio } from './portfolio.svelte.js';
import {
	cashBalance,
	instrumentById,
	portfolioCashAccounts,
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

// Holdings come from FIFO replay on the server; these match the seed ledger.
const POSITIONS: Record<string, { instrumentId: string; quantity: string; costBasis: string }[]> = {
	'p-main': [
		{ instrumentId: 'i-ptt', quantity: '5000', costBasis: '168918.75' },
		{ instrumentId: 'i-advanc', quantity: '600', costBasis: '14534.52' },
		{ instrumentId: 'i-aapl', quantity: '40', costBasis: '7211.00' },
		{ instrumentId: 'i-voo', quantity: '2', costBasis: '1062.86' },
		{ instrumentId: 'i-kusa', quantity: '1023.441', costBasis: '19999.9816779' }
	]
};

function daysBetween(from: string, to: string): number {
	return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

function fxQuote(from: string, to: string, asOf: string): Quote | null {
	const rate = fxRates
		.filter((r) => r.baseCurrency === from && r.quoteCurrency === to && r.rateDate <= asOf)
		.toSorted((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
	return rate
		? { value: rate.rate, date: rate.rateDate, stale: daysBetween(rate.rateDate, asOf) > 3 }
		: null;
}

function toBase(amount: string, currency: string, base: string, asOf: string) {
	if (currency === base) return { fx: null, value: amount, reason: null };
	const fx = fxQuote(currency, base, asOf);
	if (!fx) return { fx: null, value: null, reason: 'MISSING_FX_RATE' as const };
	return { fx, value: mul(amount, fx.value), reason: null };
}

export function valuation(asOf: string): Valuation {
	const portfolio = currentPortfolio();
	const base = portfolio.baseCurrency;

	const positions: ValuedPosition[] = (POSITIONS[portfolio.id] ?? []).flatMap(
		(p): ValuedPosition[] => {
			const instrument = instrumentById(p.instrumentId);
			if (!instrument) return [];
			const px = latestPrice(instrument.id, asOf);
			const price = px
				? { value: px.price, date: px.priceDate, stale: daysBetween(px.priceDate, asOf) > 7 }
				: null;
			if (!price) {
				return [
					{
						instrument,
						...p,
						price,
						marketValue: null,
						fx: null,
						value: null,
						unvaluedReason: 'MISSING_PRICE'
					}
				];
			}
			const marketValue = mul(p.quantity, price.value);
			const { fx, value, reason } = toBase(marketValue, instrument.quoteCurrency, base, asOf);
			return [{ instrument, ...p, price, marketValue, fx, value, unvaluedReason: reason }];
		}
	);

	const cash: ValuedCash[] = portfolioCashAccounts().map((account) => {
		const balance = cashBalance(account.id);
		const { fx, value, reason } = toBase(balance, account.currency, base, asOf);
		return { account, balance, fx, value, unvaluedReason: reason };
	});

	const positionsValue = add('0', ...positions.flatMap((p) => (p.value ? [p.value] : [])));
	const cashValue = add('0', ...cash.flatMap((c) => (c.value ? [c.value] : [])));
	return {
		asOf,
		baseCurrency: base,
		partial: [...positions, ...cash].some((x) => x.unvaluedReason),
		positionsValue,
		cashValue,
		netValue: add(positionsValue, cashValue),
		positions,
		cash
	};
}

/** Signed allocation by asset class; percent is null when net value ≤ 0. */
export function allocation(v: Valuation): ClassShare[] {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local scratch map, not state
	const totals = new Map<AssetClass | 'CASH', string>();
	for (const p of v.positions) {
		if (p.value)
			totals.set(p.instrument.assetClass, add(totals.get(p.instrument.assetClass) ?? '0', p.value));
	}
	if (!isZero(v.cashValue) || v.cash.length > 0) totals.set('CASH', v.cashValue);
	// Mock only: the server computes and rounds these percentages.
	const net = Number(v.netValue);
	return [...totals].map(([assetClass, value]) => ({
		assetClass,
		value,
		percent: net > 0 ? ((Number(value) / net) * 100).toFixed(2) : null
	}));
}
