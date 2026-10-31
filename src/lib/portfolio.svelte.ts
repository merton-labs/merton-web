// Portfolios from /api/v1/portfolios. Lifecycle rules follow ADR-PORT-03:
// archived portfolios are read-only and can be restored; only portfolios
// without financial history can be deleted (the API answers 409 otherwise).

import { api, listAll } from './api.js';

export type PortfolioStatus = 'ACTIVE' | 'ARCHIVED';

export type Portfolio = {
	id: string;
	name: string;
	baseCurrency: string;
	status: PortfolioStatus;
	createdAt: string;
};

type PortfolioDto = {
	id: string;
	name: string;
	base_currency: string;
	status: PortfolioStatus;
	created_at: string;
};

export const CURRENCY_CODE = /^[A-Z]{3}$/;

const STORAGE_KEY = 'merton.portfolio';

export const portfolios: Portfolio[] = $state([]);

export const session = $state({ portfolioId: stored() });

function stored(): string {
	try {
		return localStorage.getItem(STORAGE_KEY) ?? '';
	} catch {
		return '';
	}
}

function fromDto(p: PortfolioDto): Portfolio {
	return {
		id: p.id,
		name: p.name,
		baseCurrency: p.base_currency,
		status: p.status,
		createdAt: p.created_at.slice(0, 10)
	};
}

function replace(dto: PortfolioDto): Portfolio {
	const p = fromDto(dto);
	const index = portfolios.findIndex((x) => x.id === p.id);
	if (index >= 0) portfolios[index] = p;
	else portfolios.push(p);
	return p;
}

export function selectPortfolio(id: string) {
	session.portfolioId = id;
	try {
		if (id) localStorage.setItem(STORAGE_KEY, id);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Remembering the choice is a convenience only.
	}
}

/**
 * The selected portfolio. Portfolio pages render only when one exists (the
 * layout shows onboarding otherwise), so they may rely on it.
 */
export function currentPortfolio(): Portfolio {
	return portfolios.find((p) => p.id === session.portfolioId)!;
}

export async function loadPortfolios() {
	const items = await listAll<PortfolioDto>('/portfolios');
	portfolios.splice(0, portfolios.length, ...items.map(fromDto));
	if (!portfolios.some((p) => p.id === session.portfolioId)) {
		const first = portfolios.find((p) => p.status === 'ACTIVE') ?? portfolios[0];
		session.portfolioId = first?.id ?? '';
	}
}

export async function createPortfolio(name: string, baseCurrency: string): Promise<Portfolio> {
	const created = replace(
		await api<PortfolioDto>('POST', '/portfolios', { name, base_currency: baseCurrency })
	);
	selectPortfolio(created.id);
	return created;
}

export async function updatePortfolio(id: string, name: string, baseCurrency: string) {
	replace(
		await api<PortfolioDto>('PATCH', `/portfolios/${id}`, { name, base_currency: baseCurrency })
	);
}

export async function setStatus(id: string, status: PortfolioStatus) {
	const action = status === 'ARCHIVED' ? 'archive' : 'restore';
	replace(await api<PortfolioDto>('POST', `/portfolios/${id}/${action}`));
}

export async function deletePortfolio(id: string) {
	await api<void>('DELETE', `/portfolios/${id}`);
	const index = portfolios.findIndex((p) => p.id === id);
	if (index >= 0) portfolios.splice(index, 1);
	if (session.portfolioId === id) {
		const next = portfolios.find((p) => p.status === 'ACTIVE') ?? portfolios[0];
		selectPortfolio(next?.id ?? '');
	}
}

export function resetPortfolios() {
	portfolios.length = 0;
	selectPortfolio('');
}
