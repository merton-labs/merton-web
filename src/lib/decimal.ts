// Exact decimal arithmetic for form previews and summaries, using BigInt.
// The API stays authoritative; this only adds and multiplies, which never
// need rounding, so it cannot invent a financial rule.

/** The API's grammar for a non-negative input (ADR-NUM-04). */
export const DECIMAL_INPUT = /^\d{1,15}(\.\d{1,8})?$/;

type Fixed = { units: bigint; scale: number };

function parse(value: string): Fixed {
	const trimmed = value.trim();
	const negative = trimmed.startsWith('-');
	const [int, frac = ''] = (negative ? trimmed.slice(1) : trimmed).split('.');
	const units = BigInt((int || '0') + frac);
	return { units: negative ? -units : units, scale: frac.length };
}

function rescale(a: Fixed, scale: number): bigint {
	return a.units * 10n ** BigInt(scale - a.scale);
}

function render({ units, scale }: Fixed): string {
	const negative = units < 0n;
	const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
	const int = digits.slice(0, digits.length - scale);
	const frac = scale > 0 ? '.' + digits.slice(-scale) : '';
	return (negative ? '-' : '') + int + frac;
}

export function add(...values: string[]): string {
	const parts = values.map(parse);
	const scale = Math.max(0, ...parts.map((p) => p.scale));
	const units = parts.reduce((sum, p) => sum + rescale(p, scale), 0n);
	return render({ units, scale });
}

export function mul(a: string, b: string): string {
	const x = parse(a);
	const y = parse(b);
	return render({ units: x.units * y.units, scale: x.scale + y.scale });
}

export function neg(value: string): string {
	const p = parse(value);
	return render({ units: -p.units, scale: p.scale });
}

export function isZero(value: string): boolean {
	return parse(value).units === 0n;
}
