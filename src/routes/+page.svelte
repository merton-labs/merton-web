<script lang="ts">
	import { resolve } from '$app/paths';
	import { BarChart, PieChart } from 'layerchart';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Clock from '@lucide/svelte/icons/clock';
	import { add } from '#lib/decimal.js';
	import { isNegative, money } from '#lib/format.js';
	import { currentPortfolio } from '#lib/portfolio.svelte.js';
	import {
		ASSET_CLASS_LABEL,
		KIND_LABEL,
		cashAccountById,
		cashDelta,
		describe,
		instrumentLabel,
		portfolioTransactions
	} from '#lib/transactions.svelte.js';
	import { UNVALUED_LABEL, allocation, valuation } from '#lib/valuation.svelte.js';

	let asOf = $state(new Date().toISOString().slice(0, 10));

	const portfolio = $derived(currentPortfolio());
	const base = $derived(portfolio.baseCurrency);
	const v = $derived(valuation(asOf));
	const shares = $derived(allocation(v));

	// Income received over the 12 months up to as_of, gross, per currency.
	const months = $derived.by(() => {
		const [y, m] = asOf.split('-').map(Number);
		return Array.from({ length: 12 }, (_, i) => {
			const d = new Date(Date.UTC(y, m - 1 - (11 - i), 1));
			return d.toISOString().slice(0, 7);
		});
	});

	const income = $derived.by(() => {
		// Local scratch maps inside a derived; not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const byCurrency = new Map<string, Map<string, string>>();
		for (const t of portfolioTransactions()) {
			if ((t.kind !== 'DIVIDEND' && t.kind !== 'INTEREST') || !t.amount) continue;
			const month = t.tradeDate.slice(0, 7);
			if (!months.includes(month) || t.tradeDate > asOf) continue;
			const ccy = cashAccountById(t.cashAccountId)?.currency ?? '';
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const series = byCurrency.get(ccy) ?? new Map<string, string>();
			series.set(month, add(series.get(month) ?? '0', t.amount));
			byCurrency.set(ccy, series);
		}
		return byCurrency;
	});

	const incomeCurrencies = $derived([...income.keys()].toSorted());
	let chartCurrency = $state('');
	const selectedCurrency = $derived(
		incomeCurrencies.includes(chartCurrency) ? chartCurrency : (incomeCurrencies[0] ?? base)
	);

	const incomeTotals = $derived(
		incomeCurrencies.map((c) => ({
			currency: c,
			total: add('0', ...(income.get(c)?.values() ?? []))
		}))
	);

	// Geometry needs numbers; labels keep the exact strings.
	const barData = $derived(
		months.map((month) => {
			const amount = income.get(selectedCurrency)?.get(month) ?? '0';
			const label = new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', {
				month: 'short',
				timeZone: 'UTC'
			});
			return { month: label, amount: Number(amount), exact: amount };
		})
	);

	const pieData = $derived(
		shares
			.filter((s) => Number(s.value) > 0)
			.map((s, i) => ({ ...s, amount: Number(s.value), color: `var(--chart-${(i % 4) + 2})` }))
	);
	const pieConfig = $derived(
		Object.fromEntries(
			pieData.map((s) => [s.assetClass, { label: ASSET_CLASS_LABEL[s.assetClass], color: s.color }])
		) satisfies Chart.ChartConfig
	);

	function itemsIn(assetClass: string): number {
		return assetClass === 'CASH'
			? v.cash.length
			: v.positions.filter((p) => p.instrument.assetClass === assetClass).length;
	}

	type Insight = { title: string; detail: string; stale: boolean; href: '/market-data' | '/cash' };

	const insights = $derived.by(() => {
		const list: Insight[] = [];
		for (const p of v.positions) {
			const name = instrumentLabel(p.instrument);
			if (p.unvaluedReason) {
				list.push({
					title: `${name} is not valued`,
					detail: UNVALUED_LABEL[p.unvaluedReason],
					stale: false,
					href: '/market-data'
				});
			} else if (p.price?.stale) {
				list.push({
					title: `${name} price is stale`,
					detail: `Latest price is from ${p.price.date}`,
					stale: true,
					href: '/market-data'
				});
			}
		}
		for (const c of v.cash) {
			if (c.unvaluedReason) {
				list.push({
					title: `${c.account.name} is not valued`,
					detail: UNVALUED_LABEL[c.unvaluedReason],
					stale: false,
					href: '/market-data'
				});
			} else if (isNegative(c.balance)) {
				list.push({
					title: `${c.account.name} is negative`,
					detail: money(c.balance, c.account.currency),
					stale: false,
					href: '/cash'
				});
			}
		}
		return list;
	});

	const recent = $derived(
		portfolioTransactions()
			.toSorted((a, b) => b.tradeDate.localeCompare(a.tradeDate))
			.slice(0, 5)
	);
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{portfolio.name}</h1>
			<p class="text-sm text-muted-foreground">
				Valued in {base}{v.partial ? ' · partial' : ''}
			</p>
		</div>
		<label class="flex items-center gap-2 text-sm text-muted-foreground">
			As of
			<Input type="date" class="w-40" bind:value={asOf} />
		</label>
	</div>

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<Card.Root>
			<Card.Header>
				<Card.Description>Net value</Card.Description>
				<Card.Title class="text-2xl tabular-nums">{money(v.netValue, base)}</Card.Title>
				<p class="text-xs text-muted-foreground">
					{v.partial ? 'Partial — see insights' : 'Positions + cash'}
				</p>
			</Card.Header>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Description>Positions</Card.Description>
				<Card.Title class="text-2xl tabular-nums">{money(v.positionsValue, base)}</Card.Title>
				<p class="text-xs text-muted-foreground">{v.positions.length} holdings</p>
			</Card.Header>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Description>Cash</Card.Description>
				<Card.Title
					class="text-2xl tabular-nums {isNegative(v.cashValue) ? 'text-destructive' : ''}"
				>
					{money(v.cashValue, base)}
				</Card.Title>
				<p class="text-xs text-muted-foreground">{v.cash.length} accounts</p>
			</Card.Header>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Description>Income received (12 months)</Card.Description>
				{#each incomeTotals as t (t.currency)}
					<Card.Title class="text-2xl tabular-nums">{money(t.total, t.currency)}</Card.Title>
				{:else}
					<Card.Title class="text-2xl tabular-nums">{money('0', base)}</Card.Title>
				{/each}
				<p class="text-xs text-muted-foreground">Dividends and interest, before tax</p>
			</Card.Header>
		</Card.Root>
	</div>

	{#if insights.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>Portfolio insights</Card.Title>
				<Card.Description
					>Things that make the valuation incomplete or worth a look</Card.Description
				>
			</Card.Header>
			<Card.Content class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{#each insights as item, i (i)}
					<a href={resolve(item.href)} class="flex gap-3 rounded-lg border p-3 hover:bg-muted">
						{#if item.stale}
							<Clock class="mt-0.5 size-4 shrink-0" />
						{:else}
							<TriangleAlert class="mt-0.5 size-4 shrink-0" />
						{/if}
						<div>
							<p class="text-sm font-medium">{item.title}</p>
							<p class="text-xs text-muted-foreground">{item.detail}</p>
						</div>
					</a>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="grid gap-4 lg:grid-cols-5">
		<Card.Root class="lg:col-span-2">
			<Card.Header>
				<Card.Title>Allocation</Card.Title>
				<Card.Description>By asset class, signed</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if pieData.length > 0}
					<Chart.Container config={pieConfig} class="mx-auto aspect-square h-56">
						<PieChart data={pieData} key="assetClass" value="amount" c="color" innerRadius={60}>
							{#snippet tooltip()}
								<Chart.Tooltip hideLabel />
							{/snippet}
						</PieChart>
					</Chart.Container>
				{:else}
					<p class="py-16 text-center text-sm text-muted-foreground">Nothing valued yet</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="lg:col-span-3">
			<Card.Content class="pt-2">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b text-left text-muted-foreground">
							<th class="py-2 font-medium">Name</th>
							<th class="py-2 text-right font-medium">Value</th>
							<th class="py-2 text-right font-medium">Allocation</th>
						</tr>
					</thead>
					<tbody>
						{#each shares as s, i (s.assetClass)}
							<tr class="border-b last:border-0">
								<td class="py-3">
									<div class="flex items-center gap-2">
										<span
											class="h-8 w-1 rounded-full"
											style:background-color={`var(--chart-${(i % 4) + 2})`}
										></span>
										<div>
											<div class="font-medium">{ASSET_CLASS_LABEL[s.assetClass]}</div>
											<div class="text-xs text-muted-foreground">
												{itemsIn(s.assetClass)} items
											</div>
										</div>
									</div>
								</td>
								<td
									class="py-3 text-right tabular-nums {isNegative(s.value)
										? 'text-destructive'
										: ''}"
								>
									{money(s.value, base)}
								</td>
								<td class="py-3 text-right tabular-nums">{s.percent ? `${s.percent}%` : '—'}</td>
							</tr>
						{:else}
							<tr
								><td colspan="3" class="py-6 text-center text-muted-foreground">No holdings</td></tr
							>
						{/each}
					</tbody>
				</table>
				{#if shares.some((s) => s.percent === null)}
					<p class="mt-2 text-xs text-muted-foreground">
						Net value is zero or negative, so percentages are not shown.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<div class="grid gap-4 lg:grid-cols-5">
		<Card.Root class="lg:col-span-3">
			<Card.Header>
				<Card.Title>Income received</Card.Title>
				<Card.Description>12 trailing months, gross</Card.Description>
				{#if incomeCurrencies.length > 1}
					<Card.Action>
						<Tabs.Root value={selectedCurrency} onValueChange={(c) => (chartCurrency = c)}>
							<Tabs.List>
								{#each incomeCurrencies as c (c)}
									<Tabs.Trigger value={c}>{c}</Tabs.Trigger>
								{/each}
							</Tabs.List>
						</Tabs.Root>
					</Card.Action>
				{/if}
			</Card.Header>
			<Card.Content>
				<Chart.Container
					config={{ amount: { label: `Income (${selectedCurrency})`, color: 'var(--chart-4)' } }}
					class="h-56 w-full"
				>
					<BarChart
						data={barData}
						x="month"
						axis="x"
						series={[{ key: 'amount', label: selectedCurrency, color: 'var(--chart-4)' }]}
					>
						{#snippet tooltip()}
							<Chart.Tooltip />
						{/snippet}
					</BarChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>

		<Card.Root class="lg:col-span-2">
			<Card.Header>
				<Card.Title>Recent transactions</Card.Title>
				<Card.Action>
					<a href={resolve('/transactions')} class="text-sm text-muted-foreground hover:underline">
						See all
					</a>
				</Card.Action>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#each recent as t (t.id)}
					{@const delta = cashDelta(t)}
					{@const ccy = cashAccountById(t.cashAccountId)?.currency}
					<div class="flex items-center justify-between gap-3 text-sm">
						<div>
							<div class="font-medium">{describe(t)}</div>
							<div class="text-xs text-muted-foreground">{t.tradeDate} · {KIND_LABEL[t.kind]}</div>
						</div>
						<div class="tabular-nums {isNegative(delta) ? 'text-destructive' : ''}">
							{ccy ? `${isNegative(delta) ? '' : '+'}${money(delta, ccy)}` : t.ratio}
						</div>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No transactions yet.</p>
				{/each}
			</Card.Content>
		</Card.Root>
	</div>
</div>
