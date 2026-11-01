<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import HandCoins from '@lucide/svelte/icons/hand-coins';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Split from '@lucide/svelte/icons/split';
	import Tags from '@lucide/svelte/icons/tags';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import Settings from '@lucide/svelte/icons/settings';
	import LogOut from '@lucide/svelte/icons/log-out';
	import CircleUser from '@lucide/svelte/icons/circle-user';
	import { toast } from 'svelte-sonner';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { auth, logout } from '#lib/auth.svelte.js';

	const groups = [
		{
			label: 'Portfolio',
			items: [
				{ title: 'Dashboard', href: '/', icon: LayoutDashboard },
				{ title: 'Holdings', href: '/holdings', icon: ChartPie },
				{ title: 'Dividends', href: '/dividends', icon: HandCoins },
				{ title: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
				{ title: 'Cash accounts', href: '/cash', icon: Wallet },
				{ title: 'Corporate actions', href: '/corporate-actions', icon: Split }
			]
		},
		{
			label: 'Data',
			items: [
				{ title: 'Instruments', href: '/instruments', icon: Tags },
				{ title: 'Market data', href: '/market-data', icon: ChartLine },
				{ title: 'Portfolios', href: '/portfolios', icon: Briefcase }
			]
		}
	] as const;

	async function signOut() {
		await logout();
		toast.success('Signed out');
	}

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<div class="flex items-center gap-2 px-2 py-1.5">
			<div
				class="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
			>
				M
			</div>
			<span class="font-semibold group-data-[collapsible=icon]:hidden">Merton</span>
		</div>
	</Sidebar.Header>
	<Sidebar.Content>
		{#each groups as group (group.label)}
			<Sidebar.Group>
				<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each group.items as item (item.href)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={isActive(item.href)} tooltipContent={item.title}>
									{#snippet child({ props })}
										<a href={resolve(item.href)} {...props}>
											<item.icon />
											<span>{item.title}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton isActive={isActive('/settings')} tooltipContent="Settings">
					{#snippet child({ props })}
						<a href={resolve('/settings')} {...props}>
							<Settings />
							<span>Settings</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton {...props} tooltipContent={auth.user?.email}>
								<CircleUser />
								<span class="truncate">{auth.user?.email}</span>
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="top" align="start" class="w-56">
						<DropdownMenu.Label class="truncate font-normal text-muted-foreground">
							{auth.user?.email}
						</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={signOut}><LogOut /> Sign out</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
