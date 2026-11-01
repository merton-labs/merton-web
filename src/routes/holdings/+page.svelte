<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import TransactionDialog from '#lib/components/transactions/transaction-dialog.svelte';
	import { isNegative, money, percent, price, quantity } from '#lib/format.js';
	import { isZero, neg } from '#lib/decimal.js';
	import { ASSET_CLASS_LABEL, type Kind } from '#lib/transactions.svelte.js';
	import { UNVALUED_LABEL, emptyValuation, fetchValuation } from '#lib/valuation.svelte.js';
	import { fetchReturns } from '#lib/returns.js';
	import { currentPortfolio } from '#lib/portfolio.svelte.js';
	import { live } from '#lib/live.svelte.js';

	type Mode = 'holding' | 'base';

	let mode = $state<Mode>('holding');
	let search = $state('');
	let showSold = $state(false);
	let asOf = $state(new Date().toISOString().slice(0, 10));

	let dialogOpen = $state(false);
	let preset = $state<{ kind: Kind; instrumentId?: string } | null>(null);

	const base = $derived(currentPortfolio().baseCurrency);
	const valuation = live(() => fetchValuation(currentPortfolio().id, asOf));
	const returns = live(() => fetchReturns(currentPortfolio().id, asOf));
	const v = $derived(valuation.value ?? emptyValuation(base, asOf));
	// Base-currency values come from the valuation, by instrument.
	const valued = $derived(new Map(v.positions.map((p) => [p.instrument.id, p])));

	const rows = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		return (returns.value?.holdings ?? []).filter(
			(h) =>
				(showSold || !isZero(h.quantity)) &&
				(!needle ||
					h.name.toLowerCase().includes(needle) ||
					(h.symbol ?? '').toLowerCase().includes(needle))
		);
	});

	/** `+$1.24` / `-$1.24`, as in Snowball. */
	function signed(value: string, currency: string): string {
		return `${isNegative(value) || isZero(value) ? '' : '+'}${money(value, currency)}`;
	}

	function tone(value: string | null): string {
		if (value === null || isZero(value)) return '';
		return isNegative(value) ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500';
	}

	function openDialog(kind: Kind, instrumentId?: string) {
		preset = { kind, instrumentId };
		dialogOpen = true;
	}
</script>

{#snippet amount(value: string | null, currency: string, pct: string | null = null)}
	{#if value === null}
		<span class="text-muted-foreground">—</span>
	{:else}
		<div class={tone(value)}>{signed(value, currency)}</div>
		{#if pct !== null}
			<div class="text-xs {tone(pct)}">{percent(pct, true)}</div>
		{/if}
	{/if}
{/snippet}

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Holdings</h1>
			<p class="text-sm text-muted-foreground">Derived from the ledger with FIFO cost basis</p>
		</div>
		<div class="flex items-center gap-2">
			<label class="flex items-center gap-2 text-sm text-muted-foreground">
				As of
				<Input type="date" class="w-40" bind:value={asOf} />
			</label>
			<Button onclick={() => openDialog('BUY')}><Plus /> Add investment</Button>
		</div>
	</div>

	{#if returns.value?.partial || v.partial}
		<div class="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm">
			<TriangleAlert class="mt-0.5 size-4 shrink-0" />
			<div>
				<p class="font-medium">Valuation is partial</p>
				<p class="text-muted-foreground">
					Some holdings have no price or FX rate on or before {asOf}; their value and profit are
					left out.
					<a href={resolve('/market-data')} class="underline">Add market data</a>
				</p>
			</div>
		</div>
	{/if}

	<Card.Root class="gap-0 py-0">
		<div class="flex flex-wrap items-center gap-3 border-b p-4 md:px-6">
			<Tabs.Root value={mode} onValueChange={(m) => (mode = m as Mode)}>
				<Tabs.List>
					<Tabs.Trigger value="holding">In holding currency</Tabs.Trigger>
					<Tabs.Trigger value="base">In {base}</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
			<Label class="flex items-center gap-2 font-normal">
				<Checkbox bind:checked={showSold} />
				Show sold
			</Label>
			<div class="relative ml-auto">
				<Search
					class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input placeholder="Search…" class="w-56 pl-8" bind:value={search} />
			</div>
		</div>

		<div class="p-4 md:px-6">
			<Tooltip.Provider>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Holding</Table.Head>
							<Table.Head class="text-right">Shares</Table.Head>
							<Table.Head class="text-right">Cost basis</Table.Head>
							<Table.Head class="text-right">Current value</Table.Head>
							<Table.Head class="text-right">Div. received</Table.Head>
							<Table.Head class="text-right">Capital gain</Table.Head>
							<Table.Head class="text-right">Realized P&amp;L</Table.Head>
							<Table.Head class="text-right">Total profit</Table.Head>
							<Table.Head class="w-10"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each rows as h (h.instrumentId)}
							{@const ccy = h.currency}
							{@const sold = isZero(h.quantity)}
							{@const p = valued.get(h.instrumentId)}
							<Table.Row class={sold ? 'text-muted-foreground' : ''}>
								<Table.Cell>
									<div class="flex items-center gap-2">
										<span class="font-medium">{h.name}</span>
										<Badge variant="outline" class="font-normal">
											{ASSET_CLASS_LABEL[h.assetClass]}
										</Badge>
										{#if sold}<Badge variant="secondary">Sold</Badge>{/if}
									</div>
									<div class="text-xs text-muted-foreground">
										{h.symbol ?? '—'} · {ccy}
									</div>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{quantity(h.quantity)}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if sold}
										—
									{:else}
										<div>{money(h.costBasis, ccy)}</div>
										{#if h.averageCost}
											<div class="text-xs text-muted-foreground">{money(h.averageCost, ccy)}</div>
										{/if}
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if sold}
										—
									{:else if mode === 'base'}
										{#if p?.value}
											<div>{money(p.value, base)}</div>
											{#if p.fx}
												<div class="text-xs text-muted-foreground">
													@ {p.fx.value}
													{#if p.fx.stale}<Badge variant="secondary" class="ml-1">stale</Badge>{/if}
												</div>
											{/if}
										{:else}
											<span class="text-xs text-muted-foreground">
												{p?.unvaluedReason ? UNVALUED_LABEL[p.unvaluedReason] : '—'}
											</span>
										{/if}
									{:else if h.marketValue && h.price}
										<div>{money(h.marketValue, ccy)}</div>
										<div class="text-xs text-muted-foreground">
											{price(h.price.value, ccy)} · {h.price.date}
											{#if h.price.stale}<Badge variant="secondary" class="ml-1">stale</Badge>{/if}
										</div>
									{:else}
										<Badge variant="secondary">No price</Badge>
									{/if}
								</Table.Cell>
								{#if mode === 'holding'}
									<Table.Cell class="text-right tabular-nums">
										<span
											class={isZero(h.dividends) ? '' : 'text-emerald-600 dark:text-emerald-500'}
										>
											{money(h.dividends, ccy)}
										</span>
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if sold}
											—
										{:else}
											{@render amount(h.capitalGain, ccy, h.capitalGainPercent)}
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										<span class={tone(h.realized)}>{money(h.realized, ccy)}</span>
									</Table.Cell>
									<Table.Cell class="text-right font-medium tabular-nums">
										{#if h.totalProfit === null}
											<span class="text-muted-foreground">—</span>
										{:else}
											<Tooltip.Root>
												<Tooltip.Trigger
													class="cursor-help underline decoration-dashed underline-offset-4"
												>
													{@render amount(h.totalProfit, ccy, h.totalProfitPercent)}
												</Tooltip.Trigger>
												<Tooltip.Content class="text-left tabular-nums">
													<div class="grid gap-0.5">
														<div>Capital gain: {signed(h.capitalGain ?? '0', ccy)}</div>
														<div>Realized P&amp;L: {signed(h.realized, ccy)}</div>
														<div>Dividends received: {signed(h.dividends, ccy)}</div>
														<div>Fees paid: {signed(neg(h.fees), ccy)}</div>
														<div>Taxes: {signed(neg(h.taxes), ccy)}</div>
													</div>
												</Tooltip.Content>
											</Tooltip.Root>
										{/if}
									</Table.Cell>
								{:else}
									<Table.Cell colspan={4} class="text-center text-xs text-muted-foreground">
										In {ccy} only
									</Table.Cell>
								{/if}
								<Table.Cell>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions">
													<Ellipsis />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onclick={() => openDialog('BUY', h.instrumentId)}>
												Add a transaction
											</DropdownMenu.Item>
											<DropdownMenu.Item onclick={() => openDialog('DIVIDEND', h.instrumentId)}>
												Add dividend
											</DropdownMenu.Item>
											<DropdownMenu.Item>
												{#snippet child({ props })}
													<a {...props} href={resolve(`/market-data?instrument=${h.instrumentId}`)}>
														Prices
													</a>
												{/snippet}
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={9} class="h-24 text-center text-muted-foreground">
									{#if returns.error}
										<span class="text-destructive">{returns.error}</span>
									{:else if !returns.value}
										Loading…
									{:else}
										No holdings yet. Add a buy or an opening position.
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
					{#if rows.length > 0}
						<Table.Footer>
							<Table.Row>
								<Table.Cell colspan={3} class="font-medium">Total positions ({base})</Table.Cell>
								<Table.Cell class="text-right font-medium tabular-nums">
									{money(v.positionsValue, base)}
								</Table.Cell>
								<Table.Cell colspan={5} class="text-xs text-muted-foreground">
									{v.partial ? 'partial' : ''}
								</Table.Cell>
							</Table.Row>
						</Table.Footer>
					{/if}
				</Table.Root>
			</Tooltip.Provider>
			<p class="mt-3 text-xs text-muted-foreground">
				Dividends, gains and profit are in each holding's currency. Total profit = capital gain +
				realized P&amp;L + dividends after tax − fees − taxes; hover it for the breakdown.
			</p>
		</div>
	</Card.Root>
</div>

<TransactionDialog bind:open={dialogOpen} {preset} />
