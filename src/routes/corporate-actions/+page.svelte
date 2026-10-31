<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { DECIMAL_INPUT, isZero } from '#lib/decimal.js';
	import { money, quantity } from '#lib/format.js';
	import { currentPortfolio } from '#lib/portfolio.svelte.js';
	import { toastError } from '#lib/notify.js';
	import {
		CORPORATE_KINDS,
		EMPTY_FIELDS,
		KIND_LABEL,
		createTransaction,
		deleteTransactions,
		describe,
		instrumentById,
		instrumentLabel,
		instruments,
		portfolioCashAccounts,
		portfolioTransactions,
		updateTransaction,
		cashAccountById,
		type Kind,
		type Transaction
	} from '#lib/transactions.svelte.js';

	const today = () => new Date().toISOString().slice(0, 10);

	let open = $state(false);
	let editing = $state<Transaction | null>(null);
	let form = $state(blank());
	let errors = $state<Record<string, string>>({});
	let pendingDelete = $state<Transaction | null>(null);

	function blank() {
		return {
			kind: 'STOCK_SPLIT' as Kind,
			instrumentId: '',
			tradeDate: today(),
			newShares: '',
			oldShares: '',
			quantity: '',
			cashInLieuQuantity: '',
			amount: '',
			cashAccountId: '',
			note: ''
		};
	}

	const rows = $derived(
		portfolioTransactions()
			.filter((t) => CORPORATE_KINDS.includes(t.kind))
			.toSorted((a, b) => b.tradeDate.localeCompare(a.tradeDate))
	);

	const instrument = $derived(instrumentById(form.instrumentId || null));
	const accountChoices = $derived(
		portfolioCashAccounts().filter((c) => !instrument || c.currency === instrument.quoteCurrency)
	);

	function description(t: Transaction): string {
		const i = instrumentById(t.instrumentId);
		const name = i ? `${i.name} (${instrumentLabel(i)})` : '—';
		if (t.kind === 'STOCK_SPLIT' && t.ratio) {
			const [n, o] = t.ratio.split(':');
			return `${name} ${o} → ${n}`;
		}
		return `${name} +${quantity(t.quantity ?? '0')} shares`;
	}

	function openEdit(t: Transaction | null) {
		editing = t;
		if (t) {
			const [n = '', o = ''] = t.ratio?.split(':') ?? [];
			form = {
				kind: t.kind,
				instrumentId: t.instrumentId ?? '',
				tradeDate: t.tradeDate,
				newShares: n,
				oldShares: o,
				quantity: t.quantity ?? '',
				cashInLieuQuantity: t.cashInLieuQuantity ?? '',
				amount: t.amount ?? '',
				cashAccountId: t.cashAccountId ?? '',
				note: t.note ?? ''
			};
		} else {
			form = blank();
		}
		errors = {};
		open = true;
	}

	let busy = $state(false);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const e: Record<string, string> = {};
		const positive = (key: keyof typeof form, label: string) => {
			const v = String(form[key]).trim();
			if (!DECIMAL_INPUT.test(v)) e[key] = `${label}: a positive decimal, up to 8 places`;
			else if (isZero(v)) e[key] = `${label} must be greater than 0`;
		};
		if (!form.instrumentId) e.instrumentId = 'Choose an instrument';
		if (!form.tradeDate) e.tradeDate = 'Date is required';
		if (form.kind === 'STOCK_SPLIT') {
			positive('newShares', 'New shares');
			positive('oldShares', 'Old shares');
		} else {
			positive('quantity', 'Shares received');
		}
		const inLieu = form.cashInLieuQuantity.trim() !== '' || form.amount.trim() !== '';
		if (inLieu) {
			positive('cashInLieuQuantity', 'Fractional shares');
			positive('amount', 'Cash paid');
			if (!form.cashAccountId) e.cashAccountId = 'Choose the account that received the cash';
		}
		errors = e;
		if (Object.keys(e).length) return;

		const input = {
			...EMPTY_FIELDS,
			kind: form.kind,
			tradeDate: form.tradeDate,
			instrumentId: form.instrumentId,
			cashAccountId: inLieu ? form.cashAccountId : null,
			quantity: form.kind === 'STOCK_DIVIDEND' ? form.quantity.trim() : null,
			price: null,
			fee: null,
			tax: null,
			amount: inLieu ? form.amount.trim() : null,
			ratio:
				form.kind === 'STOCK_SPLIT' ? `${form.newShares.trim()}:${form.oldShares.trim()}` : null,
			cashInLieuQuantity: inLieu ? form.cashInLieuQuantity.trim() : null,
			note: form.note.trim() || null
		};
		busy = true;
		try {
			if (editing) {
				await updateTransaction(editing, input);
				toast.success('Corporate action updated');
			} else {
				await createTransaction(currentPortfolio().id, input);
				toast.success(`${describe(input)} added`);
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
			await deleteTransactions([pendingDelete]);
			toast.success('Corporate action deleted');
		} catch (err) {
			toastError(err);
		} finally {
			pendingDelete = null;
			busy = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Corporate actions</h1>
			<p class="text-sm text-muted-foreground">
				Splits, reverse splits and stock dividends adjust your FIFO lots without changing total
				cost.
			</p>
		</div>
		<Button onclick={() => openEdit(null)}><Plus /> Add</Button>
	</div>

	<Card.Root class="py-0">
		<Card.Content class="p-4 md:px-6">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Event</Table.Head>
						<Table.Head>Date</Table.Head>
						<Table.Head>Description</Table.Head>
						<Table.Head class="text-right">Cash in lieu</Table.Head>
						<Table.Head class="w-20"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as t (t.id)}
						{@const account = cashAccountById(t.cashAccountId)}
						<Table.Row>
							<Table.Cell class="font-medium">{KIND_LABEL[t.kind]}</Table.Cell>
							<Table.Cell class="tabular-nums">{t.tradeDate}</Table.Cell>
							<Table.Cell>{description(t)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{t.amount && account ? money(t.amount, account.currency) : '—'}
							</Table.Cell>
							<Table.Cell>
								<div class="flex justify-end gap-1">
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label="Edit"
										onclick={() => openEdit(t)}
									>
										<Pencil />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										class="text-destructive"
										aria-label="Delete"
										onclick={() => (pendingDelete = t)}
									>
										<Trash2 />
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={5} class="h-24 text-center text-muted-foreground">
								No corporate actions recorded.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Edit corporate action' : 'New corporate action'}</Dialog.Title>
		</Dialog.Header>
		<form class="space-y-4" onsubmit={save}>
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<Label>Event <span class="text-destructive">*</span></Label>
					<Select.Root type="single" bind:value={form.kind} disabled={!!editing}>
						<Select.Trigger class="w-full">{KIND_LABEL[form.kind]}</Select.Trigger>
						<Select.Content>
							{#each CORPORATE_KINDS as k (k)}
								<Select.Item value={k} label={KIND_LABEL[k]} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-1.5">
					<Label for="ca-date">Date <span class="text-destructive">*</span></Label>
					<Input id="ca-date" type="date" bind:value={form.tradeDate} />
				</div>
			</div>

			<div class="space-y-1.5">
				<Label>Instrument <span class="text-destructive">*</span></Label>
				<Select.Root type="single" bind:value={form.instrumentId}>
					<Select.Trigger class="w-full">
						{instrument
							? `${instrumentLabel(instrument)} · ${instrument.name}`
							: 'Choose an instrument'}
					</Select.Trigger>
					<Select.Content>
						{#each instruments as i (i.id)}
							<Select.Item value={i.id} label={`${instrumentLabel(i)} · ${i.name}`} />
						{/each}
					</Select.Content>
				</Select.Root>
				{#if errors.instrumentId}<p class="text-xs text-destructive">{errors.instrumentId}</p>{/if}
			</div>

			{#if form.kind === 'STOCK_SPLIT'}
				<div class="space-y-1.5">
					<Label>Ratio <span class="text-destructive">*</span></Label>
					<div class="flex items-center gap-2">
						<Input inputmode="decimal" placeholder="New, e.g. 4" bind:value={form.newShares} />
						<span class="text-muted-foreground">new for</span>
						<Input inputmode="decimal" placeholder="Old, e.g. 1" bind:value={form.oldShares} />
						<span class="text-muted-foreground">old</span>
					</div>
					<p class="text-xs text-muted-foreground">
						A 4-for-1 split is 4 new for 1 old; a 1-for-10 reverse split is 1 new for 10 old.
					</p>
					{#if errors.newShares}<p class="text-xs text-destructive">{errors.newShares}</p>{/if}
					{#if errors.oldShares}<p class="text-xs text-destructive">{errors.oldShares}</p>{/if}
				</div>
			{:else}
				<div class="space-y-1.5">
					<Label for="ca-qty">Shares received <span class="text-destructive">*</span></Label>
					<Input id="ca-qty" inputmode="decimal" bind:value={form.quantity} />
					{#if errors.quantity}<p class="text-xs text-destructive">{errors.quantity}</p>{/if}
				</div>
			{/if}

			<fieldset class="space-y-3 rounded-lg border p-3">
				<legend class="px-1 text-sm font-medium">Cash in lieu (optional)</legend>
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<Label for="ca-frac">Fractional shares</Label>
						<Input id="ca-frac" inputmode="decimal" bind:value={form.cashInLieuQuantity} />
					</div>
					<div class="space-y-1.5">
						<Label for="ca-amount">Cash paid</Label>
						<Input id="ca-amount" inputmode="decimal" bind:value={form.amount} />
					</div>
				</div>
				<Select.Root type="single" bind:value={form.cashAccountId}>
					<Select.Trigger class="w-full">
						{cashAccountById(form.cashAccountId)?.name ?? 'Cash account'}
					</Select.Trigger>
					<Select.Content>
						{#each accountChoices as c (c.id)}
							<Select.Item value={c.id} label={`${c.name} · ${c.currency}`} />
						{/each}
					</Select.Content>
				</Select.Root>
				{#each ['cashInLieuQuantity', 'amount', 'cashAccountId'] as key (key)}
					{#if errors[key]}<p class="text-xs text-destructive">{errors[key]}</p>{/if}
				{/each}
				<p class="text-xs text-muted-foreground">
					How fractional shares leave the FIFO lots is still an open decision (ADR-TXN-07).
				</p>
			</fieldset>

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
		{#if pendingDelete}
			<Dialog.Header>
				<Dialog.Title>Delete "{describe(pendingDelete)}"</Dialog.Title>
				<Dialog.Description>
					Holdings and cost basis are recalculated. A deletion that would make a later sale oversell
					is rejected by the ledger.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button variant="ghost" onclick={() => (pendingDelete = null)}>Cancel</Button>
				<Button variant="destructive" disabled={busy} onclick={confirmDelete}>Yes, delete</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
