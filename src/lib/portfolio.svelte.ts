// Prototype portfolio store, shaped like merton-api's PortfolioResponse.
// Lifecycle rules follow ADR-PORT-03: archived portfolios are read-only and
// can be restored; only portfolios without financial history can be deleted.

import { today } from './format.js';

export type PortfolioStatus = 'ACTIVE' | 'ARCHIVED';

export type Portfolio = {
	id: string;
	name: string;
	baseCurrency: string;
	status: PortfolioStatus;
	createdAt: string;
};

export const CURRENCY_CODE = /^[A-Z]{3}$/;

export const portfolios: Portfolio[] = $state([
	{
		id: 'p-main',
		name: 'Main portfolio',
		baseCurrency: 'THB',
		status: 'ACTIVE',
		createdAt: '2026-01-04'
	},
	{
		id: 'p-retire',
		name: 'Retirement (RMF)',
		baseCurrency: 'THB',
		status: 'ACTIVE',
		createdAt: '2026-03-12'
	},
	{
		id: 'p-old',
		name: 'Old broker',
		baseCurrency: 'USD',
		status: 'ARCHIVED',
		createdAt: '2025-06-30'
	}
]);

export const session = $state({ portfolioId: 'p-main' });

let nextId = 1;

export function currentPortfolio(): Portfolio {
	return portfolios.find((p) => p.id === session.portfolioId) ?? portfolios[0];
}

export function createPortfolio(name: string, baseCurrency: string): Portfolio {
	const created: Portfolio = {
		id: `p-new-${nextId++}`,
		name,
		baseCurrency,
		status: 'ACTIVE',
		createdAt: today()
	};
	portfolios.push(created);
	return created;
}

export function updatePortfolio(id: string, name: string, baseCurrency: string): void {
	const p = portfolios.find((x) => x.id === id);
	if (p && p.status === 'ACTIVE') Object.assign(p, { name, baseCurrency });
}

export function setStatus(id: string, status: PortfolioStatus): void {
	const p = portfolios.find((x) => x.id === id);
	if (p) p.status = status;
}

export function deletePortfolio(id: string): void {
	const index = portfolios.findIndex((p) => p.id === id);
	if (index >= 0) portfolios.splice(index, 1);
	if (session.portfolioId === id) {
		session.portfolioId = portfolios.find((p) => p.status === 'ACTIVE')?.id ?? portfolios[0]?.id;
	}
}
