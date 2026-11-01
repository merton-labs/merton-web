<script lang="ts">
	import { resolve } from '$app/paths';
	import { BarChart, PieChart } from 'layerchart';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Clock from '@lucide/svelte/icons/clock';
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
	import { live } from '#lib/live.svelte.js';
	import {
		UNVALUED_LABEL,
		emptyValuation,
		fetchAllocation,
		fetchValuation
	} from '#lib/valuation.svelte.js';
	import { fetchDividends, monthLabel, periodRange } from '#lib/dividends.js';

	let asOf = $state(new Date().toISOString().slice(0, 10));

	const portfolio = $derived(currentPortfolio());
	const base = $derived(portfolio.baseCurrency);
	const valuation = live(() => fetchValuation(portfolio.id, asOf));
	const allocation = live(() => fetchAllocation(portfolio.id, asOf));
	const v = $derived(valuation.value ?? emptyValuation(base, asOf));
	const shares = $derived(allocation.value?.classes ?? []);

	// Dividends received over the 12 trailing months up to as_of, after tax, in
	// the base currency, as on Snowball's dashboard (ADR-DIV-01).
	const trailing = $derived(periodRange('ttm', asOf));
	const dividends = live(() => fetchDividends(portfolio.id, { from: trailing.from, to: asOf }));

	// Geometry needs numbers; labels keep the exact strings.
	const barData = $derived.by(() => {
		const byMonth = new Map((dividends.value?.months ?? []).map((m) => [m.month, m.received]));
		return (trailing.months ?? []).map((month) => {
			const amount = byMonth.get(month) ?? '0';
			return { month: monthLabel(month), amount: Number(amount), exact: amount };
		});
	});

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

	// The API returns the ledger oldest first, so the newest five are the last five reversed.
	const recent = $derived(portfolioTransactions().toReversed().slice(0, 5));
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{portfolio.name}</h1>
			<p class="text-sm text-muted-foreground">
				{#if valuation.error}
					<span class="text-destructive">{valuation.error}</span>
				{:else if !valuation.value}
					Loading valuation…
				{:else}
					Valued in {base}{v.partial ? ' · partial' : ''}
				{/if}
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
				<Card.Description>Dividends received (12 months)</Card.Description>
				<Card.Title class="text-2xl tabular-nums">
					{money(dividends.value?.total ?? '0', base)}
				</Card.Title>
				<p class="text-xs text-muted-foreground">
					After tax{dividends.value?.partial ? ' · partial' : ''} ·
					<a href={resolve('/dividends')} class="hover:underline">Details</a>
				</p>
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
				<Card.Title>Dividends received</Card.Title>
				<Card.Description>12 trailing months, after tax ({base})</Card.Description>
			</Card.Header>
			<Card.Content>
				<Chart.Container
					config={{ amount: { label: `Received (${base})`, color: 'var(--chart-4)' } }}
					class="h-56 w-full"
				>
					<BarChart
						data={barData}
						x="month"
						axis="x"
						props={{ xAxis: { tickOcclusion: true } }}
						series={[{ key: 'amount', label: base, color: 'var(--chart-4)' }]}
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
						<div class="tabular-nums {ccy && isNegative(delta) ? 'text-destructive' : ''}">
							{ccy ? `${isNegative(delta) ? '' : '+'}${money(delta, ccy)}` : (t.ratio ?? '—')}
						</div>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No transactions yet.</p>
				{/each}
			</Card.Content>
		</Card.Root>
	</div>
</div>
