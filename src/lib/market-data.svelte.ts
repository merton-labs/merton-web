// Prices and FX rates from /api/v1 (ADR-VAL-06): user-entered, owner-scoped,
// one per key and date. The API has no cross-instrument price list, so prices
// are fetched per instrument.

import { api, listAll } from './api.js';
import { changed } from './changes.svelte.js';
import { instruments } from './transactions.svelte.js';

export type Source = 'MANUAL' | 'IMPORT';

export type Price = {
	id: string;
	instrumentId: string;
	priceDate: string;
	price: string;
	source: Source;
};

/** 1 `baseCurrency` = `rate` `quoteCurrency`. */
export type FxRate = {
	id: string;
	baseCurrency: string;
	quoteCurrency: string;
	rateDate: string;
	rate: string;
	source: Source;
};

type PriceDto = {
	id: string;
	instrument_id: string;
	price_date: string;
	price: string;
	source: Source;
};

type FxRateDto = {
	id: string;
	base_currency: string;
	quote_currency: string;
	rate_date: string;
	rate: string;
	source: Source;
};

export const prices: Price[] = $state([]);
export const fxRates: FxRate[] = $state([]);

function priceFromDto(p: PriceDto): Price {
	return {
		id: p.id,
		instrumentId: p.instrument_id,
		priceDate: p.price_date,
		price: p.price,
		source: p.source
	};
}

function fxRateFromDto(r: FxRateDto): FxRate {
	return {
		id: r.id,
		baseCurrency: r.base_currency,
		quoteCurrency: r.quote_currency,
		rateDate: r.rate_date,
		rate: r.rate,
		source: r.source
	};
}

/** Every price of every instrument, and every FX rate. */
export async function loadMarketData() {
	const [priceLists, rates] = await Promise.all([
		Promise.all(instruments.map((i) => listAll<PriceDto>(`/instruments/${i.id}/prices`))),
		listAll<FxRateDto>('/fx-rates')
	]);
	prices.splice(0, prices.length, ...priceLists.flat().map(priceFromDto));
	fxRates.splice(0, fxRates.length, ...rates.map(fxRateFromDto));
}

export async function addPrice(input: Omit<Price, 'id' | 'source'>): Promise<Price> {
	const created = priceFromDto(
		await api<PriceDto>('POST', `/instruments/${input.instrumentId}/prices`, {
			price_date: input.priceDate,
			price: input.price
		})
	);
	prices.push(created);
	changed();
	return created;
}

export async function addFxRate(input: Omit<FxRate, 'id' | 'source'>): Promise<FxRate> {
	const created = fxRateFromDto(
		await api<FxRateDto>('POST', '/fx-rates', {
			base_currency: input.baseCurrency,
			quote_currency: input.quoteCurrency,
			rate_date: input.rateDate,
			rate: input.rate
		})
	);
	fxRates.push(created);
	changed();
	return created;
}

export async function deletePrice(p: Price) {
	await api<void>('DELETE', `/instruments/${p.instrumentId}/prices/${p.id}`);
	const index = prices.findIndex((x) => x.id === p.id);
	if (index >= 0) prices.splice(index, 1);
	changed();
}

export async function deleteFxRate(rateId: string) {
	await api<void>('DELETE', `/fx-rates/${rateId}`);
	const index = fxRates.findIndex((r) => r.id === rateId);
	if (index >= 0) fxRates.splice(index, 1);
	changed();
}

export function latestPrice(instrumentId: string, asOf?: string): Price | undefined {
	return prices
		.filter((p) => p.instrumentId === instrumentId && (!asOf || p.priceDate <= asOf))
		.toSorted((a, b) => b.priceDate.localeCompare(a.priceDate))[0];
}

export function resetMarketData() {
	prices.length = 0;
	fxRates.length = 0;
}
