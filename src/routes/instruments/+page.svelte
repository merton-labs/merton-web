<script lang="ts">
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { price as formatPrice } from '#lib/format.js';
	import { latestPrice, loadMarketData } from '#lib/market-data.svelte.js';
	import { toastError } from '#lib/notify.js';
	import { CURRENCY_CODE } from '#lib/portfolio.svelte.js';
	import {
		ASSET_CLASS_LABEL,
		createInstrument,
		deleteInstrument,
		instruments,
		updateInstrument,
		type AssetClass,
		type Instrument
	} from '#lib/transactions.svelte.js';

	const CLASSES: AssetClass[] = ['STOCK', 'ETF', 'MUTUAL_FUND'];

	let search = $state('');
	let open = $state(false);
	let editing = $state<Instrument | null>(null);
	let form = $state(blank());
	let errors = $state<Record<string, string>>({});
	let pendingDelete = $state<Instrument | null>(null);
	let busy = $state(false);

	// Only for the latest-price column; the table works without it.
	loadMarketData().catch(toastError);

	function blank() {
		return {
			assetClass: 'STOCK' as AssetClass,
			name: '',
			symbol: '',
			isin: '',
			exchange: '',
			quoteCurrency: ''
		};
	}

	const rows = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		return instruments
			.filter((i) =>
				[i.name, i.symbol, i.isin, i.exchange].some((s) => s?.toLowerCase().includes(needle))
			)
			.toSorted((a, b) => a.name.localeCompare(b.name));
	});

	function openEdit(i: Instrument | null) {
		editing = i;
		form = i
			? {
					assetClass: i.assetClass,
					name: i.name,
					symbol: i.symbol ?? '',
					isin: i.isin ?? '',
					exchange: i.exchange ?? '',
					quoteCurrency: i.quoteCurrency
				}
			: blank();
		errors = {};
		open = true;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const e: Record<string, string> = {};
		const opt = (s: string) => (s.trim() === '' ? null : s.trim());
		const quoteCurrency = form.quoteCurrency.trim().toUpperCase();
		if (!form.name.trim()) e.name = 'Name is required';
		if (!editing && !CURRENCY_CODE.test(quoteCurrency))
			e.quoteCurrency = 'Use a 3-letter code such as USD';
		errors = e;
		if (Object.keys(e).length) return;
		const fields = {
			assetClass: form.assetClass,
			name: form.name.trim(),
			symbol: opt(form.symbol),
			isin: opt(form.isin),
			exchange: opt(form.exchange)
		};
		busy = true;
		try {
			if (editing) {
				await updateInstrument(editing.id, fields);
				toast.success('Instrument updated');
			} else {
				await createInstrument({ ...fields, quoteCurrency });
				toast.success(`${fields.symbol ?? fields.name} added`);
			}
			open = false;
		} catch (err) {
			toastError(err);
		} finally {
			busy = false;
		}
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		busy = true;
		try {
			await deleteInstrument(pendingDelete.id);
			toast.success('Instrument deleted');
			pendingDelete = null;
		} catch (err) {
			toastError(err);
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Instruments</h1>
			<p class="text-sm text-muted-foreground">
				Your own list of stocks, ETFs and funds, shared by all your portfolios. Merton never creates
				them for you.
			</p>
		</div>
		<Button onclick={() => openEdit(null)}><Plus /> Add instrument</Button>
	</div>

	<Card.Root class="py-0">
		<Card.Content class="space-y-4 p-4 md:px-6">
			<div class="relative w-64">
				<Search
					class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input placeholder="Search name, symbol, ISIN…" class="pl-8" bind:value={search} />
			</div>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Instrument</Table.Head>
						<Table.Head>Class</Table.Head>
						<Table.Head>Exchange</Table.Head>
						<Table.Head>ISIN</Table.Head>
						<Table.Head>Currency</Table.Head>
						<Table.Head class="text-right">Latest price</Table.Head>
						<Table.Head class="w-10"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as i (i.id)}
						{@const last = latestPrice(i.id)}
						<Table.Row>
							<Table.Cell>
								<div class="font-medium">{i.name}</div>
								<div class="text-xs text-muted-foreground">{i.symbol ?? '—'}</div>
							</Table.Cell>
							<Table.Cell
								><Badge variant="outline">{ASSET_CLASS_LABEL[i.assetClass]}</Badge></Table.Cell
							>
							<Table.Cell>{i.exchange ?? '—'}</Table.Cell>
							<Table.Cell class="font-mono text-xs">{i.isin ?? '—'}</Table.Cell>
							<Table.Cell>{i.quoteCurrency}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{#if last}
									<div>{formatPrice(last.price, i.quoteCurrency)}</div>
									<div class="text-xs text-muted-foreground">{last.priceDate}</div>
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
										<DropdownMenu.Item onclick={() => openEdit(i)}>Edit</DropdownMenu.Item>
										<DropdownMenu.Item>
											{#snippet child({ props })}
												<a {...props} href={resolve(`/market-data?instrument=${i.id}`)}>Prices</a>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive" onclick={() => (pendingDelete = i)}>
											Delete
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={7} class="h-24 text-center text-muted-foreground">
								No instruments match.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Edit instrument' : 'New instrument'}</Dialog.Title>
			<Dialog.Description>
				Duplicate symbols are allowed; the quote currency is fixed once created.
			</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-4" onsubmit={save}>
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<Label>Type <span class="text-destructive">*</span></Label>
					<Select.Root type="single" bind:value={form.assetClass}>
						<Select.Trigger class="w-full">{ASSET_CLASS_LABEL[form.assetClass]}</Select.Trigger>
						<Select.Content>
							{#each CLASSES as c (c)}
								<Select.Item value={c} label={ASSET_CLASS_LABEL[c]} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-1.5">
					<Label for="ins-ccy">Quote currency <span class="text-destructive">*</span></Label>
					<Input
						id="ins-ccy"
						maxlength={3}
						class="uppercase"
						placeholder="THB"
						bind:value={form.quoteCurrency}
						disabled={!!editing}
					/>
					{#if errors.quoteCurrency}<p class="text-xs text-destructive">
							{errors.quoteCurrency}
						</p>{/if}
				</div>
			</div>
			<div class="space-y-1.5">
				<Label for="ins-name">Name <span class="text-destructive">*</span></Label>
				<Input id="ins-name" placeholder="e.g. PTT PCL" bind:value={form.name} />
				{#if errors.name}<p class="text-xs text-destructive">{errors.name}</p>{/if}
			</div>
			<div class="grid grid-cols-3 gap-3">
				<div class="space-y-1.5">
					<Label for="ins-symbol">Symbol</Label>
					<Input id="ins-symbol" placeholder="PTT" bind:value={form.symbol} />
				</div>
				<div class="space-y-1.5">
					<Label for="ins-exchange">Exchange</Label>
					<Input id="ins-exchange" placeholder="SET" bind:value={form.exchange} />
				</div>
				<div class="space-y-1.5">
					<Label for="ins-isin">ISIN</Label>
					<Input id="ins-isin" placeholder="Optional" bind:value={form.isin} />
				</div>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy}>Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root
	open={pendingDelete !== null}
	onOpenChange={(o) => {
		if (!o) pendingDelete = null;
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete "{pendingDelete?.name}"</Dialog.Title>
			<Dialog.Description>
				Only an instrument with no transactions and no prices can be deleted. This cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="ghost" onclick={() => (pendingDelete = null)}>Cancel</Button>
			<Button variant="destructive" disabled={busy} onclick={confirmDelete}>Yes, delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
