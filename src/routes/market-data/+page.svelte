<script lang="ts">
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { DECIMAL_INPUT, isZero } from '#lib/decimal.js';
	import { price as formatPrice } from '#lib/format.js';
	import { ApiError } from '#lib/api.js';
	import {
		addFxRate,
		addPrice,
		deleteFxRate,
		deletePrice,
		fxRates,
		loadMarketData,
		prices,
		type Price
	} from '#lib/market-data.svelte.js';
	import { toastError } from '#lib/notify.js';
	import { CURRENCY_CODE } from '#lib/portfolio.svelte.js';
	import { instrumentById, instrumentLabel, instruments } from '#lib/transactions.svelte.js';

	type View = 'prices' | 'fx';

	const today = () => new Date().toISOString().slice(0, 10);

	let view = $state<View>('prices');
	let instrumentFilter = $state(page.url.searchParams.get('instrument') ?? '');

	let open = $state(false);
	let form = $state({ instrumentId: '', date: today(), value: '', base: 'USD', quote: 'THB' });
	let errors = $state<Record<string, string>>({});
	let busy = $state(false);
	let loaded = $state(false);

	loadMarketData()
		.then(() => (loaded = true))
		.catch(toastError);

	const priceRows = $derived(
		prices
			.filter((p) => !instrumentFilter || p.instrumentId === instrumentFilter)
			.toSorted((a, b) => b.priceDate.localeCompare(a.priceDate))
	);
	const fxRows = $derived(fxRates.toSorted((a, b) => b.rateDate.localeCompare(a.rateDate)));

	function label(id: string): string {
		const i = instrumentById(id);
		return i ? `${instrumentLabel(i)} · ${i.name}` : 'All instruments';
	}

	function openAdd() {
		form = { instrumentId: instrumentFilter, date: today(), value: '', base: 'USD', quote: 'THB' };
		errors = {};
		open = true;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const e: Record<string, string> = {};
		const value = form.value.trim();
		if (!form.date) e.date = 'Date is required';
		if (!DECIMAL_INPUT.test(value)) e.value = 'A positive decimal, up to 8 places';
		else if (isZero(value)) e.value = 'Must be greater than 0';
		const base = form.base.trim().toUpperCase();
		const quote = form.quote.trim().toUpperCase();
		if (view === 'prices' && !form.instrumentId) e.instrumentId = 'Choose an instrument';
		if (view === 'fx') {
			if (!CURRENCY_CODE.test(base)) e.base = '3-letter code';
			if (!CURRENCY_CODE.test(quote)) e.quote = '3-letter code';
			if (base === quote) e.quote = 'Must differ from the base currency';
		}
		errors = e;
		if (Object.keys(e).length) return;
		busy = true;
		try {
			if (view === 'prices') {
				await addPrice({ instrumentId: form.instrumentId, priceDate: form.date, price: value });
				toast.success('Price added');
			} else {
				await addFxRate({
					baseCurrency: base,
					quoteCurrency: quote,
					rateDate: form.date,
					rate: value
				});
				toast.success('FX rate added');
			}
			open = false;
		} catch (err) {
			if (err instanceof ApiError && err.status === 409) errors = { date: err.detail };
			else toastError(err);
		} finally {
			busy = false;
		}
	}

	async function removePrice(p: Price) {
		try {
			await deletePrice(p);
			toast.success('Price deleted');
		} catch (err) {
			toastError(err);
		}
	}

	async function removeFxRate(id: string) {
		try {
			await deleteFxRate(id);
			toast.success('FX rate deleted');
		} catch (err) {
			toastError(err);
		}
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Market data</h1>
			<p class="text-sm text-muted-foreground">
				Prices and FX rates you enter. Valuation uses the latest one on or before the valuation
				date; prices older than 7 days and rates older than 3 days are flagged stale.
			</p>
		</div>
		<Button onclick={openAdd}><Plus /> Add {view === 'prices' ? 'price' : 'FX rate'}</Button>
	</div>

	<Card.Root class="gap-0 py-0">
		<Tabs.Root
			value={view}
			onValueChange={(v) => (view = v as View)}
			class="border-b px-4 pt-4 md:px-6"
		>
			<Tabs.List variant="line">
				<Tabs.Trigger value="prices">Prices</Tabs.Trigger>
				<Tabs.Trigger value="fx">FX rates</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>

		<div class="space-y-4 p-4 md:px-6">
			{#if view === 'prices'}
				<Select.Root type="single" bind:value={instrumentFilter}>
					<Select.Trigger class="w-72">{label(instrumentFilter)}</Select.Trigger>
					<Select.Content>
						<Select.Item value="" label="All instruments" />
						{#each instruments as i (i.id)}
							<Select.Item value={i.id} label={`${instrumentLabel(i)} · ${i.name}`} />
						{/each}
					</Select.Content>
				</Select.Root>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Instrument</Table.Head>
							<Table.Head>Date</Table.Head>
							<Table.Head class="text-right">Price</Table.Head>
							<Table.Head>Source</Table.Head>
							<Table.Head class="w-10"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each priceRows as p (p.id)}
							{@const i = instrumentById(p.instrumentId)}
							<Table.Row>
								<Table.Cell>
									<div class="font-medium">{i ? instrumentLabel(i) : '—'}</div>
									<div class="text-xs text-muted-foreground">{i?.name}</div>
								</Table.Cell>
								<Table.Cell class="tabular-nums">{p.priceDate}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatPrice(p.price, i?.quoteCurrency ?? 'USD')}
								</Table.Cell>
								<Table.Cell><Badge variant="secondary">{p.source}</Badge></Table.Cell>
								<Table.Cell>
									<Button
										variant="ghost"
										size="icon-sm"
										class="text-destructive"
										aria-label="Delete"
										onclick={() => removePrice(p)}
									>
										<Trash2 />
									</Button>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={5} class="h-24 text-center text-muted-foreground">
									{loaded
										? 'No prices yet. Holdings without a price are left out of the valuation.'
										: 'Loading…'}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Pair</Table.Head>
							<Table.Head>Date</Table.Head>
							<Table.Head class="text-right">Rate</Table.Head>
							<Table.Head>Source</Table.Head>
							<Table.Head class="w-10"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each fxRows as r (r.id)}
							<Table.Row>
								<Table.Cell class="font-medium">{r.baseCurrency} → {r.quoteCurrency}</Table.Cell>
								<Table.Cell class="tabular-nums">{r.rateDate}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									1 {r.baseCurrency} = {r.rate}
									{r.quoteCurrency}
								</Table.Cell>
								<Table.Cell><Badge variant="secondary">{r.source}</Badge></Table.Cell>
								<Table.Cell>
									<Button
										variant="ghost"
										size="icon-sm"
										class="text-destructive"
										aria-label="Delete"
										onclick={() => removeFxRate(r.id)}
									>
										<Trash2 />
									</Button>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={5} class="h-24 text-center text-muted-foreground">
									{loaded ? 'No FX rates yet.' : 'Loading…'}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</div>
	</Card.Root>
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{view === 'prices' ? 'New price' : 'New FX rate'}</Dialog.Title>
			<Dialog.Description
				>One {view === 'prices' ? 'price per instrument' : 'rate per pair'} and date.</Dialog.Description
			>
		</Dialog.Header>
		<form class="space-y-4" onsubmit={save}>
			{#if view === 'prices'}
				<div class="space-y-1.5">
					<Label>Instrument <span class="text-destructive">*</span></Label>
					<Select.Root type="single" bind:value={form.instrumentId}>
						<Select.Trigger class="w-full">
							{form.instrumentId ? label(form.instrumentId) : 'Choose an instrument'}
						</Select.Trigger>
						<Select.Content>
							{#each instruments as i (i.id)}
								<Select.Item value={i.id} label={`${instrumentLabel(i)} · ${i.name}`} />
							{/each}
						</Select.Content>
					</Select.Root>
					{#if errors.instrumentId}<p class="text-xs text-destructive">
							{errors.instrumentId}
						</p>{/if}
				</div>
			{:else}
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<Label for="fx-base">Base <span class="text-destructive">*</span></Label>
						<Input id="fx-base" maxlength={3} class="uppercase" bind:value={form.base} />
						{#if errors.base}<p class="text-xs text-destructive">{errors.base}</p>{/if}
					</div>
					<div class="space-y-1.5">
						<Label for="fx-quote">Quote <span class="text-destructive">*</span></Label>
						<Input id="fx-quote" maxlength={3} class="uppercase" bind:value={form.quote} />
						{#if errors.quote}<p class="text-xs text-destructive">{errors.quote}</p>{/if}
					</div>
				</div>
			{/if}
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<Label for="md-date">Date <span class="text-destructive">*</span></Label>
					<Input id="md-date" type="date" bind:value={form.date} />
				</div>
				<div class="space-y-1.5">
					<Label for="md-value">
						{view === 'prices' ? 'Price' : 'Rate'} <span class="text-destructive">*</span>
					</Label>
					<Input id="md-value" inputmode="decimal" bind:value={form.value} />
					{#if errors.value}<p class="text-xs text-destructive">{errors.value}</p>{/if}
				</div>
			</div>
			{#if errors.date}<p class="text-xs text-destructive">{errors.date}</p>{/if}
			{#if view === 'fx'}
				<p class="text-xs text-muted-foreground">
					1 {form.base.toUpperCase() || '…'} = {form.value || '…'}
					{form.quote.toUpperCase() || '…'}
				</p>
			{/if}
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy}>Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
