<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { NAV, type NavItem } from '$lib/nav';

	function href(item: NavItem): string {
		return item.external ? item.href : `${base}${item.href}`;
	}

	function isActive(item: NavItem): boolean {
		if (item.external || !item.href) return false;
		const current = page.route.id?.replace(/\/$/, '');
		const target = item.href.replace(/\/$/, '');
		return current === target;
	}

	function isSectionOpen(item: NavItem): boolean {
		return isActive(item) || (item.children?.some(isActive) ?? false);
	}
</script>

<nav>
	<ul>
		{#each NAV as item (item.label)}
			<li>
				{#if item.href}
					<a
						href={href(item)}
						class:active={isActive(item)}
						target={item.external ? '_blank' : null}
						rel={item.external ? 'noreferrer' : null}
					>
						<i class={item.icon}></i><span>{item.label}</span>
					</a>
				{:else}
					<span class="section-label"><i class={item.icon}></i><span>{item.label}</span></span>
				{/if}

				{#if item.children}
					<ul class="sub" class:open={isSectionOpen(item) || !item.href}>
						{#each item.children as child (child.label)}
							<li>
								<a
									href={href(child)}
									class:active={isActive(child)}
									target={child.external ? '_blank' : null}
									rel={child.external ? 'noreferrer' : null}
								>
									{#if child.icon}<i class={child.icon}></i>{/if}<span>{child.label}</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
</nav>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	a,
	.section-label {
		color: var(--ink-primary);
		text-decoration: none;
		display: block;
		padding: var(--space-4) var(--space-3) var(--space-4) var(--space-6);
		font-size: 14px;
		transition: color 80ms ease-out;
	}

	a:hover {
		color: var(--accent-nav);
	}

	a.active {
		color: var(--accent-nav);
		font-weight: bold;
		box-shadow: inset 3px 0 0 var(--accent-nav);
	}

	i {
		width: 20px;
		display: inline-block;
	}

	.sub {
		display: none;
	}

	.sub.open {
		display: block;
	}

	.sub li {
		border-bottom: none;
	}

	.sub a {
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-8);
		font-size: 13px;
		opacity: 0.85;
	}

	/* Full opacity so the accent colour keeps its contrast. */
	.sub a:hover,
	.sub a.active {
		opacity: 1;
	}

	/* Tighter gutters once the column narrows, so long labels like
	   "Navigation Benchmark" wrap over two lines rather than three. */
	@media (max-width: 64rem) {
		a,
		.section-label {
			padding: var(--space-3) var(--space-2) var(--space-3) var(--space-3);
		}

		.sub a {
			padding-left: var(--space-6);
		}
	}

	/*
	 * Stacked above the content: flatten the whole tree into one wrapping row.
	 *
	 * `display: contents` on the list items and the submenus dissolves their
	 * boxes so every link becomes a direct flex item of the same row, rather
	 * than the submenus stacking underneath their parent and making the bar
	 * several hundred pixels tall. Submenus are always shown here -- in a flat
	 * bar there is no disclosure to open, and Job Debug is reachable from
	 * nowhere else.
	 */
	@media (max-width: 44rem) {
		ul {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
		}

		li,
		.sub,
		.sub.open {
			display: contents;
		}

		a,
		.section-label {
			padding: var(--space-2) var(--space-3);
			border-bottom: none;
		}

		.sub a {
			padding-left: var(--space-3);
			font-size: 13px;
		}

		a.active {
			box-shadow: inset 0 -3px 0 var(--accent-nav);
		}
	}
</style>
