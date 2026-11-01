// Dividends and interest received, from GET /portfolios/{id}/dividends
// (ADR-DIV-01): after tax and fees, in the portfolio's base currency, each
// payment converted at the FX rate on its own date. Every number is the server's.

import { api } from './api.js';
import type { AssetClass, Kind } from './transactions.svelte.js';
import type { UnvaluedReason } from './valuation.svelte.js';

export type DividendSource = {
	kind: 'INSTRUMENT' | 'CASH_ACCOUNT';
	id: string;
	name: string;
	symbol: string | null;
	assetClass: AssetClass | null;
	/** The currency the payments were made in. */
	currency: string;
	received: string;
};

export type UnconvertedPayment = {
	transactionId: string;
	kind: Kind;
	tradeDate: string;
	name: string;
	currency: string;
	/** In `currency`. */
	received: string;
	reason: UnvaluedReason;
};

export type Dividends = {
	baseCurrency: string;
	partial: boolean;
	total: string;
	/** `YYYY-MM`, oldest first; only months with a payment. */
	months: { month: string; received: string }[];
	sources: DividendSource[];
	classes: { assetClass: AssetClass | 'CASH'; received: string }[];
	currencies: { currency: string; received: string }[];
	unconverted: UnconvertedPayment[];
};

type DividendsDto = {
	base_currency: string;
	partial: boolean;
	total: string;
	months: { month: string; received: string }[];
	sources: {
		kind: 'INSTRUMENT' | 'CASH_ACCOUNT';
		id: string;
		name: string;
		symbol?: string | null;
		asset_class?: AssetClass | null;
		currency: string;
		received: string;
	}[];
	classes: { asset_class: AssetClass | 'CASH'; received: string }[];
	currencies: { currency: string; received: string }[];
	unconverted: {
		transaction_id: string;
		kind: Kind;
		trade_date: string;
		name: string;
		currency: string;
		received: string;
		reason: UnvaluedReason;
	}[];
};

/** Inclusive `YYYY-MM-DD` bounds; either may be open. */
export type DateRange = { from?: string; to?: string };

export async function fetchDividends(
	portfolioId: string,
	range: DateRange = {}
): Promise<Dividends> {
	const query = new URLSearchParams();
	if (range.from) query.set('from', range.from);
	if (range.to) query.set('to', range.to);
	const suffix = query.size ? `?${query}` : '';
	const d = await api<DividendsDto>('GET', `/portfolios/${portfolioId}/dividends${suffix}`);
	return {
		baseCurrency: d.base_currency,
		partial: d.partial,
		total: d.total,
		months: d.months,
		sources: d.sources.map((s) => ({
			kind: s.kind,
			id: s.id,
			name: s.name,
			symbol: s.symbol ?? null,
			assetClass: s.asset_class ?? null,
			currency: s.currency,
			received: s.received
		})),
		classes: d.classes.map((c) => ({ assetClass: c.asset_class, received: c.received })),
		currencies: d.currencies,
		unconverted: d.unconverted.map((u) => ({
			transactionId: u.transaction_id,
			kind: u.kind,
			tradeDate: u.trade_date,
			name: u.name,
			currency: u.currency,
			received: u.received,
			reason: u.reason
		}))
	};
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The last day of a month, `YYYY-MM-DD`. */
function monthEnd(year: number, month: number): string {
	const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${year}-${pad(month)}-${pad(last)}`;
}

/**
 * Calendar months from `first` to `last` (`YYYY-MM`, inclusive), so charts
 * show months without payments as gaps rather than skipping them.
 */
export function monthsBetween(first: string, last: string): string[] {
	const out: string[] = [];
	let [y, m] = first.split('-').map(Number);
	const [ly, lm] = last.split('-').map(Number);
	while (y < ly || (y === ly && m <= lm)) {
		out.push(`${y}-${pad(m)}`);
		m += 1;
		if (m > 12) {
			m = 1;
			y += 1;
		}
	}
	return out;
}

/** Snowball's periods: all time, year to date, 12 trailing months, or one year. */
export type Period = 'all' | 'ytd' | 'ttm' | `${number}`;

/** The dates a period covers, by calendar month, as of `today` (`YYYY-MM-DD`). */
export function periodRange(period: Period, today: string): DateRange & { months?: string[] } {
	const [y, m] = today.split('-').map(Number);
	if (period === 'all') return {};
	if (period === 'ytd') {
		return {
			from: `${y}-01-01`,
			to: monthEnd(y, m),
			months: monthsBetween(`${y}-01`, `${y}-${pad(m)}`)
		};
	}
	if (period === 'ttm') {
		const start = new Date(Date.UTC(y, m - 12, 1));
		const first = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}`;
		return {
			from: `${first}-01`,
			to: monthEnd(y, m),
			months: monthsBetween(first, `${y}-${pad(m)}`)
		};
	}
	const year = Number(period);
	return {
		from: `${year}-01-01`,
		to: monthEnd(year, 12),
		months: monthsBetween(`${year}-01`, `${year}-12`)
	};
}

/** `2026-06` → `Jun 26`, as on Snowball's axis. */
export function monthLabel(month: string): string {
	return new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', {
		month: 'short',
		year: '2-digit',
		timeZone: 'UTC'
	});
}
