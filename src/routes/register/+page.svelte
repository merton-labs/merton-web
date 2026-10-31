<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { ApiError } from '#lib/api.js';
	import { MAX_PASSWORD, MIN_PASSWORD, authErrorMessage, register } from '#lib/auth.svelte.js';

	let email = $state('');
	let password = $state('');
	let confirm = $state('');
	let errors = $state<Record<string, string>>({});
	let error = $state('');
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const e: Record<string, string> = {};
		// Count code points, as the API does (Rust chars()); String.length counts UTF-16 units.
		const length = [...password].length;
		if (length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters`;
		else if (length > MAX_PASSWORD) e.password = `Use at most ${MAX_PASSWORD} characters`;
		if (confirm !== password) e.confirm = 'Passwords do not match';
		errors = e;
		error = '';
		if (Object.keys(e).length) return;

		busy = true;
		try {
			await register(email.trim(), password);
			password = confirm = '';
			toast.success('Account created');
			await goto(resolve('/'));
		} catch (err) {
			if (err instanceof ApiError) {
				errors = {
					email: err.code === 'email_taken' ? 'Already registered' : (err.field('email') ?? ''),
					password: err.field('password') ?? ''
				};
			}
			error = authErrorMessage(err);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Create account · Merton</title></svelte:head>

<Card.Root class="w-full max-w-sm">
	<Card.Header>
		<Card.Title class="text-xl">Create an account</Card.Title>
		<Card.Description>Your portfolios stay private to this account.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form class="space-y-4" onsubmit={submit}>
			<div class="space-y-1.5">
				<Label for="email">Email</Label>
				<Input
					id="email"
					type="email"
					autocomplete="username"
					required
					bind:value={email}
					disabled={busy}
				/>
				{#if errors.email}<p class="text-xs text-destructive">{errors.email}</p>{/if}
			</div>
			<div class="space-y-1.5">
				<Label for="password">Password</Label>
				<Input
					id="password"
					type="password"
					autocomplete="new-password"
					required
					bind:value={password}
					disabled={busy}
				/>
				{#if errors.password}
					<p class="text-xs text-destructive">{errors.password}</p>
				{:else}
					<p class="text-xs text-muted-foreground">
						{MIN_PASSWORD}–{MAX_PASSWORD} characters. There is no password reset.
					</p>
				{/if}
			</div>
			<div class="space-y-1.5">
				<Label for="confirm">Confirm password</Label>
				<Input
					id="confirm"
					type="password"
					autocomplete="new-password"
					required
					bind:value={confirm}
					disabled={busy}
				/>
				{#if errors.confirm}<p class="text-xs text-destructive">{errors.confirm}</p>{/if}
			</div>
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<Button type="submit" class="w-full" disabled={busy}>
				{busy ? 'Creating account…' : 'Create account'}
			</Button>
		</form>
	</Card.Content>
	<Card.Footer class="text-sm text-muted-foreground">
		<p>
			Already have an account? <a href={resolve('/login')} class="text-foreground underline"
				>Sign in</a
			>
		</p>
	</Card.Footer>
</Card.Root>
