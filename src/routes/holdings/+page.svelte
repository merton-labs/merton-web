<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import TransactionDialog from '#lib/components/transactions/transaction-dialog.svelte';
	import { add, neg } from '#lib/decimal.js';
	import { isNegative, money, price, quantity } from '#lib/format.js';
	import { ASSET_CLASS_LABEL, instrumentLabel, type Kind } from '#lib/transactions.svelte.js';
	import { UNVALUED_LABEL, valuation, type ValuedPosition } from '#lib/valuation.svelte.js';
	import { currentPortfolio } from '#lib/portfolio.svelte.js';

	type Mode = 'holding' | 'base';

	let mode = $state<Mode>('holding');
	let search = $state('');
	let asOf = $state(new Date().toISOString().slice(0, 10));

	let dialogOpen = $state(false);
	let preset = $state<{ kind: Kind; instrumentId?: string } | null>(null);

	const v = $derived(valuation(asOf));
	const base = $derived(currentPortfolio().baseCurrency);

	const rows = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		return v.positions
			.filter(
				(p) =>
					!needle ||
					p.instrument.name.toLowerCase().includes(needle) ||
					(p.instrument.symbol ?? '').toLowerCase().includes(needle)
			)
			.toSorted((a, b) => a.instrument.name.localeCompare(b.instrument.name));
	});

	function gain(p: ValuedPosition): string | null {
		return p.marketValue ? add(p.marketValue, neg(p.costBasis)) : null;
	}

	function openDialog(kind: Kind, instrumentId?: string) {
		preset = { kind, instrumentId };
		dialogOpen = true;
	}
</script>

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

	{#if v.partial}
		<div class="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm">
			<TriangleAlert class="mt-0.5 size-4 shrink-0" />
			<div>
				<p class="font-medium">Valuation is partial</p>
				<p class="text-muted-foreground">
					Some holdings have no price or FX rate on or before {asOf}; they are left out of the
					totals.
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
			<div class="relative ml-auto">
				<Search
					class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input placeholder="Search…" class="w-56 pl-8" bind:value={search} />
			</div>
		</div>

		<div class="p-4 md:px-6">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Holding</Table.Head>
						<Table.Head class="text-right">Shares</Table.Head>
						<Table.Head class="text-right">Cost basis</Table.Head>
						<Table.Head class="text-right">Price</Table.Head>
						<Table.Head class="text-right">Current value</Table.Head>
						<Table.Head class="text-right">Unrealized gain</Table.Head>
						<Table.Head class="w-10"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as p (p.instrument.id)}
						{@const ccy = p.instrument.quoteCurrency}
						{@const g = gain(p)}
						<Table.Row>
							<Table.Cell>
								<div class="flex items-center gap-2">
									<span class="font-medium">{p.instrument.name}</span>
									<Badge variant="outline" class="font-normal">
										{ASSET_CLASS_LABEL[p.instrument.assetClass]}
									</Badge>
								</div>
								<div class="text-xs text-muted-foreground">
									{instrumentLabel(p.instrument)} · {ccy}
								</div>
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{quantity(p.quantity)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{money(p.costBasis, ccy)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{#if p.price}
									<div>{price(p.price.value, ccy)}</div>
									<div class="text-xs text-muted-foreground">
										{p.price.date}
										{#if p.price.stale}<Badge variant="secondary" class="ml-1">stale</Badge>{/if}
									</div>
								{:else}
									<Badge variant="secondary">No price</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{#if mode === 'holding'}
									{p.marketValue ? money(p.marketValue, ccy) : '—'}
								{:else if p.value}
									<div>{money(p.value, base)}</div>
									{#if p.fx}
										<div class="text-xs text-muted-foreground">
											@ {p.fx.value}
											{#if p.fx.stale}<Badge variant="secondary" class="ml-1">stale</Badge>{/if}
										</div>
									{/if}
								{:else}
									<span class="text-xs text-muted-foreground">
										{p.unvaluedReason ? UNVALUED_LABEL[p.unvaluedReason] : '—'}
									</span>
								{/if}
							</Table.Cell>
							<Table.Cell
								class="text-right font-medium tabular-nums {g && isNegative(g)
									? 'text-destructive'
									: ''}"
							>
								{#if mode === 'holding' && g}
									{isNegative(g) ? '' : '+'}{money(g, ccy)}
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</Table.Cell>
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
										<DropdownMenu.Item onclick={() => openDialog('BUY', p.instrument.id)}>
											Add a transaction
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => openDialog('DIVIDEND', p.instrument.id)}>
											Add dividend
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a {...props} href={resolve(`/market-data?instrument=${p.instrument.id}`)}>
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
							<Table.Cell colspan={7} class="h-24 text-center text-muted-foreground">
								No holdings yet. Add a buy or an opening position.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
				{#if rows.length > 0}
					<Table.Footer>
						<Table.Row>
							<Table.Cell colspan={4} class="font-medium">Total positions ({base})</Table.Cell>
							<Table.Cell class="text-right font-medium tabular-nums">
								{money(v.positionsValue, base)}
							</Table.Cell>
							<Table.Cell colspan={2} class="text-xs text-muted-foreground">
								{v.partial ? 'partial' : ''}
							</Table.Cell>
						</Table.Row>
					</Table.Footer>
				{/if}
			</Table.Root>
			<p class="mt-3 text-xs text-muted-foreground">
				Gain is shown in the holding's currency only: the API does not yet return cost basis in the
				base currency or gain percentages.
			</p>
		</div>
	</Card.Root>
</div>

<TransactionDialog bind:open={dialogOpen} {preset} />
