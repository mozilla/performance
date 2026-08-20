export interface SelectedPoint {
	revision: string;
	value: number;
	/** Push time in epoch milliseconds; orders the pushlog range. */
	time: number;
}

export interface RevisionRange {
	from: string;
	to: string;
}

export interface SelectionResult {
	selection: SelectedPoint;
	/** The range to link, or null when there is not yet a pair to span. */
	range: RevisionRange | null;
}

export function nextSelection(
	current: SelectedPoint | null,
	clicked: SelectedPoint
): SelectionResult {
	// A point with no revision cannot anchor a pushlog range.
	if (!clicked.revision) {
		return { selection: clicked, range: null };
	}

	if (!current || !current.revision || current.revision === clicked.revision) {
		return { selection: clicked, range: null };
	}

	const range =
		current.time <= clicked.time
			? { from: current.revision, to: clicked.revision }
			: { from: clicked.revision, to: current.revision };

	return { selection: clicked, range };
}

/**
 * Is the anchor still present in the data on screen?
 *
 * Used to drop a selection that survived a state change into a series that does
 * not contain it, rather than drawing a highlight on nothing.
 */
export function selectionIsLive(
	selection: SelectedPoint | null,
	revisions: Iterable<string>
): boolean {
	if (!selection) return false;
	for (const revision of revisions) {
		if (revision === selection.revision) return true;
	}
	return false;
}
