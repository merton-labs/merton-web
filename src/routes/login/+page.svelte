<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { authErrorMessage, login } from '#lib/auth.svelte.js';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		busy = true;
		try {
			await login(email.trim(), password);
			password = '';
			await goto(resolve('/'));
		} catch (e) {
			error = authErrorMessage(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Sign in · Merton</title></svelte:head>

<Card.Root class="w-full max-w-sm">
	<Card.Header>
		<Card.Title class="text-xl">Sign in</Card.Title>
		<Card.Description>Use the email and password for your Merton account.</Card.Description>
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
			</div>
			<div class="space-y-1.5">
				<Label for="password">Password</Label>
				<Input
					id="password"
					type="password"
					autocomplete="current-password"
					required
					bind:value={password}
					disabled={busy}
				/>
			</div>
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<Button type="submit" class="w-full" disabled={busy}>
				{busy ? 'Signing in…' : 'Sign in'}
			</Button>
		</form>
	</Card.Content>
	<Card.Footer class="flex-col gap-1 text-sm text-muted-foreground">
		<p>
			No account yet? <a href={resolve('/register')} class="text-foreground underline">Create one</a
			>
		</p>
		<p class="text-xs">There is no password reset; ask the server operator.</p>
	</Card.Footer>
</Card.Root>
