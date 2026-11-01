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
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Check from '@lucide/svelte/icons/check';
	import { DECIMAL_INPUT, SIGNED_DECIMAL_INPUT, cleanDecimal, isZero } from '#lib/decimal.js';
	import { money } from '#lib/format.js';
	import { currentPortfolio } from '#lib/portfolio.svelte.js';
	import { toastError } from '#lib/notify.js';
	import { live } from '#lib/live.svelte.js';
	import { fetchValuation } from '#lib/valuation.svelte.js';
	import {
		CASH_KINDS,
		EXPENSE_KINDS,
		INCOME_KINDS,
		KIND_LABEL,
		TRADE_KINDS,
		TRANSFER_KINDS,
		cashAccountById,
		portfolioCashAccounts,
		instrumentLabel,
		EMPTY_FIELDS,
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
	let busy = $state(false);

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
			destinationCashAccountId: '',
			destinationAmount: '',
			/**
			 * Trades, dividends and expenses: off records it without touching cash.
			 * Snowball starts every form with it off.
			 */
			updateCash: false,
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
					destinationCashAccountId: source.destinationCashAccountId ?? '',
					destinationAmount: source.destinationAmount ?? '',
					updateCash: source.cashAccountId !== null,
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
	const needsInstrument = $derived(
		group === 'trades' || form.kind === 'DIVIDEND' || form.kind === 'OTHER_EXPENSE'
	);
	// Snowball lets a fee, tax or tax return name an instrument, optionally.
	const showsInstrument = $derived(needsInstrument || group === 'expenses');
	const isTransfer = $derived(TRANSFER_KINDS.includes(form.kind));
	const isOpening = $derived(form.kind === 'OPENING_POSITION');
	// The API makes the cash account optional for trades, dividends and expenses.
	const canSkipCash = $derived(
		(group === 'trades' && !isOpening) || form.kind === 'DIVIDEND' || group === 'expenses'
	);
	const tracksCash = $derived(!isOpening && (!canSkipCash || form.updateCash));
	// Snowball shows the current cash balance above "Update cash balance", ticked or not.
	const valuation = live(() =>
		open && canSkipCash ? fetchValuation(currentPortfolio().id, today()) : Promise.resolve(null)
	);
	const currentBalance = $derived(
		valuation.value?.cash.find((c) => c.account.id === form.cashAccountId)?.balance ?? null
	);
	const cashHint = $derived(
		group === 'trades'
			? 'The cash account pays for the buy or receives the sale. Leave it unticked for holdings you already owned or moved from another broker.'
			: group === 'incomes'
				? 'The cash account receives the dividend, less tax and fee.'
				: form.kind === 'TAX_RETURN'
					? 'The cash account receives the amount. Unticked, it needs an instrument.'
					: 'The cash account pays the amount. Unticked, it needs an instrument.'
	);
	const amountInput = $derived(form.kind === 'OPENING_CASH' ? SIGNED_DECIMAL_INPUT : DECIMAL_INPUT);
	const instrument = $derived(instrumentById(form.instrumentId || null));
	// The cash account must be in the instrument's quote currency.
	const accountChoices = $derived(
		showsInstrument && instrument
			? portfolioCashAccounts().filter((c) => c.currency === instrument.quoteCurrency)
			: portfolioCashAccounts()
	);
	const currency = $derived(
		instrument?.quoteCurrency ?? cashAccountById(form.cashAccountId)?.currency ?? ''
	);
	// A transfer stays in one currency; a conversion must change it (the API enforces both).
	const destinationChoices = $derived(
		portfolioCashAccounts().filter(
			(c) =>
				c.id !== form.cashAccountId &&
				(!currency || (form.kind === 'FX_EXCHANGE') !== (c.currency === currency))
		)
	);
	const destinationCurrency = $derived(
		cashAccountById(form.destinationCashAccountId)?.currency ?? ''
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

	$effect(() => {
		const choices = destinationChoices;
		untrack(() => {
			if (!choices.some((c) => c.id === form.destinationCashAccountId)) {
				form.destinationCashAccountId = choices.length === 1 ? choices[0].id : '';
			}
		});
	});

	const filledDecimal = (v: string) => DECIMAL_INPUT.test(cleanDecimal(v));

	function payload(): TransactionInput {
		const opt = (v: string) => (v.trim() === '' ? null : v.trim());
		const num = (v: string) => opt(cleanDecimal(v));
		const trade = group === 'trades';
		const charged = (trade && !isOpening) || group === 'incomes';
		return {
			...EMPTY_FIELDS,
			kind: form.kind,
			tradeDate: form.tradeDate,
			instrumentId: showsInstrument && form.instrumentId ? form.instrumentId : null,
			cashAccountId: tracksCash ? form.cashAccountId : null,
			quantity: trade ? num(form.quantity) : null,
			// A dividend's `price` is its payout per share, kept for reference.
			price: (trade && !isOpening) || form.kind === 'DIVIDEND' ? num(form.price) : null,
			fee: charged || isTransfer ? num(form.fee) : null,
			tax: charged ? num(form.tax) : null,
			// An opening position carries its total cost in `amount`.
			amount: trade && !isOpening ? null : num(form.amount),
			destinationCashAccountId: isTransfer ? form.destinationCashAccountId : null,
			destinationAmount: form.kind === 'FX_EXCHANGE' ? num(form.destinationAmount) : null,
			note: opt(form.note)
		};
	}

	const preview = $derived.by(() => {
		const p = payload();
		if (!tracksCash) return 'No cash effect';
		const required = group === 'trades' ? [form.quantity, form.price] : [];
		const optional =
			group === 'trades' || group === 'incomes'
				? [form.fee, form.tax]
				: isTransfer
					? [form.fee]
					: [];
		if (group !== 'trades' && !amountInput.test(cleanDecimal(form.amount))) return null;
		if (!required.every(filledDecimal)) return null;
		if (!optional.every((v) => v.trim() === '' || filledDecimal(v))) return null;
		if (!currency) return null;
		const source = money(cashDelta(p), currency);
		// The destination account is credited the amount (a transfer) or the amount received.
		if (form.kind === 'CASH_TRANSFER')
			return `${source} · +${money(cleanDecimal(form.amount), currency)}`;
		if (form.kind === 'FX_EXCHANGE' && destinationCurrency && filledDecimal(form.destinationAmount))
			return `${source} · +${money(cleanDecimal(form.destinationAmount), destinationCurrency)}`;
		return source;
	});

	function validate(): boolean {
		const e: Record<string, string> = {};
		const positive = (field: keyof typeof form, label: string) => {
			const v = cleanDecimal(String(form[field]));
			if (!v) e[field] = `${label} is required`;
			else if (!DECIMAL_INPUT.test(v)) e[field] = 'Up to 15 digits and 8 decimal places';
			else if (isZero(v)) e[field] = `${label} must be greater than 0`;
		};
		const optional = (field: keyof typeof form) => {
			const v = cleanDecimal(String(form[field]));
			if (v && !DECIMAL_INPUT.test(v)) e[field] = 'Up to 15 digits and 8 decimal places';
		};

		if (!form.tradeDate) e.tradeDate = 'Date is required';
		if (needsInstrument && !form.instrumentId) e.instrumentId = 'Choose an instrument';
		// Without either, the amount has no currency.
		else if (group === 'expenses' && !form.instrumentId && !tracksCash)
			e.instrumentId = 'Choose an instrument, or tick Update cash balance';
		if (tracksCash && !form.cashAccountId) e.cashAccountId = 'Choose a cash account';
		if (group === 'trades') {
			positive('quantity', 'Shares');
			if (isOpening) positive('amount', 'Total cost');
			else positive('price', 'Price');
		} else if (form.kind === 'OPENING_CASH') {
			if (!SIGNED_DECIMAL_INPUT.test(cleanDecimal(form.amount)))
				e.amount = 'A decimal, negative if overdrawn; up to 15 digits and 8 decimal places';
		} else {
			positive('amount', group === 'incomes' ? 'Total received' : 'Amount');
		}
		if ((group === 'trades' && !isOpening) || group === 'incomes') {
			optional('fee');
			optional('tax');
		}
		if (form.kind === 'DIVIDEND') optional('price');
		if (isTransfer) {
			if (!form.destinationCashAccountId)
				e.destinationCashAccountId =
					form.kind === 'FX_EXCHANGE'
						? 'Choose an account in another currency'
						: 'Choose another account in the same currency';
			if (form.kind === 'FX_EXCHANGE') positive('destinationAmount', 'Amount received');
			optional('fee');
		}
		if (form.note.length > 500) e.note = 'At most 500 characters';
		errors = e;
		return Object.keys(e).length === 0;
	}

	async function save(addMore: boolean) {
		if (!validate()) return;
		const p = payload();
		busy = true;
		try {
			if (editing) {
				await updateTransaction(editing, p);
				toast.success('Transaction updated');
			} else {
				await createTransaction(currentPortfolio().id, p);
				toast.success(`${describe(p)} added`);
			}
		} catch (err) {
			// The ledger revalidates the whole history, e.g. a sell beyond the holding.
			toastError(err);
			return;
		} finally {
			busy = false;
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

{#snippet cashAccountField()}
	<div class="space-y-1.5">
		<Label>
			{isTransfer ? 'From account' : 'Cash account'} <span class="text-destructive">*</span>
		</Label>
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
{/snippet}

{#snippet decimalField(
	field: 'quantity' | 'price' | 'fee' | 'tax' | 'amount' | 'destinationAmount',
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

			{#if showsInstrument}
				<div class="space-y-1.5">
					<Label>
						Instrument
						{#if needsInstrument}<span class="text-destructive">*</span>{:else}<span
								class="font-normal text-muted-foreground">(optional)</span
							>{/if}
					</Label>
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

			{#if isOpening}
				<div class="grid grid-cols-2 gap-3 rounded-lg border p-3">
					{@render decimalField('quantity', 'Shares', true, '')}
					{@render decimalField('amount', 'Total cost', true, currency)}
				</div>
				<p class="-mt-2 text-xs text-muted-foreground">
					A holding you already owned, as one FIFO lot at its total cost (without fees). Cash is not
					touched. To keep each purchase's price, add buys with "Update cash balance" unticked.
				</p>
			{:else if group === 'trades'}
				<div class="grid grid-cols-2 gap-3 rounded-lg border p-3">
					{@render decimalField('quantity', 'Shares', true, '')}
					{@render decimalField('price', 'Price', true, currency)}
				</div>
				<div class="grid grid-cols-2 gap-3">
					{@render decimalField('fee', 'Fee', false, currency)}
					{@render decimalField('tax', 'Tax', false, currency)}
				</div>
			{:else if group === 'incomes'}
				{#if form.kind === 'DIVIDEND'}
					<div class="grid grid-cols-2 gap-3">
						{@render decimalField('amount', 'Total received', true, currency)}
						{@render decimalField('price', 'Per share', false, currency)}
					</div>
					<p class="-mt-2 text-xs text-muted-foreground">
						Total received is before tax. Per share is the payout for one share, for reference only;
						leave it empty if you don't know it.
					</p>
				{:else}
					{@render decimalField('amount', 'Total received', true, currency)}
				{/if}
				<div class="grid grid-cols-2 gap-3">
					{@render decimalField('fee', 'Fee', false, currency)}
					{@render decimalField('tax', 'Tax withheld', false, currency)}
				</div>
			{:else if form.kind === 'OPENING_CASH'}
				{@render decimalField('amount', 'Balance', true, currency)}
				<p class="-mt-2 text-xs text-muted-foreground">
					The account's balance on this date, before the transactions you record after it. Negative
					if overdrawn.
				</p>
			{:else if isTransfer}
				<div class="grid grid-cols-2 gap-3">
					{@render decimalField(
						'amount',
						form.kind === 'FX_EXCHANGE' ? 'Amount spent' : 'Amount',
						true,
						currency
					)}
					{@render decimalField('fee', 'Fee', false, currency)}
				</div>
			{:else if group === 'expenses'}
				{@render decimalField(
					'amount',
					form.kind === 'FEE' ? 'Fee' : form.kind === 'OTHER_EXPENSE' ? 'Amount' : 'Tax',
					true,
					currency
				)}
				{#if form.kind === 'FEE'}
					<p class="-mt-2 text-xs text-muted-foreground">
						A fixed broker fee, e.g. monthly. A trade's own fee goes on the trade.
					</p>
				{/if}
			{:else}
				{@render decimalField('amount', 'Amount', true, currency)}
			{/if}

			{#if tracksCash && !canSkipCash}
				{@render cashAccountField()}
			{/if}

			{#if isTransfer}
				<div class="grid gap-3 {form.kind === 'FX_EXCHANGE' ? 'grid-cols-2' : ''}">
					<div class="space-y-1.5">
						<Label>To account <span class="text-destructive">*</span></Label>
						<Select.Root type="single" bind:value={form.destinationCashAccountId}>
							<Select.Trigger
								class="w-full"
								aria-invalid={errors.destinationCashAccountId ? true : undefined}
							>
								{#if cashAccountById(form.destinationCashAccountId)}
									{@const account = cashAccountById(form.destinationCashAccountId)!}
									{account.name} · {account.currency}
								{:else}
									<span class="text-muted-foreground">Choose an account</span>
								{/if}
							</Select.Trigger>
							<Select.Content>
								{#each destinationChoices as c (c.id)}
									<Select.Item value={c.id} label={`${c.name} · ${c.currency}`} />
								{:else}
									<p class="px-2 py-1.5 text-sm text-muted-foreground">
										{form.kind === 'FX_EXCHANGE'
											? 'No account in another currency.'
											: 'No other account in this currency.'}
									</p>
								{/each}
							</Select.Content>
						</Select.Root>
						{@render error('destinationCashAccountId')}
					</div>
					{#if form.kind === 'FX_EXCHANGE'}
						{@render decimalField(
							'destinationAmount',
							'Amount received',
							true,
							destinationCurrency
						)}
					{/if}
				</div>
			{/if}

			<div class="space-y-1.5">
				<Label for="note">Note</Label>
				<Textarea id="note" rows={2} bind:value={form.note} />
				{@render error('note')}
			</div>

			<!-- As in Snowball: below the note, unticked by default, with the balance above it. -->
			{#if canSkipCash}
				<div class="space-y-1">
					{#if currentBalance !== null}
						<p class="text-xs text-muted-foreground">
							Current cash balance: {money(currentBalance, currency)}
						</p>
					{/if}
					<Label class="flex items-center gap-2 font-normal">
						<Checkbox bind:checked={form.updateCash} />
						Update cash balance
					</Label>
					<p class="text-xs text-muted-foreground">{cashHint}</p>
				</div>
				{#if tracksCash}
					{@render cashAccountField()}
				{/if}
			{/if}

			<div class="flex items-end justify-between border-t pt-4">
				<div>
					<p class="text-xs text-muted-foreground">Cash effect</p>
					<p class="text-xl font-semibold tabular-nums">{preview ?? '—'}</p>
				</div>
			</div>

			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				{#if editing}
					<Button type="submit" disabled={busy}>Save changes</Button>
				{:else}
					<Button type="submit" variant="outline" disabled={busy}>Save</Button>
					<Button type="button" disabled={busy} onclick={() => save(true)}>Save and add more</Button
					>
				{/if}
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
