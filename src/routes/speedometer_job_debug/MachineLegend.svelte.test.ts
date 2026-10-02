import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import MachineLegend from './MachineLegend.svelte';
import { groupByMachine } from '$lib/speedometer/machines';
import { measurement } from '../../tests/factories';

const groups = groupByMachine([
	measurement({ machineName: 'macmini-m4-002' }),
	measurement({ machineName: 'macmini-m4-010' }),
	measurement({ machineName: 'macmini-m4-001' })
]);

const props = (isolated: string) => ({
	groups,
	isolated,
	href: (machine: string) => `/speedometer_job_debug?machine=${machine}`,
	onhover: () => {}
});

/** Everything the chip renders that could change its width. */
function chipShapes(container: HTMLElement) {
	return [...container.querySelectorAll('.chip')].map((chip) => ({
		text: chip.textContent?.replace(/\s+/g, ' ').trim(),
		fontWeight: (chip as HTMLElement).style.fontWeight,
		fontSize: (chip as HTMLElement).style.fontSize
	}));
}

describe('MachineLegend', () => {
	it('lists machines in stable numeric-aware order', () => {
		const { container } = render(MachineLegend, { props: props('') });

		expect([...container.querySelectorAll('.name')].map((n) => n.textContent)).toEqual([
			'macmini-m4-001',
			'macmini-m4-002',
			'macmini-m4-010'
		]);
	});

	/**
	 * Isolating a machine must not change any chip's size, or the chips after it
	 * shift out from under the cursor that just clicked one -- and if the row
	 * count changes with it, the whole legend reflows on every click. Selection
	 * is styled with colour and an inset box-shadow for exactly this reason;
	 * a reviewer reaching for `font-weight: bold` should fail here.
	 */
	it('renders the same chips whichever machine is isolated', () => {
		const all = render(MachineLegend, { props: props('') });
		const one = render(MachineLegend, { props: props('macmini-m4-002') });

		expect(chipShapes(one.container)).toEqual(chipShapes(all.container));
	});

	it('offers an un-isolating href on the selected chip and an isolating one on the rest', () => {
		const { container } = render(MachineLegend, { props: props('macmini-m4-002') });
		const hrefs = [...container.querySelectorAll('.chip')].map((a) => a.getAttribute('href'));

		expect(hrefs).toEqual([
			'/speedometer_job_debug?machine=macmini-m4-001',
			// The selected one clears the parameter rather than re-selecting itself.
			'/speedometer_job_debug?machine=',
			'/speedometer_job_debug?machine=macmini-m4-010'
		]);
	});

	// Isolating a machine is a navigation like every other control here, and so
	// must not reset scroll -- asserted against a real page in
	// `e2e/layout.spec.ts` rather than by looking for the attribute that
	// currently implements it.
});
