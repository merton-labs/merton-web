<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line';
	import ArrowUpFromLine from '@lucide/svelte/icons/arrow-up-from-line';
	import TransactionDialog from '#lib/components/transactions/transaction-dialog.svelte';
	import { isNegative, money } from '#lib/format.js';
	import { CURRENCY_CODE, currentPortfolio } from '#lib/portfolio.svelte.js';
	import {
		cashAccountInUse,
		createCashAccount,
		deleteCashAccount,
		renameCashAccount,
		type CashAccount,
		type Kind
	} from '#lib/transactions.svelte.js';
	import { UNVALUED_LABEL, valuation } from '#lib/valuation.svelte.js';

	const asOf = new Date().toISOString().slice(0, 10);
	const v = $derived(valuation(asOf));
	const base = $derived(currentPortfolio().baseCurrency);

	let txOpen = $state(false);
	let preset = $state<{ kind: Kind; cashAccountId: string } | null>(null);

	let editOpen = $state(false);
	let editing = $state<CashAccount | null>(null);
	let form = $state({ name: '', currency: '' });
	let errors = $state<Record<string, string>>({});
	let pendingDelete = $state<CashAccount | null>(null);

	function openTx(kind: Kind, cashAccountId: string) {
		preset = { kind, cashAccountId };
		txOpen = true;
	}

	function openEdit(account: CashAccount | null) {
		editing = account;
		form = { name: account?.name ?? '', currency: account?.currency ?? base };
		errors = {};
		editOpen = true;
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		const e: Record<string, string> = {};
		const name = form.name.trim();
		const currency = form.currency.trim().toUpperCase();
		if (!name) e.name = 'Name is required';
		else if (name.length > 100) e.name = 'At most 100 characters';
		if (!editing && !CURRENCY_CODE.test(currency)) e.currency = 'Use a 3-letter code such as THB';
		errors = e;
		if (Object.keys(e).length) return;
		if (editing) {
			renameCashAccount(editing.id, name);
			toast.success('Cash account renamed');
		} else {
			createCashAccount(name, currency);
			toast.success(`${name} added`);
		}
		editOpen = false;
	}

	function confirmDelete() {
		if (!pendingDelete) return;
		deleteCashAccount(pendingDelete.id);
		toast.success('Cash account deleted');
		pendingDelete = null;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Cash accounts</h1>
			<p class="text-sm text-muted-foreground">
				Balances are the sum of each account's movements; negative balances are allowed.
			</p>
		</div>
		<Button onclick={() => openEdit(null)}><Plus /> Add account</Button>
	</div>

	<Card.Root class="py-0">
		<Card.Content class="p-4 md:px-6">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Account</Table.Head>
						<Table.Head>Currency</Table.Head>
						<Table.Head class="text-right">Balance</Table.Head>
						<Table.Head class="text-right">Value ({base})</Table.Head>
						<Table.Head class="w-56"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each v.cash as c (c.account.id)}
						<Table.Row>
							<Table.Cell class="font-medium">{c.account.name}</Table.Cell>
							<Table.Cell>{c.account.currency}</Table.Cell>
							<Table.Cell
								class="text-right tabular-nums {isNegative(c.balance) ? 'text-destructive' : ''}"
							>
								{money(c.balance, c.account.currency)}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{#if c.value}
									<div>{money(c.value, base)}</div>
									{#if c.fx}
										<div class="text-xs text-muted-foreground">@ {c.fx.value} · {c.fx.date}</div>
									{/if}
								{:else}
									<span class="text-xs text-muted-foreground">
										{c.unvaluedReason ? UNVALUED_LABEL[c.unvaluedReason] : '—'}
									</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<div class="flex justify-end gap-1">
									<Button
										variant="outline"
										size="sm"
										onclick={() => openTx('DEPOSIT', c.account.id)}
									>
										<ArrowDownToLine /> Deposit
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() => openTx('WITHDRAWAL', c.account.id)}
									>
										<ArrowUpFromLine /> Withdraw
									</Button>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions">
													<Ellipsis />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onclick={() => openEdit(c.account)}
												>Rename</DropdownMenu.Item
											>
											<DropdownMenu.Item
												variant="destructive"
												disabled={cashAccountInUse(c.account.id)}
												onclick={() => (pendingDelete = c.account)}
											>
												{cashAccountInUse(c.account.id) ? 'Delete (has transactions)' : 'Delete'}
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</div>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={5} class="h-24 text-center text-muted-foreground">
								No cash accounts yet. Add one per currency you hold cash in.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
				{#if v.cash.length > 0}
					<Table.Footer>
						<Table.Row>
							<Table.Cell colspan={3} class="font-medium">Total cash</Table.Cell>
							<Table.Cell class="text-right font-medium tabular-nums">
								{money(v.cashValue, base)}
							</Table.Cell>
							<Table.Cell></Table.Cell>
						</Table.Row>
					</Table.Footer>
				{/if}
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>

<TransactionDialog bind:open={txOpen} {preset} />

<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Rename cash account' : 'New cash account'}</Dialog.Title>
			<Dialog.Description>
				{editing
					? 'The currency of an account cannot change.'
					: 'Each account holds one currency. You can have several per portfolio.'}
			</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-4" onsubmit={save}>
			<div class="space-y-1.5">
				<Label for="cash-name">Name <span class="text-destructive">*</span></Label>
				<Input id="cash-name" bind:value={form.name} placeholder="e.g. Broker THB" />
				{#if errors.name}<p class="text-xs text-destructive">{errors.name}</p>{/if}
			</div>
			<div class="space-y-1.5">
				<Label for="cash-currency">Currency <span class="text-destructive">*</span></Label>
				<Input
					id="cash-currency"
					bind:value={form.currency}
					maxlength={3}
					class="uppercase"
					disabled={!!editing}
				/>
				{#if errors.currency}<p class="text-xs text-destructive">{errors.currency}</p>{/if}
			</div>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (editOpen = false)}>Cancel</Button>
				<Button type="submit">Save</Button>
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
			<Dialog.Description>This account has no transactions and will be removed.</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="ghost" onclick={() => (pendingDelete = null)}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDelete}>Yes, delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
