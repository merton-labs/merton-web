// Instruments, cash accounts and the ledger from /api/v1. Field names are the
// API's in camelCase; decimals stay strings. The server is authoritative: a
// mutation sends the request, then stores what the API answered.

import { api, listAll } from './api.js';
import { changed } from './changes.svelte.js';
import { add, mul, neg } from './decimal.js';
import { session } from './portfolio.svelte.js';

export type Kind =
	| 'OPENING_POSITION'
	| 'OPENING_CASH'
	| 'BUY'
	| 'SELL'
	| 'DIVIDEND'
	| 'INTEREST'
	| 'FEE'
	| 'TAX'
	| 'TAX_RETURN'
	| 'DEPOSIT'
	| 'WITHDRAWAL'
	| 'CASH_TRANSFER'
	| 'FX_EXCHANGE'
	| 'STOCK_SPLIT'
	| 'STOCK_DIVIDEND';

export const KIND_LABEL: Record<Kind, string> = {
	OPENING_POSITION: 'Opening position',
	OPENING_CASH: 'Opening balance',
	BUY: 'Buy',
	SELL: 'Sell',
	DIVIDEND: 'Dividend',
	INTEREST: 'Interest',
	FEE: 'Fee',
	TAX: 'Tax',
	TAX_RETURN: 'Tax return',
	DEPOSIT: 'Deposit',
	WITHDRAWAL: 'Withdrawal',
	CASH_TRANSFER: 'Transfer',
	FX_EXCHANGE: 'FX exchange',
	STOCK_SPLIT: 'Split',
	STOCK_DIVIDEND: 'Stock dividend'
};

export const TRADE_KINDS: Kind[] = ['BUY', 'SELL', 'OPENING_POSITION'];
export const INCOME_KINDS: Kind[] = ['DIVIDEND', 'INTEREST'];
export const EXPENSE_KINDS: Kind[] = ['FEE', 'TAX', 'TAX_RETURN'];
export const CASH_KINDS: Kind[] = [
	'DEPOSIT',
	'WITHDRAWAL',
	'OPENING_CASH',
	'CASH_TRANSFER',
	'FX_EXCHANGE'
];
/** Kinds that move cash from one account to another. */
export const TRANSFER_KINDS: Kind[] = ['CASH_TRANSFER', 'FX_EXCHANGE'];
/** Edited on the Corporate actions page, not in the transaction dialog. */
export const CORPORATE_KINDS: Kind[] = ['STOCK_SPLIT', 'STOCK_DIVIDEND'];

export type AssetClass = 'STOCK' | 'ETF' | 'MUTUAL_FUND';

export const ASSET_CLASS_LABEL: Record<AssetClass | 'CASH', string> = {
	STOCK: 'Stocks',
	ETF: 'ETFs',
	MUTUAL_FUND: 'Mutual funds',
	CASH: 'Cash'
};

export type Instrument = {
	id: string;
	symbol: string | null;
	name: string;
	assetClass: AssetClass;
	isin: string | null;
	exchange: string | null;
	quoteCurrency: string;
};

export type CashAccount = { id: string; portfolioId: string; name: string; currency: string };

export type Transaction = {
	id: string;
	portfolioId: string;
	kind: Kind;
	tradeDate: string;
	instrumentId: string | null;
	cashAccountId: string | null;
	quantity: string | null;
	price: string | null;
	fee: string | null;
	tax: string | null;
	amount: string | null;
	/** STOCK_SPLIT only: `new:old`, e.g. `4:1` or `1:10`. */
	ratio: string | null;
	cashInLieuQuantity: string | null;
	/** CASH_TRANSFER and FX_EXCHANGE only. */
	destinationCashAccountId: string | null;
	/** FX_EXCHANGE only: the amount credited, in the destination currency. */
	destinationAmount: string | null;
	note: string | null;
};

export type TransactionInput = Omit<Transaction, 'id' | 'portfolioId'>;

/** Every input field empty, for building a TransactionInput. */
export const EMPTY_FIELDS = {
	instrumentId: null,
	cashAccountId: null,
	quantity: null,
	price: null,
	fee: null,
	tax: null,
	amount: null,
	ratio: null,
	cashInLieuQuantity: null,
	destinationCashAccountId: null,
	destinationAmount: null,
	note: null
} satisfies Partial<TransactionInput>;

type InstrumentDto = {
	id: string;
	symbol?: string | null;
	name: string;
	asset_class: AssetClass;
	isin?: string | null;
	exchange?: string | null;
	quote_currency: string;
};

type CashAccountDto = { id: string; portfolio_id: string; name: string; currency: string };

type TransactionDto = {
	id: string;
	portfolio_id: string;
	kind: Kind;
	trade_date: string;
	instrument_id?: string | null;
	cash_account_id?: string | null;
	quantity?: string | null;
	price?: string | null;
	fee?: string | null;
	tax?: string | null;
	amount?: string | null;
	ratio?: string | null;
	cash_in_lieu_quantity?: string | null;
	destination_cash_account_id?: string | null;
	destination_amount?: string | null;
	note?: string | null;
};

// Instruments are owned by the user and shared across portfolios (ADR-INST-01).
export const instruments: Instrument[] = $state([]);

/** Cash accounts of the selected portfolio. */
export const cashAccounts: CashAccount[] = $state([]);

/** Transactions of the selected portfolio, oldest first as the API returns them. */
export const ledger = $state({ items: [] as Transaction[] });

function instrumentFromDto(i: InstrumentDto): Instrument {
	return {
		id: i.id,
		symbol: i.symbol ?? null,
		name: i.name,
		assetClass: i.asset_class,
		isin: i.isin ?? null,
		exchange: i.exchange ?? null,
		quoteCurrency: i.quote_currency
	};
}

function cashAccountFromDto(c: CashAccountDto): CashAccount {
	return { id: c.id, portfolioId: c.portfolio_id, name: c.name, currency: c.currency };
}

function transactionFromDto(t: TransactionDto): Transaction {
	return {
		id: t.id,
		portfolioId: t.portfolio_id,
		kind: t.kind,
		tradeDate: t.trade_date,
		instrumentId: t.instrument_id ?? null,
		cashAccountId: t.cash_account_id ?? null,
		quantity: t.quantity ?? null,
		price: t.price ?? null,
		fee: t.fee ?? null,
		tax: t.tax ?? null,
		amount: t.amount ?? null,
		ratio: t.ratio ?? null,
		cashInLieuQuantity: t.cash_in_lieu_quantity ?? null,
		destinationCashAccountId: t.destination_cash_account_id ?? null,
		destinationAmount: t.destination_amount ?? null,
		note: t.note ?? null
	};
}

/** The API rejects fields a kind does not accept, so send only the ones that are set. */
function transactionRequest(t: TransactionInput) {
	const fields: Record<string, string | null> = {
		instrument_id: t.instrumentId,
		cash_account_id: t.cashAccountId,
		quantity: t.quantity,
		price: t.price,
		fee: t.fee,
		tax: t.tax,
		amount: t.amount,
		ratio: t.ratio,
		cash_in_lieu_quantity: t.cashInLieuQuantity,
		destination_cash_account_id: t.destinationCashAccountId,
		destination_amount: t.destinationAmount,
		note: t.note
	};
	return {
		kind: t.kind,
		trade_date: t.tradeDate,
		...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null))
	};
}

/** Keep the API's order: trade date, then creation. */
function byTradeDate(a: Transaction, b: Transaction): number {
	return a.tradeDate.localeCompare(b.tradeDate);
}

export function instrumentById(id: string | null): Instrument | undefined {
	return instruments.find((i) => i.id === id);
}

export function cashAccountById(id: string | null): CashAccount | undefined {
	return cashAccounts.find((c) => c.id === id);
}

export function portfolioCashAccounts(): CashAccount[] {
	return cashAccounts;
}

export function instrumentLabel(i: Instrument): string {
	return i.symbol ?? i.name;
}

export async function loadInstruments() {
	const items = await listAll<InstrumentDto>('/instruments');
	instruments.splice(0, instruments.length, ...items.map(instrumentFromDto));
}

/** Load the cash accounts and transactions of one portfolio. */
export async function loadPortfolioLedger(portfolioId: string) {
	const [accounts, transactions] = await Promise.all([
		listAll<CashAccountDto>(`/portfolios/${portfolioId}/cash-accounts`),
		listAll<TransactionDto>(`/portfolios/${portfolioId}/transactions`)
	]);
	// The user may have switched portfolio while this was loading.
	if (session.portfolioId !== portfolioId) return;
	cashAccounts.splice(0, cashAccounts.length, ...accounts.map(cashAccountFromDto));
	ledger.items = transactions.map(transactionFromDto);
}

export function resetLedger() {
	instruments.length = 0;
	cashAccounts.length = 0;
	ledger.items = [];
}

/** Transactions of the selected portfolio. */
export function portfolioTransactions(): Transaction[] {
	return ledger.items;
}

export async function createTransaction(
	portfolioId: string,
	input: TransactionInput
): Promise<Transaction> {
	const created = transactionFromDto(
		await api<TransactionDto>(
			'POST',
			`/portfolios/${portfolioId}/transactions`,
			transactionRequest(input)
		)
	);
	ledger.items = [...ledger.items, created].toSorted(byTradeDate);
	changed();
	return created;
}

export async function updateTransaction(t: Transaction, input: TransactionInput) {
	const updated = transactionFromDto(
		await api<TransactionDto>(
			'PUT',
			`/portfolios/${t.portfolioId}/transactions/${t.id}`,
			transactionRequest(input)
		)
	);
	ledger.items = ledger.items.map((x) => (x.id === t.id ? updated : x)).toSorted(byTradeDate);
	changed();
}

/**
 * Delete one by one; each delete is revalidated against the remaining
 * history. Stops at the first refusal and rethrows it.
 */
export async function deleteTransactions(items: Transaction[]) {
	for (const t of items) {
		await api<void>('DELETE', `/portfolios/${t.portfolioId}/transactions/${t.id}`);
		ledger.items = ledger.items.filter((x) => x.id !== t.id);
		changed();
	}
}

/** Gross trade value, quantity × price; null for non-trades. */
export function gross(t: Pick<Transaction, 'quantity' | 'price'>): string | null {
	return t.quantity && t.price ? mul(t.quantity, t.price) : null;
}

/**
 * Signed change to the transaction's (source) cash account, mirroring the
 * ledger (ADR-TXN-05). For previews and lists only: balances come from the API.
 */
export function cashDelta(t: TransactionInput): string {
	const charges = add(t.fee ?? '0', t.tax ?? '0');
	switch (t.kind) {
		case 'BUY':
			return neg(add(gross(t) ?? '0', charges));
		case 'SELL':
			return add(gross(t) ?? '0', neg(charges));
		case 'DIVIDEND':
		case 'INTEREST':
			return add(t.amount ?? '0', neg(charges));
		case 'FEE':
		case 'TAX':
		case 'WITHDRAWAL':
			return neg(t.amount ?? '0');
		case 'CASH_TRANSFER':
		case 'FX_EXCHANGE':
			return neg(add(t.amount ?? '0', t.fee ?? '0'));
		case 'OPENING_POSITION':
			return '0';
		case 'OPENING_CASH':
		case 'TAX_RETURN':
		case 'DEPOSIT':
			return t.amount ?? '0';
		case 'STOCK_SPLIT':
		case 'STOCK_DIVIDEND':
			// Only the cash paid in lieu of fractional shares touches cash.
			return t.amount ?? '0';
	}
}

export function describe(t: Pick<Transaction, 'kind' | 'instrumentId'>): string {
	const instrument = instrumentById(t.instrumentId);
	return `${KIND_LABEL[t.kind]}${instrument ? ' ' + instrumentLabel(instrument) : ''}`;
}

export async function createInstrument(input: Omit<Instrument, 'id'>): Promise<Instrument> {
	const created = instrumentFromDto(
		await api<InstrumentDto>('POST', '/instruments', {
			asset_class: input.assetClass,
			name: input.name,
			symbol: input.symbol,
			isin: input.isin,
			exchange: input.exchange,
			quote_currency: input.quoteCurrency
		})
	);
	instruments.push(created);
	return created;
}

export async function updateInstrument(
	id: string,
	input: Omit<Instrument, 'id' | 'quoteCurrency'>
) {
	const updated = instrumentFromDto(
		await api<InstrumentDto>('PATCH', `/instruments/${id}`, {
			asset_class: input.assetClass,
			name: input.name,
			symbol: input.symbol,
			isin: input.isin,
			exchange: input.exchange
		})
	);
	const index = instruments.findIndex((i) => i.id === id);
	if (index >= 0) instruments[index] = updated;
}

export async function deleteInstrument(id: string) {
	await api<void>('DELETE', `/instruments/${id}`);
	const index = instruments.findIndex((i) => i.id === id);
	if (index >= 0) instruments.splice(index, 1);
}

export async function createCashAccount(
	portfolioId: string,
	name: string,
	currency: string
): Promise<CashAccount> {
	const created = cashAccountFromDto(
		await api<CashAccountDto>('POST', `/portfolios/${portfolioId}/cash-accounts`, {
			name,
			currency
		})
	);
	cashAccounts.push(created);
	changed();
	return created;
}

export async function renameCashAccount(account: CashAccount, name: string) {
	const updated = cashAccountFromDto(
		await api<CashAccountDto>(
			'PATCH',
			`/portfolios/${account.portfolioId}/cash-accounts/${account.id}`,
			{ name }
		)
	);
	const index = cashAccounts.findIndex((c) => c.id === account.id);
	if (index >= 0) cashAccounts[index] = updated;
}

export async function deleteCashAccount(account: CashAccount) {
	await api<void>('DELETE', `/portfolios/${account.portfolioId}/cash-accounts/${account.id}`);
	const index = cashAccounts.findIndex((c) => c.id === account.id);
	if (index >= 0) cashAccounts.splice(index, 1);
	changed();
}
