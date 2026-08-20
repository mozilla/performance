<script lang="ts">
	interface Props {
		label: string;
		checked: boolean;
		onchange(checked: boolean): void;
		disabled?: boolean;
		title?: string;
	}

	let { label, checked, onchange, disabled = false, title }: Props = $props();
</script>

<div class="chip" class:disabled {title}>
	<label>
		<input
			type="checkbox"
			{checked}
			{disabled}
			onchange={(event) => onchange(event.currentTarget.checked)}
		/>
		<span>{label}</span>
	</label>
</div>

<style>
	.chip {
		background: var(--surface-control);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-default);
	}

	.chip.disabled {
		opacity: 0.5;
	}

	label {
		font-size: 13px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-family: sans-serif;
	}

	.chip.disabled label {
		cursor: default;
	}

	input {
		cursor: inherit;
	}
</style>
