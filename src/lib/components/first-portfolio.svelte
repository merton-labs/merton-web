<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { CURRENCY_CODE, createPortfolio } from '#lib/portfolio.svelte.js';
	import { toastError } from '#lib/notify.js';

	let name = $state('My portfolio');
	let baseCurrency = $state('THB');
	let errors = $state<Record<string, string>>({});
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const code = baseCurrency.trim().toUpperCase();
		const e: Record<string, string> = {};
		if (!name.trim()) e.name = 'Name is required';
		if (!CURRENCY_CODE.test(code)) e.baseCurrency = 'Use a 3-letter code such as THB';
		errors = e;
		if (Object.keys(e).length) return;
		busy = true;
		try {
			await createPortfolio(name.trim(), code);
		} catch (err) {
			toastError(err);
		} finally {
			busy = false;
		}
	}
</script>

<Card.Root class="mx-auto mt-10 max-w-md">
	<Card.Header>
		<Card.Title>Create your first portfolio</Card.Title>
		<Card.Description>
			A portfolio holds its own cash accounts and transactions. Values are reported in its base
			currency.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form class="space-y-4" onsubmit={submit}>
			<div class="space-y-1.5">
				<Label for="first-name">Name</Label>
				<Input id="first-name" bind:value={name} disabled={busy} />
				{#if errors.name}<p class="text-xs text-destructive">{errors.name}</p>{/if}
			</div>
			<div class="space-y-1.5">
				<Label for="first-ccy">Base currency</Label>
				<Input
					id="first-ccy"
					maxlength={3}
					class="w-24 uppercase"
					bind:value={baseCurrency}
					disabled={busy}
				/>
				{#if errors.baseCurrency}
					<p class="text-xs text-destructive">{errors.baseCurrency}</p>
				{/if}
			</div>
			<Button type="submit" disabled={busy}>Create portfolio</Button>
		</form>
	</Card.Content>
</Card.Root>
