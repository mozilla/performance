<script lang="ts">
	interface Props {
		message?: string;
		/** Overlay the parent (which must be positioned) rather than flow inline. */
		overlay?: boolean;
		size?: number;
	}

	let { message = 'Loading…', overlay = false, size = 50 }: Props = $props();
</script>

<div class="loader" class:overlay role="status" aria-live="polite">
	<div class="spinner" style:width="{size}px" style:height="{size}px"></div>
	<div class="message">{message}</div>
</div>

<style>
	.loader {
		text-align: center;
		padding: var(--space-8) 0;
	}

	.loader.overlay {
		position: absolute;
		top: 30%;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		padding: 0;
	}

	.spinner {
		display: inline-block;
		border: 5px solid var(--border-subtle);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.message {
		margin-top: var(--space-4);
		font-size: 14px;
		color: var(--ink-muted);
		font-weight: 600;
		font-family: sans-serif;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 3s;
		}
	}
</style>
