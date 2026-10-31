// Prototype prices and FX rates, shaped like merton-api's market-data
// resources (ADR-VAL-06): user-entered, owner-scoped, one per key and date.

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

let nextId = 1;
const id = (prefix: string) => `${prefix}-${nextId++}`;

export const prices: Price[] = $state([
	{
		id: id('px'),
		instrumentId: 'i-ptt',
		priceDate: '2026-10-01',
		price: '33.00',
		source: 'MANUAL'
	},
	{
		id: id('px'),
		instrumentId: 'i-ptt',
		priceDate: '2026-10-30',
		price: '34.25',
		source: 'MANUAL'
	},
	{
		id: id('px'),
		instrumentId: 'i-advanc',
		priceDate: '2026-10-30',
		price: '26.70',
		source: 'MANUAL'
	},
	{
		id: id('px'),
		instrumentId: 'i-aapl',
		priceDate: '2026-10-30',
		price: '231.50',
		source: 'MANUAL'
	},
	{
		id: id('px'),
		instrumentId: 'i-voo',
		priceDate: '2026-10-20',
		price: '531.12',
		source: 'MANUAL'
	}
]);

export const fxRates: FxRate[] = $state([
	{
		id: id('fx'),
		baseCurrency: 'USD',
		quoteCurrency: 'THB',
		rateDate: '2026-10-01',
		rate: '33.42',
		source: 'MANUAL'
	},
	{
		id: id('fx'),
		baseCurrency: 'USD',
		quoteCurrency: 'THB',
		rateDate: '2026-10-30',
		rate: '33.75',
		source: 'MANUAL'
	}
]);

export class DuplicateError extends Error {}

export function addPrice(input: Omit<Price, 'id' | 'source'>): Price {
	if (
		prices.some((p) => p.instrumentId === input.instrumentId && p.priceDate === input.priceDate)
	) {
		throw new DuplicateError('A price for this instrument and date already exists');
	}
	const created = { ...input, id: id('px'), source: 'MANUAL' as const };
	prices.push(created);
	return created;
}

export function addFxRate(input: Omit<FxRate, 'id' | 'source'>): FxRate {
	const clash = fxRates.some(
		(r) =>
			r.baseCurrency === input.baseCurrency &&
			r.quoteCurrency === input.quoteCurrency &&
			r.rateDate === input.rateDate
	);
	if (clash) throw new DuplicateError('A rate for this pair and date already exists');
	const created = { ...input, id: id('fx'), source: 'MANUAL' as const };
	fxRates.push(created);
	return created;
}

export function deletePrice(priceId: string): void {
	const index = prices.findIndex((p) => p.id === priceId);
	if (index >= 0) prices.splice(index, 1);
}

export function deleteFxRate(rateId: string): void {
	const index = fxRates.findIndex((r) => r.id === rateId);
	if (index >= 0) fxRates.splice(index, 1);
}

export function latestPrice(instrumentId: string, asOf?: string): Price | undefined {
	return prices
		.filter((p) => p.instrumentId === instrumentId && (!asOf || p.priceDate <= asOf))
		.toSorted((a, b) => b.priceDate.localeCompare(a.priceDate))[0];
}
