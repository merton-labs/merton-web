<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Check from '@lucide/svelte/icons/check';
	import { DECIMAL_INPUT, isZero } from '#lib/decimal.js';
	import { money } from '#lib/format.js';
	import {
		CASH_KINDS,
		EXPENSE_KINDS,
		INCOME_KINDS,
		KIND_LABEL,
		TRADE_KINDS,
		cashAccountById,
		portfolioCashAccounts,
		instrumentLabel,
		cashDelta,
		createTransaction,
		describe,
		instrumentById,
		instruments,
		updateTransaction,
		type Kind,
		type Transaction,
		type TransactionInput
	} from '#lib/transactions.svelte.js';

	type Group = 'trades' | 'incomes' | 'expenses' | 'cash';

	const GROUPS: { value: Group; label: string; kinds: Kind[] }[] = [
		{ value: 'trades', label: 'Trades', kinds: TRADE_KINDS },
		{ value: 'incomes', label: 'Incomes', kinds: INCOME_KINDS },
		{ value: 'expenses', label: 'Expenses', kinds: EXPENSE_KINDS },
		{ value: 'cash', label: 'Cash', kinds: CASH_KINDS }
	];

	type Preset = { kind: Kind; instrumentId?: string; cashAccountId?: string };

	let {
		open = $bindable(false),
		editing = null,
		preset = null
	}: { open?: boolean; editing?: Transaction | null; preset?: Preset | null } = $props();

	const today = () => new Date().toISOString().slice(0, 10);

	let group = $state<Group>('trades');
	let form = $state(blank('BUY'));
	let errors = $state<Record<string, string>>({});
	let instrumentOpen = $state(false);

	function blank(kind: Kind) {
		return {
			kind,
			tradeDate: today(),
			instrumentId: '',
			cashAccountId: '',
			quantity: '',
			price: '',
			fee: '',
			tax: '',
			amount: '',
			note: ''
		};
	}

	function groupOf(kind: Kind): Group {
		return GROUPS.find((g) => g.kinds.includes(kind))?.value ?? 'trades';
	}

	// Re-initialise whenever the dialog opens.
	$effect(() => {
		if (!open) return;
		const source = editing;
		const start = preset;
		untrack(() => {
			errors = {};
			if (source) {
				group = groupOf(source.kind);
				form = {
					kind: source.kind,
					tradeDate: source.tradeDate,
					instrumentId: source.instrumentId ?? '',
					cashAccountId: source.cashAccountId ?? '',
					quantity: source.quantity ?? '',
					price: source.price ?? '',
					fee: source.fee ?? '',
					tax: source.tax ?? '',
					amount: source.amount ?? '',
					note: source.note ?? ''
				};
			} else if (start) {
				group = groupOf(start.kind);
				form = {
					...blank(start.kind),
					instrumentId: start.instrumentId ?? '',
					cashAccountId: start.cashAccountId ?? ''
				};
			} else {
				group = 'trades';
				form = blank('BUY');
			}
		});
	});

	function switchGroup(next: string) {
		group = next as Group;
		const keep = { tradeDate: form.tradeDate, note: form.note };
		form = { ...blank(GROUPS.find((g) => g.value === group)!.kinds[0]), ...keep };
		errors = {};
	}

	const kinds = $derived(GROUPS.find((g) => g.value === group)!.kinds);
	const needsInstrument = $derived(group === 'trades' || form.kind === 'DIVIDEND');
	const instrument = $derived(instrumentById(form.instrumentId || null));
	// The cash account must be in the instrument's quote currency.
	const accountChoices = $derived(
		needsInstrument && instrument
			? portfolioCashAccounts().filter((c) => c.currency === instrument.quoteCurrency)
			: portfolioCashAccounts()
	);
	const currency = $derived(
		instrument?.quoteCurrency ?? cashAccountById(form.cashAccountId)?.currency ?? ''
	);

	$effect(() => {
		// Keep the chosen account valid as the instrument changes.
		const choices = accountChoices;
		untrack(() => {
			if (!choices.some((c) => c.id === form.cashAccountId)) {
				form.cashAccountId = choices.length === 1 ? choices[0].id : '';
			}
		});
	});

	const filledDecimal = (v: string) => DECIMAL_INPUT.test(v.trim());

	function payload(): TransactionInput {
		const opt = (v: string) => (v.trim() === '' ? null : v.trim());
		const trade = group === 'trades';
		const charged = trade || group === 'incomes';
		return {
			kind: form.kind,
			tradeDate: form.tradeDate,
			instrumentId: needsInstrument ? form.instrumentId : null,
			cashAccountId: form.cashAccountId,
			quantity: trade ? opt(form.quantity) : null,
			price: trade ? opt(form.price) : null,
			fee: charged ? opt(form.fee) : null,
			tax: charged ? opt(form.tax) : null,
			amount: trade ? null : opt(form.amount),
			ratio: null,
			cashInLieuQuantity: null,
			note: opt(form.note)
		};
	}

	const preview = $derived.by(() => {
		const p = payload();
		const required = group === 'trades' ? [form.quantity, form.price] : [form.amount];
		const optional = group === 'trades' || group === 'incomes' ? [form.fee, form.tax] : [];
		if (!required.every(filledDecimal)) return null;
		if (!optional.every((v) => v.trim() === '' || filledDecimal(v))) return null;
		return currency ? money(cashDelta(p), currency) : null;
	});

	function validate(): boolean {
		const e: Record<string, string> = {};
		const positive = (field: keyof typeof form, label: string) => {
			const v = String(form[field]).trim();
			if (!v) e[field] = `${label} is required`;
			else if (!DECIMAL_INPUT.test(v)) e[field] = 'Up to 15 digits and 8 decimal places';
			else if (isZero(v)) e[field] = `${label} must be greater than 0`;
		};
		const optional = (field: keyof typeof form) => {
			const v = String(form[field]).trim();
			if (v && !DECIMAL_INPUT.test(v)) e[field] = 'Up to 15 digits and 8 decimal places';
		};

		if (!form.tradeDate) e.tradeDate = 'Date is required';
		if (needsInstrument && !form.instrumentId) e.instrumentId = 'Choose an instrument';
		if (!form.cashAccountId) e.cashAccountId = 'Choose a cash account';
		if (group === 'trades') {
			positive('quantity', 'Shares');
			positive('price', 'Price');
		} else {
			positive('amount', group === 'incomes' ? 'Total received' : 'Amount');
		}
		if (group === 'trades' || group === 'incomes') {
			optional('fee');
			optional('tax');
		}
		if (form.note.length > 500) e.note = 'At most 500 characters';
		errors = e;
		return Object.keys(e).length === 0;
	}

	function save(addMore: boolean) {
		if (!validate()) return;
		const p = payload();
		if (editing) {
			updateTransaction(editing.id, p);
			toast.success('Transaction updated');
		} else {
			createTransaction(p);
			toast.success(`${describe(p)} added`);
		}
		if (addMore) {
			form = { ...blank(form.kind), tradeDate: form.tradeDate, instrumentId: form.instrumentId };
			errors = {};
		} else {
			open = false;
		}
	}
</script>

{#snippet error(field: string)}
	{#if errors[field]}
		<p class="text-xs text-destructive">{errors[field]}</p>
	{/if}
{/snippet}

{#snippet decimalField(
	field: 'quantity' | 'price' | 'fee' | 'tax' | 'amount',
	label: string,
	required: boolean,
	suffix: string
)}
	<div class="space-y-1.5">
		<Label for={field}>
			{label}
			{#if required}<span class="text-destructive">*</span>{/if}
		</Label>
		<div class="relative">
			<Input
				id={field}
				inputmode="decimal"
				autocomplete="off"
				placeholder={required ? label : 'Optional'}
				bind:value={form[field]}
				aria-invalid={errors[field] ? true : undefined}
				class={suffix ? 'pr-12' : ''}
			/>
			{#if suffix}
				<span
					class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
				>
					{suffix}
				</span>
			{/if}
		</div>
		{@render error(field)}
	</div>
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Edit transaction' : 'New transaction'}</Dialog.Title>
		</Dialog.Header>

		<Tabs.Root value={group} onValueChange={switchGroup}>
			<Tabs.List class="w-full">
				{#each GROUPS as g (g.value)}
					<Tabs.Trigger value={g.value} disabled={!!editing && g.value !== group}>
						{g.label}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>

		<form
			class="space-y-4"
			onsubmit={(event) => {
				event.preventDefault();
				save(false);
			}}
		>
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<Label>Operation <span class="text-destructive">*</span></Label>
					<Select.Root type="single" bind:value={form.kind}>
						<Select.Trigger class="w-full">{KIND_LABEL[form.kind]}</Select.Trigger>
						<Select.Content>
							{#each kinds as k (k)}
								<Select.Item value={k} label={KIND_LABEL[k]} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-1.5">
					<Label for="tradeDate">Date <span class="text-destructive">*</span></Label>
					<Input id="tradeDate" type="date" bind:value={form.tradeDate} />
					{@render error('tradeDate')}
				</div>
			</div>

			{#if needsInstrument}
				<div class="space-y-1.5">
					<Label>Instrument <span class="text-destructive">*</span></Label>
					<Popover.Root bind:open={instrumentOpen}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									role="combobox"
									aria-expanded={instrumentOpen}
									aria-invalid={errors.instrumentId ? true : undefined}
									class="w-full justify-between font-normal"
								>
									{#if instrument}
										<span class="truncate">
											<span class="font-medium">{instrumentLabel(instrument)}</span>
											<span class="text-muted-foreground"> · {instrument.name}</span>
										</span>
									{:else}
										<span class="text-muted-foreground">Search by symbol or name…</span>
									{/if}
									<ChevronsUpDown class="opacity-50" />
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
							<Command.Root>
								<Command.Input placeholder="Search by symbol or name…" />
								<Command.List>
									<Command.Empty>No instrument found.</Command.Empty>
									<Command.Group>
										{#each instruments as i (i.id)}
											<Command.Item
												value={`${i.symbol ?? ''} ${i.name}`}
												onSelect={() => {
													form.instrumentId = i.id;
													instrumentOpen = false;
												}}
											>
												<Check class={form.instrumentId === i.id ? '' : 'invisible'} />
												<div class="flex flex-1 flex-col">
													<span class="font-medium">
														{instrumentLabel(i)}
														{#if i.exchange}
															<span class="font-normal text-muted-foreground">({i.exchange})</span>
														{/if}
													</span>
													<span class="text-xs text-muted-foreground">{i.name}</span>
												</div>
												<span class="text-xs text-muted-foreground">{i.quoteCurrency}</span>
											</Command.Item>
										{/each}
									</Command.Group>
								</Command.List>
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
					{@render error('instrumentId')}
					<p class="text-xs text-muted-foreground">
						Not listed? Add it under <a href={resolve('/instruments')} class="underline"
							>Instruments</a
						> first.
					</p>
				</div>
			{/if}

			{#if group === 'trades'}
				<div class="grid grid-cols-2 gap-3 rounded-lg border p-3">
					{@render decimalField('quantity', 'Shares', true, '')}
					{@render decimalField('price', 'Price', true, currency)}
				</div>
				<div class="grid grid-cols-2 gap-3">
					{@render decimalField('fee', 'Fee', false, currency)}
					{@render decimalField('tax', 'Tax', false, currency)}
				</div>
			{:else if group === 'incomes'}
				{@render decimalField('amount', 'Total received', true, currency)}
				<div class="grid grid-cols-2 gap-3">
					{@render decimalField('fee', 'Fee', false, currency)}
					{@render decimalField('tax', 'Tax withheld', false, currency)}
				</div>
			{:else}
				{@render decimalField('amount', 'Amount', true, currency)}
			{/if}

			<div class="space-y-1.5">
				<Label>Cash account <span class="text-destructive">*</span></Label>
				<Select.Root type="single" bind:value={form.cashAccountId}>
					<Select.Trigger class="w-full" aria-invalid={errors.cashAccountId ? true : undefined}>
						{#if cashAccountById(form.cashAccountId)}
							{@const account = cashAccountById(form.cashAccountId)!}
							{account.name} · {account.currency}
						{:else}
							<span class="text-muted-foreground">Choose an account</span>
						{/if}
					</Select.Trigger>
					<Select.Content>
						{#each accountChoices as c (c.id)}
							<Select.Item value={c.id} label={`${c.name} · ${c.currency}`} />
						{/each}
					</Select.Content>
				</Select.Root>
				{@render error('cashAccountId')}
			</div>

			<div class="space-y-1.5">
				<Label for="note">Note</Label>
				<Textarea id="note" rows={2} bind:value={form.note} />
				{@render error('note')}
			</div>

			<div class="flex items-end justify-between border-t pt-4">
				<div>
					<p class="text-xs text-muted-foreground">Cash effect</p>
					<p class="text-xl font-semibold tabular-nums">{preview ?? '—'}</p>
				</div>
			</div>

			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				{#if editing}
					<Button type="submit">Save changes</Button>
				{:else}
					<Button type="submit" variant="outline">Save</Button>
					<Button type="button" onclick={() => save(true)}>Save and add more</Button>
				{/if}
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
