// Display formatting only. Intl.NumberFormat accepts decimal strings exactly,
// so API values never pass through a JS number.

type Decimal = `${number}`;

/** Currency style when the code is known; a plain number otherwise, so a gap never throws. */
function currencyStyle(currency: string): Intl.NumberFormatOptions {
	return /^[A-Z]{3}$/.test(currency) ? { style: 'currency', currency } : {};
}

export function money(value: string, currency: string): string {
	return new Intl.NumberFormat('en-US', {
		...currencyStyle(currency),
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(value as Decimal);
}

// Unit prices (fund NAVs especially) carry more than two decimals; never round them away.
export function price(value: string, currency: string): string {
	return new Intl.NumberFormat('en-US', {
		...currencyStyle(currency),
		minimumFractionDigits: 2,
		maximumFractionDigits: 8
	}).format(value as Decimal);
}

export function quantity(value: string): string {
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value as Decimal);
}

export function percent(value: string, signed = false): string {
	const formatted = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
		signDisplay: signed ? 'exceptZero' : 'auto'
	}).format(value as Decimal);
	return `${formatted}%`;
}

/** Today's date as `YYYY-MM-DD` (UTC). */
export function today(): string {
	return new Date().toISOString().slice(0, 10);
}

export function isNegative(value: string): boolean {
	return value.trim().startsWith('-');
}
