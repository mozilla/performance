<script lang="ts">
	import type { ReplicateVideo, VideoGroup } from '$lib/replicate-videos';
	import { taskclusterTaskUrl, type TaskRef } from '$lib/api/treeherder';

	interface Props {
		/**
		 * Sets of recordings to pick between. Android publishes one flat set per
		 * job; NavBench publishes one per site and scenario, and shows a second
		 * select. With a single group the group select is hidden rather than
		 * rendered with one option.
		 */
		groups: VideoGroup[];
		selectedGroup: string;
		selectedReplicate: number;
		/** Unit for the replicate values, e.g. `ms`. Empty for a bare score. */
		unit: string;
		task: TaskRef;
		/** Treeherder job view for the run these recordings came from. */
		jobUrl: string;
		onselectGroup(key: string): void;
		onselectReplicate(index: number): void;
		onclose(): void;
	}

	let {
		groups,
		selectedGroup,
		selectedReplicate,
		unit,
		task,
		jobUrl,
		onselectGroup,
		onselectReplicate,
		onclose
	}: Props = $props();

	const group = $derived(groups.find((each) => each.key === selectedGroup) ?? groups[0]);
	const videos = $derived(group?.videos ?? []);
	const video = $derived(videos[selectedReplicate] ?? videos[0]);

	let src = $state<string | undefined>(undefined);

	$effect(() => {
		if (!video) return;
		const url = URL.createObjectURL(new Blob([video.data as BlobPart], { type: video.mimeType }));
		src = url;
		return () => {
			URL.revokeObjectURL(url);
			src = undefined;
		};
	});

	const label = (entry: ReplicateVideo) =>
		entry.value === null
			? `Replicate ${entry.index + 1}`
			: `Replicate ${entry.index + 1}: ${entry.value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
</script>

<section class="panel" aria-label="Replicate recordings">
	<header>
		<div class="picker">
			{#if groups.length > 1}
				<label>
					<span>Page:</span>
					<select
						value={group?.key ?? ''}
						onchange={(event) => onselectGroup(event.currentTarget.value)}
					>
						{#each groups as entry (entry.key)}
							<option value={entry.key}>{entry.label}</option>
						{/each}
					</select>
				</label>
			{/if}

			<label>
				<span>Replicate:</span>
				<!-- A link per replicate would be nicer for middle-clicking, but ten
				     of them is a worse control than a select. The selection is still
				     URL state; the handler patches it. -->
				<select
					value={String(selectedReplicate)}
					onchange={(event) => onselectReplicate(Number(event.currentTarget.value))}
				>
					{#each videos as entry, index (entry.name)}
						<option value={String(index)}>{label(entry)}</option>
					{/each}
				</select>
			</label>

			<a href={jobUrl} target="_blank" rel="noreferrer">Job in Treeherder</a>
			<a href={taskclusterTaskUrl(task.taskId)} target="_blank" rel="noreferrer">
				Task in Taskcluster
			</a>
		</div>
		<button type="button" onclick={onclose} aria-label="Close recordings">&times;</button>
	</header>

	{#if video}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video {src} controls playsinline></video>
		<p class="caption">{label(video)} &mdash; {video.name.split('/').pop()}</p>
	{:else}
		<p class="caption">No recordings for this page.</p>
	{/if}
</section>

<style>
	.panel {
		width: 100%;
		max-width: var(--content-max);
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4) var(--space-4);
		background: var(--surface-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		font-family: sans-serif;
		font-size: 13px;
		text-align: left;
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		margin-bottom: var(--space-3);
	}

	.picker {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
		flex: 1;
	}

	label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: bold;
	}

	button {
		background: none;
		border: none;
		font-size: 24px;
		line-height: 1;
		cursor: pointer;
		color: var(--ink-muted);
	}

	button:hover {
		color: var(--ink-primary);
	}

	video {
		width: 100%;
		/* Recordings are portrait phone captures or desktop viewports, so a fixed
		   height keeps the panel from becoming taller than the window. */
		height: var(--chart-height);
		border-radius: var(--radius-md);
		background: #000000;
	}

	.caption {
		margin-top: var(--space-2);
		color: var(--ink-muted);
		text-align: center;
	}
</style>
