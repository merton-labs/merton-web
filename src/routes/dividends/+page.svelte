<script lang="ts">
	import { resolve } from '$app/paths';
	import { BarChart } from 'layerchart';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { add } from '#lib/decimal.js';
	import { money, today } from '#lib/format.js';
	import { currentPortfolio } from '#lib/portfolio.svelte.js';
	import { ASSET_CLASS_LABEL } from '#lib/transactions.svelte.js';
	import { live } from '#lib/live.svelte.js';
	import { UNVALUED_LABEL } from '#lib/valuation.svelte.js';
	import {
		fetchDividends,
		monthLabel,
		monthsBetween,
		periodRange,
		type Period
	} from '#lib/dividends.js';

	const MONTHS = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	const TOP_SOURCES = 25;

	const portfolio = $derived(currentPortfolio());
	const base = $derived(portfolio.baseCurrency);
	const now = today();

	let period = $state<Period>('ttm');
	let frequency = $state<'monthly' | 'annual'>('monthly');
	let grouping = $state<'holdings' | 'classes' | 'currencies'>('holdings');

	const range = $derived(periodRange(period, now));
	// All time feeds the year list and Dividend growth; the period feeds everything else.
	const allTime = live(() => fetchDividends(portfolio.id));
	const selected = live(() => fetchDividends(portfolio.id, { from: range.from, to: range.to }));
	const d = $derived(selected.value);

	const years = $derived(
		[...new Set((allTime.value?.months ?? []).map((m) => m.month.slice(0, 4)))]
			.toSorted()
			.toReversed()
	);
	const PERIOD_LABEL: Record<string, string> = {
		all: 'All time',
		ytd: 'Year to date',
		ttm: '12 trailing months'
	};
	const periodLabel = (p: string) => PERIOD_LABEL[p] ?? p;

	// Geometry needs numbers; tooltips and labels keep the exact strings.
	const receivedBars = $derived.by(() => {
		const months = d?.months ?? [];
		const byMonth = new Map(months.map((m) => [m.month, m.received]));
		const all =
			range.months ?? (months.length ? monthsBetween(months[0].month, now.slice(0, 7)) : []);
		if (frequency === 'annual') {
			// Local scratch map inside a derived; not reactive state.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const byYear = new Map<string, string>();
			for (const month of all) {
				const year = month.slice(0, 4);
				byYear.set(year, add(byYear.get(year) ?? '0', byMonth.get(month) ?? '0'));
			}
			return [...byYear].map(([label, exact]) => ({ label, amount: Number(exact), exact }));
		}
		return all.map((month) => {
			const exact = byMonth.get(month) ?? '0';
			return { label: monthLabel(month), amount: Number(exact), exact };
		});
	});

	// As in Snowball, this breakdown covers the whole life of the portfolio.
	const groupBars = $derived.by(() => {
		const d = allTime.value;
		if (!d) return [];
		if (grouping === 'classes')
			return d.classes.map((c) => ({
				label: ASSET_CLASS_LABEL[c.assetClass],
				amount: Number(c.received),
				exact: c.received
			}));
		if (grouping === 'currencies')
			return d.currencies.map((c) => ({
				label: c.currency,
				amount: Number(c.received),
				exact: c.received
			}));
		return d.sources.slice(0, TOP_SOURCES).map((s) => ({
			label: s.symbol ?? s.name,
			amount: Number(s.received),
			exact: s.received
		}));
	});

	// Dividend growth: each calendar month, one bar per year, for the last three years as in Snowball.
	const growthYears = $derived(years.toReversed().slice(-3));
	const growthBars = $derived.by(() => {
		const byMonth = new Map((allTime.value?.months ?? []).map((m) => [m.month, m.received]));
		return MONTHS.map((label, i) => {
			const row: Record<string, string | number> = { label };
			for (const year of growthYears) {
				row[`y${year}`] = Number(byMonth.get(`${year}-${String(i + 1).padStart(2, '0')}`) ?? 0);
			}
			return row;
		});
	});
	const growthSeries = $derived(
		// The theme's chart colours are greys: spread the years from light (oldest) to dark.
		growthYears.map((year, i) => ({
			key: `y${year}`,
			label: year,
			color: `var(--chart-${[1, 3, 5][i + 3 - growthYears.length]})`
		}))
	);
	const growthConfig = $derived(
		Object.fromEntries(
			growthSeries.map((s) => [s.key, { label: s.label, color: s.color }])
		) satisfies Chart.ChartConfig
	);
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Dividends</h1>
		<p class="text-sm text-muted-foreground">
			Dividends and interest received, after tax and fees, in {base}. Each payment is converted at
			the FX rate on its own date.
		</p>
	</div>

	{#if selected.error}
		<p class="text-sm text-destructive">{selected.error}</p>
	{/if}

	{#if d?.partial}
		<div class="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm">
			<TriangleAlert class="mt-0.5 size-4 shrink-0" />
			<div class="space-y-1">
				<p class="font-medium">Totals are partial</p>
				<p class="text-muted-foreground">
					These payments have no FX rate on or before their date and are left out.
					<a href={resolve('/market-data')} class="underline">Add FX rates</a>
				</p>
				<ul class="text-muted-foreground">
					{#each d.unconverted as u (u.transactionId)}
						<li>
							{u.tradeDate} · {u.name} · {money(u.received, u.currency)} — {UNVALUED_LABEL[
								u.reason
							]}
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Dividends received</Card.Title>
				<Card.Action class="flex gap-2">
					<Select.Root type="single" bind:value={period}>
						<Select.Trigger size="sm" aria-label="Period">{periodLabel(period)}</Select.Trigger>
						<Select.Content>
							{#each ['all', 'ytd', 'ttm', ...years] as p (p)}
								<Select.Item value={p} label={periodLabel(p)} />
							{/each}
						</Select.Content>
					</Select.Root>
					<Select.Root type="single" bind:value={frequency}>
						<Select.Trigger size="sm" aria-label="Frequency">
							{frequency === 'monthly' ? 'Monthly' : 'Annual'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="monthly" label="Monthly" />
							<Select.Item value="annual" label="Annual" />
						</Select.Content>
					</Select.Root>
				</Card.Action>
				<Card.Description>Total</Card.Description>
				<p class="text-2xl font-semibold tabular-nums">{d ? money(d.total, base) : '—'}</p>
			</Card.Header>
			<Card.Content>
				{#if receivedBars.some((b) => b.amount !== 0)}
					<Chart.Container
						config={{ amount: { label: 'Received', color: 'var(--chart-4)' } }}
						class="h-64 w-full"
					>
						<BarChart
							data={receivedBars}
							x="label"
							axis="x"
							props={{ xAxis: { tickOcclusion: true } }}
							series={[{ key: 'amount', label: `Received (${base})`, color: 'var(--chart-4)' }]}
						>
							{#snippet tooltip()}
								<Chart.Tooltip />
							{/snippet}
						</BarChart>
					</Chart.Container>
				{:else}
					<p class="py-24 text-center text-sm text-muted-foreground">
						{selected.loading ? 'Loading…' : 'No dividends in this period'}
					</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Dividends received</Card.Title>
				<Card.Description>All time, by {grouping}</Card.Description>
				<Card.Action>
					<Select.Root type="single" bind:value={grouping}>
						<Select.Trigger size="sm" aria-label="Group by">
							{grouping === 'holdings'
								? 'Holdings'
								: grouping === 'classes'
									? 'Classes'
									: 'Currencies'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="holdings" label="Holdings" />
							<Select.Item value="classes" label="Classes" />
							<Select.Item value="currencies" label="Currencies" />
						</Select.Content>
					</Select.Root>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				{#if groupBars.length > 0}
					<Chart.Container
						config={{ amount: { label: 'Received', color: 'var(--chart-2)' } }}
						class="h-64 w-full"
					>
						<BarChart
							data={groupBars}
							x="label"
							axis="x"
							padding={{ bottom: 48 }}
							props={{ xAxis: { tickLabelProps: { rotate: -45, textAnchor: 'end' } } }}
							series={[{ key: 'amount', label: `Received (${base})`, color: 'var(--chart-2)' }]}
						>
							{#snippet tooltip()}
								<Chart.Tooltip />
							{/snippet}
						</BarChart>
					</Chart.Container>
					{#if grouping === 'holdings' && (allTime.value?.sources.length ?? 0) > TOP_SOURCES}
						<p class="text-xs text-muted-foreground">The {TOP_SOURCES} largest are shown.</p>
					{/if}
				{:else}
					<p class="py-24 text-center text-sm text-muted-foreground">
						{selected.loading ? 'Loading…' : 'No dividends in this period'}
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	{#if d && d.sources.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>By holding</Card.Title>
				<Card.Description>{periodLabel(period)}</Card.Description>
			</Card.Header>
			<Card.Content>
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b text-left text-muted-foreground">
							<th class="py-2 font-medium">Holding</th>
							<th class="py-2 font-medium">Class</th>
							<th class="py-2 font-medium">Paid in</th>
							<th class="py-2 text-right font-medium">Received ({base})</th>
						</tr>
					</thead>
					<tbody>
						{#each d.sources as s (s.id)}
							<tr class="border-b last:border-0">
								<td class="py-2">
									<div class="font-medium">{s.name}</div>
									{#if s.symbol}<div class="text-xs text-muted-foreground">{s.symbol}</div>{/if}
								</td>
								<td class="py-2">{ASSET_CLASS_LABEL[s.assetClass ?? 'CASH']}</td>
								<td class="py-2">{s.currency}</td>
								<td class="py-2 text-right tabular-nums">{money(s.received, base)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Dividend growth</Card.Title>
			<Card.Description>Each month, one bar per year ({base})</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if growthSeries.length > 0}
				<Chart.Container config={growthConfig} class="h-72 w-full">
					<BarChart
						data={growthBars}
						x="label"
						axis="x"
						seriesLayout="group"
						series={growthSeries}
						legend
					>
						{#snippet tooltip()}
							<Chart.Tooltip />
						{/snippet}
					</BarChart>
				</Chart.Container>
			{:else}
				<p class="py-24 text-center text-sm text-muted-foreground">
					{allTime.loading ? 'Loading…' : 'No dividends yet'}
				</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
