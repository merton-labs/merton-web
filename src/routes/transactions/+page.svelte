<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import TransactionDialog from '#lib/components/transactions/transaction-dialog.svelte';
	import { add, isZero } from '#lib/decimal.js';
	import { isNegative, money, price, quantity } from '#lib/format.js';
	import { toastError } from '#lib/notify.js';
	import {
		CASH_KINDS,
		EXPENSE_KINDS,
		INCOME_KINDS,
		KIND_LABEL,
		TRADE_KINDS,
		cashAccountById,
		cashDelta,
		deleteTransactions,
		describe,
		gross,
		instrumentById,
		portfolioTransactions,
		CORPORATE_KINDS,
		type Kind,
		type Transaction
	} from '#lib/transactions.svelte.js';

	type View = 'trades' | 'incomes' | 'all';

	const ALL_KINDS = Object.keys(KIND_LABEL) as Kind[];
	/** Kinds the transaction dialog can edit; corporate actions have their own page. */
	const DIALOG_KINDS: Kind[] = [...TRADE_KINDS, ...INCOME_KINDS, ...EXPENSE_KINDS, ...CASH_KINDS];

	let view = $state<View>('trades');
	let search = $state('');
	let showFilters = $state(false);
	let kindFilter = $state<Kind | ''>('');
	let sortDesc = $state(true);
	let summaryExpanded = $state(false);
	const selected = new SvelteSet<string>();

	let dialogOpen = $state(false);
	let editing = $state<Transaction | null>(null);
	let pendingDelete = $state<Transaction[] | null>(null);
	let deleting = $state(false);

	const viewKinds = $derived<Kind[] | null>(
		view === 'trades' ? TRADE_KINDS : view === 'incomes' ? INCOME_KINDS : null
	);

	function currencyOf(t: Transaction): string {
		return (
			cashAccountById(t.cashAccountId)?.currency ??
			instrumentById(t.instrumentId)?.quoteCurrency ??
			''
		);
	}

	function matches(t: Transaction, needle: string): boolean {
		if (!needle) return true;
		const instrument = instrumentById(t.instrumentId);
		const account = cashAccountById(t.cashAccountId);
		return [instrument?.symbol, instrument?.name, account?.name, t.note, KIND_LABEL[t.kind]]
			.filter(Boolean)
			.some((s) => s!.toLowerCase().includes(needle));
	}

	const rows = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		const oldestFirst = portfolioTransactions()
			.filter((t) => !viewKinds || viewKinds.includes(t.kind))
			.filter((t) => !kindFilter || t.kind === kindFilter)
			.filter((t) => matches(t, needle))
			.toSorted((a, b) => a.tradeDate.localeCompare(b.tradeDate));
		// The API's order is chronological within a date too, so newest-first reverses it.
		return sortDesc ? oldestFirst.toReversed() : oldestFirst;
	});

	// Totals per currency; values are never converted (no FX in the browser).
	type Metric = { label: string; values: Map<string, string> };

	const summary = $derived.by(() => {
		const metrics: Record<string, Metric> = {};
		const bump = (label: string, currency: string, value: string | null) => {
			if (!value || isZero(value)) return;
			const m = (metrics[label] ??= { label, values: new Map() });
			m.values.set(currency, add(m.values.get(currency) ?? '0', value));
		};
		for (const t of rows) {
			const c = currencyOf(t);
			switch (t.kind) {
				case 'BUY':
					bump('Buy', c, gross(t));
					break;
				case 'OPENING_POSITION':
					bump('Opening', c, t.amount);
					break;
				case 'SELL':
					bump('Sell', c, gross(t));
					break;
				case 'DIVIDEND':
					bump('Dividends', c, t.amount);
					break;
				case 'INTEREST':
					bump('Interest', c, t.amount);
					break;
				case 'FEE':
					bump('Fee', c, t.amount);
					break;
				case 'TAX':
					bump('Tax', c, t.amount);
					break;
				case 'TAX_RETURN':
					bump('Tax return', c, t.amount);
					break;
				case 'DEPOSIT':
					bump('Deposits', c, t.amount);
					break;
				case 'WITHDRAWAL':
					bump('Withdrawals', c, t.amount);
					break;
			}
			if (t.kind !== 'FEE') bump('Fee', c, t.fee);
			if (t.kind !== 'TAX') bump('Tax', c, t.tax);
		}
		const order = [
			'Buy',
			'Opening',
			'Sell',
			'Fee',
			'Dividends',
			'Interest',
			'Tax',
			'Tax return',
			'Deposits',
			'Withdrawals'
		];
		return order.flatMap((label) => (metrics[label] ? [metrics[label]] : []));
	});

	const visibleSummary = $derived(summaryExpanded ? summary : summary.slice(0, 3));

	const allSelected = $derived(rows.length > 0 && rows.every((t) => selected.has(t.id)));
	const someSelected = $derived(rows.some((t) => selected.has(t.id)));

	function toggleAll(checked: boolean) {
		for (const t of rows) {
			if (checked) selected.add(t.id);
			else selected.delete(t.id);
		}
	}

	function openCreate() {
		editing = null;
		dialogOpen = true;
	}

	function openEdit(t: Transaction) {
		editing = t;
		dialogOpen = true;
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		const items = pendingDelete;
		deleting = true;
		try {
			await deleteTransactions(items);
			toast.success(
				items.length === 1 ? 'Transaction deleted' : `${items.length} transactions deleted`
			);
			pendingDelete = null;
		} catch (err) {
			// Deleting can break later history (e.g. a sell needs the buy); earlier ones stay deleted.
			toastError(err);
			pendingDelete = null;
		} finally {
			items.forEach((t) => {
				if (!portfolioTransactions().some((x) => x.id === t.id)) selected.delete(t.id);
			});
			deleting = false;
		}
	}

	function resetFilters() {
		kindFilter = '';
		search = '';
	}

	function holding(t: Transaction): { title: string; sub: string } {
		const instrument = instrumentById(t.instrumentId);
		if (instrument) return { title: instrument.name, sub: instrument.symbol ?? '' };
		const account = cashAccountById(t.cashAccountId);
		const destination = cashAccountById(t.destinationCashAccountId);
		if (destination) {
			return {
				title: `${account?.name ?? '—'} → ${destination.name}`,
				sub:
					account?.currency === destination.currency
						? destination.currency
						: `${account?.currency ?? ''} → ${destination.currency}`
			};
		}
		return { title: account?.name ?? '—', sub: account?.currency ?? '' };
	}

	function formatDate(iso: string): string {
		const [y, m, d] = iso.split('-');
		return `${d}/${m}/${y}`;
	}

	function charges(t: Transaction): string | null {
		const total = add(t.fee ?? '0', t.tax ?? '0');
		return isZero(total) ? null : total;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Transactions</h1>
		<div class="flex gap-2">
			{#each [{ label: 'Import', icon: Upload }, { label: 'Export', icon: Download }] as action (action.label)}
				<Tooltip.Provider>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<span {...props}>
									<Button variant="outline" size="sm" disabled>
										<action.icon />
										{action.label}
									</Button>
								</span>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>CSV import and export arrive in P6</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			{/each}
		</div>
	</div>

	<Card.Root class="gap-0 py-0">
		<Tabs.Root
			value={view}
			onValueChange={(v) => {
				view = v as View;
				kindFilter = '';
				selected.clear();
			}}
			class="border-b px-4 pt-4 md:px-6"
		>
			<Tabs.List variant="line">
				<Tabs.Trigger value="trades">Trades</Tabs.Trigger>
				<Tabs.Trigger value="incomes">Incomes</Tabs.Trigger>
				<Tabs.Trigger value="all">All</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>

		<div class="space-y-4 p-4 md:p-6">
			<div class="flex flex-wrap items-center gap-2">
				<Button onclick={openCreate}><Plus /> Add</Button>
				{#if someSelected}
					<Button
						variant="outline"
						class="text-destructive"
						onclick={() => (pendingDelete = rows.filter((t) => selected.has(t.id)))}
					>
						<Trash2 /> Delete {rows.filter((t) => selected.has(t.id)).length} selected
					</Button>
				{/if}
				<div class="ml-auto flex flex-wrap items-center gap-2">
					<div class="relative">
						<Search
							class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input placeholder="Search…" class="w-48 pl-8" bind:value={search} />
					</div>
					<Button
						variant={showFilters ? 'secondary' : 'outline'}
						onclick={() => (showFilters = !showFilters)}
					>
						<SlidersHorizontal /> Filters
					</Button>
					<span class="rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
						FIFO (First In, First Out)
					</span>
				</div>
			</div>

			{#if showFilters}
				<div class="flex flex-wrap items-center gap-2">
					<Select.Root
						type="single"
						value={kindFilter}
						onValueChange={(v) => (kindFilter = v as Kind | '')}
					>
						<Select.Trigger class="w-48">
							{kindFilter ? KIND_LABEL[kindFilter] : 'All transactions'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="" label="All transactions" />
							{#each viewKinds ?? ALL_KINDS as k (k)}
								<Select.Item value={k} label={KIND_LABEL[k]} />
							{/each}
						</Select.Content>
					</Select.Root>
					<Button variant="ghost" onclick={resetFilters}>Clear filters</Button>
				</div>
			{/if}

			{#if summary.length > 0}
				<div
					class="inline-flex flex-wrap items-start gap-x-6 gap-y-2 rounded-lg border px-4 py-2.5"
				>
					{#each visibleSummary as m (m.label)}
						<div>
							<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
								<span class="size-1.5 rounded-full bg-foreground/40"></span>
								{m.label}
							</div>
							{#each [...m.values] as [currency, value] (currency)}
								<div class="text-sm font-medium tabular-nums">{money(value, currency)}</div>
							{/each}
						</div>
					{/each}
					{#if summary.length > 3}
						<button
							type="button"
							class="flex items-center gap-1 self-center text-xs text-muted-foreground hover:text-foreground"
							onclick={() => (summaryExpanded = !summaryExpanded)}
						>
							{#if summaryExpanded}Collapse <ChevronUp class="size-3" />{:else}See all <ChevronDown
									class="size-3"
								/>{/if}
						</button>
					{/if}
				</div>
			{/if}

			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-8">
							<Checkbox
								checked={allSelected}
								indeterminate={someSelected && !allSelected}
								onCheckedChange={(v) => toggleAll(v === true)}
								aria-label="Select all"
							/>
						</Table.Head>
						<Table.Head>Operation</Table.Head>
						<Table.Head>Holding</Table.Head>
						<Table.Head>
							<button
								type="button"
								class="inline-flex items-center gap-1 font-medium"
								onclick={() => (sortDesc = !sortDesc)}
							>
								Date
								{#if sortDesc}<ArrowDown class="size-3.5" />{:else}<ArrowUp class="size-3.5" />{/if}
							</button>
						</Table.Head>
						{#if view === 'incomes'}
							<Table.Head class="text-right">Total</Table.Head>
						{:else}
							<Table.Head class="text-right">Shares</Table.Head>
							<Table.Head class="text-right">Price</Table.Head>
						{/if}
						<Table.Head class="text-right">Fee / Tax</Table.Head>
						<Table.Head class="text-right">Summ</Table.Head>
						<Table.Head>Note</Table.Head>
						<Table.Head class="w-20"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as t (t.id)}
						{@const h = holding(t)}
						{@const c = currencyOf(t)}
						{@const delta = cashDelta(t)}
						<Table.Row data-state={selected.has(t.id) ? 'selected' : undefined}>
							<Table.Cell>
								<Checkbox
									checked={selected.has(t.id)}
									onCheckedChange={(v) => (v === true ? selected.add(t.id) : selected.delete(t.id))}
									aria-label="Select row"
								/>
							</Table.Cell>
							<Table.Cell class="font-medium">{KIND_LABEL[t.kind]}</Table.Cell>
							<Table.Cell>
								<div>{h.title}</div>
								<div class="text-xs text-muted-foreground">{h.sub}</div>
							</Table.Cell>
							<Table.Cell class="tabular-nums">{formatDate(t.tradeDate)}</Table.Cell>
							{#if view === 'incomes'}
								<Table.Cell class="text-right tabular-nums">
									{t.amount ? money(t.amount, c) : '—'}
								</Table.Cell>
							{:else}
								<Table.Cell class="text-right tabular-nums">
									{t.ratio ? t.ratio : t.quantity ? quantity(t.quantity) : '—'}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{t.price ? price(t.price, c) : '—'}
								</Table.Cell>
							{/if}
							<Table.Cell class="text-right tabular-nums">
								{#if charges(t)}{money(charges(t)!, c)}{:else}—{/if}
							</Table.Cell>
							<Table.Cell
								class="text-right font-medium tabular-nums {isNegative(delta)
									? 'text-destructive'
									: ''}"
							>
								{#if t.cashAccountId}
									{isNegative(delta) ? '' : '+'}{money(delta, c)}
								{:else}
									<span class="text-xs font-normal text-muted-foreground">No cash effect</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="max-w-40 truncate text-sm text-muted-foreground">
								{t.note ?? ''}
							</Table.Cell>
							<Table.Cell>
								<div class="flex justify-end gap-1">
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label="Edit"
										disabled={!DIALOG_KINDS.includes(t.kind) && !CORPORATE_KINDS.includes(t.kind)}
										title={DIALOG_KINDS.includes(t.kind) || CORPORATE_KINDS.includes(t.kind)
											? undefined
											: 'This kind cannot be edited here yet'}
										onclick={() =>
											CORPORATE_KINDS.includes(t.kind)
												? goto(resolve('/corporate-actions'))
												: openEdit(t)}
									>
										<Pencil />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										class="text-destructive"
										aria-label="Delete"
										onclick={() => (pendingDelete = [t])}
									>
										<Trash2 />
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={10} class="h-24 text-center text-muted-foreground">
								No transactions match.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Card.Root>
</div>

<TransactionDialog bind:open={dialogOpen} {editing} />

<Dialog.Root
	open={pendingDelete !== null}
	onOpenChange={(o) => {
		if (!o) pendingDelete = null;
	}}
>
	<Dialog.Content class="sm:max-w-md">
		{#if pendingDelete}
			<Dialog.Header>
				<Dialog.Title>
					{pendingDelete.length === 1
						? `Delete "${describe(pendingDelete[0])}"`
						: `Delete ${pendingDelete.length} transactions`}
				</Dialog.Title>
				<Dialog.Description>
					{#if pendingDelete.length === 1}
						Transaction <strong
							>{describe(pendingDelete[0])} {formatDate(pendingDelete[0].tradeDate)}</strong
						>
						will be deleted from your portfolio. Holdings, cost basis and cash balances are recalculated.
					{:else}
						These transactions will be deleted from your portfolio. Holdings, cost basis and cash
						balances are recalculated.
					{/if}
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button variant="ghost" onclick={() => (pendingDelete = null)}>Cancel</Button>
				<Button variant="destructive" disabled={deleting} onclick={confirmDelete}>
					Yes, delete
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
