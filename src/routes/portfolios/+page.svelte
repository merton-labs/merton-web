<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import {
		CURRENCY_CODE,
		createPortfolio,
		deletePortfolio,
		portfolios,
		selectPortfolio,
		session,
		setStatus,
		updatePortfolio,
		type Portfolio,
		type PortfolioStatus
	} from '#lib/portfolio.svelte.js';
	import { toastError } from '#lib/notify.js';

	let open = $state(false);
	let editing = $state<Portfolio | null>(null);
	let form = $state({ name: '', baseCurrency: 'THB' });
	let errors = $state<Record<string, string>>({});
	let pendingDelete = $state<Portfolio | null>(null);
	let busy = $state(false);

	function openEdit(p: Portfolio | null) {
		editing = p;
		form = { name: p?.name ?? '', baseCurrency: p?.baseCurrency ?? 'THB' };
		errors = {};
		open = true;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const e: Record<string, string> = {};
		const name = form.name.trim();
		const baseCurrency = form.baseCurrency.trim().toUpperCase();
		if (!name) e.name = 'Name is required';
		else if (name.length > 100) e.name = 'At most 100 characters';
		if (!CURRENCY_CODE.test(baseCurrency)) e.baseCurrency = 'Use a 3-letter code such as THB';
		errors = e;
		if (Object.keys(e).length) return;
		busy = true;
		try {
			if (editing) {
				await updatePortfolio(editing.id, name, baseCurrency);
				toast.success('Portfolio updated');
			} else {
				await createPortfolio(name, baseCurrency);
				toast.success(`${name} created`);
			}
			open = false;
		} catch (err) {
			toastError(err);
		} finally {
			busy = false;
		}
	}

	async function changeStatus(p: Portfolio, status: PortfolioStatus) {
		try {
			await setStatus(p.id, status);
			toast.success(`${p.name} ${status === 'ARCHIVED' ? 'archived' : 'restored'}`);
		} catch (err) {
			toastError(err);
		}
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		busy = true;
		try {
			await deletePortfolio(pendingDelete.id);
			toast.success('Portfolio deleted');
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
			<h1 class="text-2xl font-semibold tracking-tight">Portfolios</h1>
			<p class="text-sm text-muted-foreground">
				Each portfolio has its own cash accounts, transactions and base currency. Cost basis is
				always FIFO.
			</p>
		</div>
		<Button onclick={() => openEdit(null)}><Plus /> Add portfolio</Button>
	</div>

	<Card.Root class="py-0">
		<Card.Content class="p-4 md:px-6">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Base currency</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Created</Table.Head>
						<Table.Head class="w-32"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each portfolios as p (p.id)}
						<Table.Row data-state={p.id === session.portfolioId ? 'selected' : undefined}>
							<Table.Cell class="font-medium">
								{p.name}
								{#if p.id === session.portfolioId}
									<span class="ml-1 text-xs text-muted-foreground">(current)</span>
								{/if}
							</Table.Cell>
							<Table.Cell>{p.baseCurrency}</Table.Cell>
							<Table.Cell>
								<Badge variant={p.status === 'ACTIVE' ? 'outline' : 'secondary'}>
									{p.status === 'ACTIVE' ? 'Active' : 'Archived'}
								</Badge>
							</Table.Cell>
							<Table.Cell class="tabular-nums">{p.createdAt}</Table.Cell>
							<Table.Cell>
								<div class="flex justify-end gap-1">
									<Button
										variant="outline"
										size="sm"
										disabled={p.id === session.portfolioId}
										onclick={() => selectPortfolio(p.id)}
									>
										Open
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
											<DropdownMenu.Item
												disabled={p.status === 'ARCHIVED'}
												onclick={() => openEdit(p)}
											>
												Edit
											</DropdownMenu.Item>
											{#if p.status === 'ACTIVE'}
												<DropdownMenu.Item onclick={() => changeStatus(p, 'ARCHIVED')}>
													Archive
												</DropdownMenu.Item>
											{:else}
												<DropdownMenu.Item onclick={() => changeStatus(p, 'ACTIVE')}>
													Restore
												</DropdownMenu.Item>
											{/if}
											<DropdownMenu.Separator />
											<DropdownMenu.Item variant="destructive" onclick={() => (pendingDelete = p)}>
												Delete
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Edit portfolio' : 'New portfolio'}</Dialog.Title>
			<Dialog.Description>
				Changing the base currency only changes how values are reported; transactions stay as they
				are.
			</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-4" onsubmit={save}>
			<div class="space-y-1.5">
				<Label for="pf-name">Portfolio name <span class="text-destructive">*</span></Label>
				<Input id="pf-name" bind:value={form.name} />
				{#if errors.name}<p class="text-xs text-destructive">{errors.name}</p>{/if}
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<Label for="pf-ccy">Base currency <span class="text-destructive">*</span></Label>
					<Input id="pf-ccy" maxlength={3} class="uppercase" bind:value={form.baseCurrency} />
					{#if errors.baseCurrency}<p class="text-xs text-destructive">
							{errors.baseCurrency}
						</p>{/if}
				</div>
				<div class="space-y-1.5">
					<Label>Cost basis method</Label>
					<Input value="FIFO (First In, First Out)" disabled />
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
				Only a portfolio without transactions can be deleted; archive it otherwise. Its unused cash
				accounts are deleted with it.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="ghost" onclick={() => (pendingDelete = null)}>Cancel</Button>
			<Button variant="destructive" disabled={busy} onclick={confirmDelete}>Yes, delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
