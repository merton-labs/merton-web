<script lang="ts">
	import './layout.css';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Archive from '@lucide/svelte/icons/archive';
	import FirstPortfolio from '#lib/components/first-portfolio.svelte';
	import { portfolios, selectPortfolio, session } from '#lib/portfolio.svelte.js';
	import { auth, loadSession } from '#lib/auth.svelte.js';
	import { loadLedger, loadWorkspace, resetWorkspace, workspace } from '#lib/workspace.svelte.js';

	let { children }: LayoutProps = $props();

	const PUBLIC_PATHS = ['/login', '/register'];
	/** Pages that show one portfolio's data and need its ledger loaded. */
	const PORTFOLIO_PATHS = [
		'/',
		'/holdings',
		'/dividends',
		'/transactions',
		'/cash',
		'/corporate-actions'
	];

	const portfolio = $derived(portfolios.find((p) => p.id === session.portfolioId));
	const isPublic = $derived(PUBLIC_PATHS.includes(page.url.pathname));
	const needsPortfolio = $derived(PORTFOLIO_PATHS.includes(page.url.pathname));

	loadSession();

	$effect(() => {
		if (!auth.ready) return;
		if (!auth.user && !isPublic) goto(resolve('/login'), { replaceState: true });
		else if (auth.user && isPublic) goto(resolve('/'), { replaceState: true });
	});

	$effect(() => {
		const signedIn = auth.user !== null;
		untrack(() => (signedIn ? loadWorkspace() : resetWorkspace()));
	});

	$effect(() => {
		const id = session.portfolioId;
		if (workspace.ready && id) untrack(() => loadLedger(id));
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Merton</title>
</svelte:head>

<ModeWatcher defaultMode="light" />
<Toaster position="top-right" />

{#if isPublic}
	<main class="flex min-h-svh items-center justify-center bg-muted p-4">
		{@render children()}
	</main>
{:else if !auth.user || !workspace.ready}
	<div
		class="flex min-h-svh flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
	>
		{#if workspace.error}
			<p class="text-destructive">{workspace.error}</p>
			<Button variant="outline" size="sm" onclick={loadWorkspace}>Try again</Button>
		{:else}
			Loading…
		{/if}
	</div>
{:else}
	<Sidebar.Provider>
		<AppSidebar />
		<Sidebar.Inset>
			<header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
				<Sidebar.Trigger class="-ml-1" />
				<Separator orientation="vertical" class="mr-2 h-4" />
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="sm" class="gap-1.5 font-medium">
								{#if portfolio}
									{portfolio.name}
									<span class="text-muted-foreground">· {portfolio.baseCurrency}</span>
								{:else}
									No portfolio
								{/if}
								<ChevronDown class="size-4 opacity-60" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="w-64">
						<DropdownMenu.Label>Portfolios</DropdownMenu.Label>
						{#each portfolios as p (p.id)}
							<DropdownMenu.Item onclick={() => selectPortfolio(p.id)}>
								<Check class={p.id === session.portfolioId ? '' : 'invisible'} />
								<span class="flex-1 truncate">{p.name}</span>
								{#if p.status === 'ARCHIVED'}<Archive class="text-muted-foreground" />{/if}
								<span class="text-xs text-muted-foreground">{p.baseCurrency}</span>
							</DropdownMenu.Item>
						{/each}
						<DropdownMenu.Separator />
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a {...props} href={resolve('/portfolios')}>Manage portfolios</a>
							{/snippet}
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</header>
			{#if portfolio?.status === 'ARCHIVED'}
				<div class="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm md:px-6">
					<Archive class="size-4" />
					This portfolio is archived and read-only.
					<a href={resolve('/portfolios')} class="underline">Restore it</a> to make changes.
				</div>
			{/if}
			<main class="flex-1 p-4 md:p-6">
				{#if !needsPortfolio}
					{@render children()}
				{:else if !portfolio}
					<FirstPortfolio />
				{:else if workspace.ledgerFor !== portfolio.id}
					<div class="flex flex-col items-center gap-3 py-24 text-sm text-muted-foreground">
						{#if workspace.error}
							<p class="text-destructive">{workspace.error}</p>
							<Button variant="outline" size="sm" onclick={() => loadLedger(portfolio.id)}>
								Try again
							</Button>
						{:else}
							Loading…
						{/if}
					</div>
				{:else}
					{@render children()}
				{/if}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
