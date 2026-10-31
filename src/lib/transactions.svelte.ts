// Prototype ledger store. Shapes follow merton-api's TransactionRequest
// (decimal strings, one cash account per transaction); state lives in memory
// until the screens are wired to /api/v1.

import { add, mul, neg } from './decimal.js';
import { session } from './portfolio.svelte.js';

export type Kind =
	| 'BUY'
	| 'SELL'
	| 'DIVIDEND'
	| 'INTEREST'
	| 'FEE'
	| 'TAX'
	| 'TAX_RETURN'
	| 'DEPOSIT'
	| 'WITHDRAWAL'
	| 'STOCK_SPLIT'
	| 'STOCK_DIVIDEND';

export const KIND_LABEL: Record<Kind, string> = {
	BUY: 'Buy',
	SELL: 'Sell',
	DIVIDEND: 'Dividend',
	INTEREST: 'Interest',
	FEE: 'Fee',
	TAX: 'Tax',
	TAX_RETURN: 'Tax return',
	DEPOSIT: 'Deposit',
	WITHDRAWAL: 'Withdrawal',
	STOCK_SPLIT: 'Split',
	STOCK_DIVIDEND: 'Stock dividend'
};

export const TRADE_KINDS: Kind[] = ['BUY', 'SELL'];
export const INCOME_KINDS: Kind[] = ['DIVIDEND', 'INTEREST'];
export const EXPENSE_KINDS: Kind[] = ['FEE', 'TAX', 'TAX_RETURN'];
export const CASH_KINDS: Kind[] = ['DEPOSIT', 'WITHDRAWAL'];
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
	note: string | null;
};

export type TransactionInput = Omit<Transaction, 'id' | 'portfolioId'>;

// Instruments are owned by the user and shared across portfolios (ADR-INST-01).
export const instruments: Instrument[] = $state([
	{
		id: 'i-ptt',
		symbol: 'PTT',
		name: 'PTT PCL',
		assetClass: 'STOCK',
		isin: 'TH0646010015',
		exchange: 'SET',
		quoteCurrency: 'THB'
	},
	{
		id: 'i-advanc',
		symbol: 'ADVANC',
		name: 'Advanced Info Service',
		assetClass: 'STOCK',
		isin: null,
		exchange: 'SET',
		quoteCurrency: 'THB'
	},
	{
		id: 'i-aapl',
		symbol: 'AAPL',
		name: 'Apple Inc',
		assetClass: 'STOCK',
		isin: 'US0378331005',
		exchange: 'NASDAQ',
		quoteCurrency: 'USD'
	},
	{
		id: 'i-voo',
		symbol: 'VOO',
		name: 'Vanguard S&P 500 ETF',
		assetClass: 'ETF',
		isin: null,
		exchange: 'NYSE Arca',
		quoteCurrency: 'USD'
	},
	{
		id: 'i-kusa',
		symbol: 'K-USA-A',
		name: 'K USA Equity Fund',
		assetClass: 'MUTUAL_FUND',
		isin: null,
		exchange: null,
		quoteCurrency: 'THB'
	}
]);

export const cashAccounts: CashAccount[] = $state([
	{ id: 'c-thb', portfolioId: 'p-main', name: 'Broker THB', currency: 'THB' },
	{ id: 'c-usd', portfolioId: 'p-main', name: 'Broker USD', currency: 'USD' },
	{ id: 'c-rmf', portfolioId: 'p-retire', name: 'RMF account', currency: 'THB' }
]);

export function instrumentById(id: string | null): Instrument | undefined {
	return instruments.find((i) => i.id === id);
}

export function cashAccountById(id: string | null): CashAccount | undefined {
	return cashAccounts.find((c) => c.id === id);
}

export function portfolioCashAccounts(): CashAccount[] {
	return cashAccounts.filter((c) => c.portfolioId === session.portfolioId);
}

export function instrumentLabel(i: Instrument): string {
	return i.symbol ?? i.name;
}

let nextId = 100;

const none = {
	quantity: null,
	price: null,
	fee: null,
	tax: null,
	amount: null,
	ratio: null,
	cashInLieuQuantity: null,
	note: null
};

const seed: TransactionInput[] = [
	{
		...none,
		kind: 'DEPOSIT',
		tradeDate: '2026-08-01',
		instrumentId: null,
		cashAccountId: 'c-usd',
		amount: '10000.00'
	},
	{
		...none,
		kind: 'BUY',
		tradeDate: '2026-08-12',
		instrumentId: 'i-aapl',
		cashAccountId: 'c-usd',
		quantity: '40',
		price: '180.25',
		fee: '1.00'
	},
	{
		...none,
		kind: 'FEE',
		tradeDate: '2026-08-31',
		instrumentId: null,
		cashAccountId: 'c-usd',
		amount: '2.00',
		note: 'Custody fee'
	},
	{
		...none,
		kind: 'DEPOSIT',
		tradeDate: '2026-09-01',
		instrumentId: null,
		cashAccountId: 'c-thb',
		amount: '250000.00'
	},
	{
		...none,
		kind: 'BUY',
		tradeDate: '2026-09-01',
		instrumentId: 'i-kusa',
		cashAccountId: 'c-thb',
		quantity: '1023.441',
		price: '19.5419',
		note: 'DCA'
	},
	{
		...none,
		kind: 'BUY',
		tradeDate: '2026-09-02',
		instrumentId: 'i-ptt',
		cashAccountId: 'c-thb',
		quantity: '6000',
		price: '33.75',
		fee: '202.50'
	},
	{
		...none,
		kind: 'BUY',
		tradeDate: '2026-09-02',
		instrumentId: 'i-advanc',
		cashAccountId: 'c-thb',
		quantity: '60',
		price: '242.00',
		fee: '14.52'
	},
	{
		...none,
		kind: 'INTEREST',
		tradeDate: '2026-09-15',
		instrumentId: null,
		cashAccountId: 'c-usd',
		amount: '3.41'
	},
	{
		...none,
		kind: 'SELL',
		tradeDate: '2026-09-20',
		instrumentId: 'i-ptt',
		cashAccountId: 'c-thb',
		quantity: '1000',
		price: '34.50',
		fee: '53.50',
		tax: '3.75'
	},
	{
		...none,
		kind: 'STOCK_SPLIT',
		tradeDate: '2026-10-01',
		instrumentId: 'i-advanc',
		cashAccountId: null,
		ratio: '10:1'
	},
	{
		...none,
		kind: 'DEPOSIT',
		tradeDate: '2026-10-02',
		instrumentId: null,
		cashAccountId: 'c-thb',
		amount: '50000.00',
		note: 'Monthly saving'
	},
	{
		...none,
		kind: 'DIVIDEND',
		tradeDate: '2026-10-15',
		instrumentId: 'i-advanc',
		cashAccountId: 'c-thb',
		amount: '4380.00',
		tax: '438.00'
	},
	{
		...none,
		kind: 'BUY',
		tradeDate: '2026-10-28',
		instrumentId: 'i-voo',
		cashAccountId: 'c-usd',
		quantity: '2',
		price: '531.12',
		fee: '0.62'
	},
	{
		...none,
		kind: 'DEPOSIT',
		tradeDate: '2026-10-05',
		instrumentId: null,
		cashAccountId: 'c-rmf',
		amount: '20000.00'
	}
];

export const ledger = $state({
	items: seed.map((t) => ({
		...t,
		id: `t-${nextId++}`,
		portfolioId: cashAccountById(t.cashAccountId)?.portfolioId ?? 'p-main'
	})) as Transaction[]
});

/** Transactions of the selected portfolio. */
export function portfolioTransactions(): Transaction[] {
	return ledger.items.filter((t) => t.portfolioId === session.portfolioId);
}

export function createTransaction(input: TransactionInput): Transaction {
	const created = { ...input, id: `t-${nextId++}`, portfolioId: session.portfolioId };
	ledger.items.push(created);
	return created;
}

export function updateTransaction(id: string, input: TransactionInput): void {
	const index = ledger.items.findIndex((t) => t.id === id);
	if (index >= 0) ledger.items[index] = { ...ledger.items[index], ...input };
}

export function deleteTransactions(ids: string[]): void {
	ledger.items = ledger.items.filter((t) => !ids.includes(t.id));
}

export function instrumentInUse(id: string): boolean {
	return ledger.items.some((t) => t.instrumentId === id);
}

export function cashAccountInUse(id: string): boolean {
	return ledger.items.some((t) => t.cashAccountId === id);
}

export function portfolioHasHistory(portfolioId: string): boolean {
	return ledger.items.some((t) => t.portfolioId === portfolioId);
}

/** Gross trade value, quantity × price; null for non-trades. */
export function gross(t: Pick<Transaction, 'quantity' | 'price'>): string | null {
	return t.quantity && t.price ? mul(t.quantity, t.price) : null;
}

/** Signed change to the cash account, mirroring the ledger (ADR-TXN-05). */
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
		case 'TAX_RETURN':
		case 'DEPOSIT':
			return t.amount ?? '0';
		case 'STOCK_SPLIT':
		case 'STOCK_DIVIDEND':
			// Only the cash paid in lieu of fractional shares touches cash.
			return t.amount ?? '0';
	}
}

/** Balance of one cash account: the sum of its movements (never stored). */
export function cashBalance(accountId: string): string {
	return add('0', ...ledger.items.filter((t) => t.cashAccountId === accountId).map(cashDelta));
}

export function describe(t: Pick<Transaction, 'kind' | 'instrumentId'>): string {
	const instrument = instrumentById(t.instrumentId);
	return `${KIND_LABEL[t.kind]}${instrument ? ' ' + instrumentLabel(instrument) : ''}`;
}

export function createInstrument(input: Omit<Instrument, 'id'>): Instrument {
	const created = { ...input, id: `i-${nextId++}` };
	instruments.push(created);
	return created;
}

export function updateInstrument(
	id: string,
	input: Omit<Instrument, 'id' | 'quoteCurrency'>
): void {
	const i = instruments.find((x) => x.id === id);
	if (i) Object.assign(i, input);
}

export function deleteInstrument(id: string): void {
	const index = instruments.findIndex((i) => i.id === id);
	if (index >= 0) instruments.splice(index, 1);
}

export function createCashAccount(name: string, currency: string): CashAccount {
	const created = { id: `c-${nextId++}`, portfolioId: session.portfolioId, name, currency };
	cashAccounts.push(created);
	return created;
}

export function renameCashAccount(id: string, name: string): void {
	const c = cashAccounts.find((x) => x.id === id);
	if (c) c.name = name;
}

export function deleteCashAccount(id: string): void {
	const index = cashAccounts.findIndex((c) => c.id === id);
	if (index >= 0) cashAccounts.splice(index, 1);
}
