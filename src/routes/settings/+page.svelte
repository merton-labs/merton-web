<script lang="ts">
	import { mode, setMode } from 'mode-watcher';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { auth } from '#lib/auth.svelte.js';
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Appearance</Card.Title>
			<Card.Description>Stored in this browser only.</Card.Description>
			<Card.Action>
				<Tabs.Root
					value={mode.current ?? 'light'}
					onValueChange={(m) => setMode(m as 'light' | 'dark')}
				>
					<Tabs.List>
						<Tabs.Trigger value="light">Light</Tabs.Trigger>
						<Tabs.Trigger value="dark">Dark</Tabs.Trigger>
					</Tabs.List>
				</Tabs.Root>
			</Card.Action>
		</Card.Header>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Account</Card.Title>
			<Card.Description>
				Signed in as {auth.user?.email}. There is no account recovery in the MVP; an operator resets
				accounts in the database.
			</Card.Description>
		</Card.Header>
	</Card.Root>
</div>
