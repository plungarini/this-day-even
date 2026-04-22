import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { readAndBumpStreak } from '../src/services/bridge-storage';

vi.mock('@evenrealities/even_hub_sdk', () => ({
	waitForEvenAppBridge: vi.fn().mockRejectedValue(new Error('bridge unavailable')),
}));

vi.mock('even-toolkit/web', () => ({
	AppShell: ({ header, children }: { header?: ReactNode; children?: ReactNode }) => (
		<div>
			<div>{header}</div>
			<div>{children}</div>
		</div>
	),
	Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
	Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
	Card: ({ children, className }: { children?: ReactNode; className?: string }) => <section className={className}>{children}</section>,
	Divider: () => <hr />,
	Loading: () => <div>Loading...</div>,
}));

const samplePayload = {
	dateUtc: '2026-04-20',
	key: '04-20',
	generatedAt: '2026-04-20T00:00:00.000Z',
	isFallback: false,
	fact: {
		slug: 'marie-curie-radium',
		year: 1902,
		title: 'Marie Curie isolates radium for the first time',
		deck: 'A breakthrough that feels eerily compact in retrospect.',
		summary: 'Radium moves from theory into a named, isolatable thing.',
		heroImage: {
			url: 'https://upload.wikimedia.org/example.jpg',
			width: 320,
			height: 180,
			alt: 'Marie Curie portrait',
			credit: 'Wikimedia Commons via Marie Curie',
		},
		sections: [
			{ id: 'moment', title: 'The moment', webBody: '1902: Marie Curie isolates radium.', hudPages: ['1902: Marie Curie isolates radium.'], sourceRefs: [] },
			{ id: 'why-it-matters', title: 'Why it matters', webBody: 'It turns radioactivity into something concrete.', hudPages: ['It turns radioactivity into something concrete.'], sourceRefs: [] },
			{ id: 'context', title: 'Context', webBody: 'The chemistry is exhausting and meticulous.', hudPages: ['The chemistry is exhausting and meticulous.'], sourceRefs: [] },
			{ id: 'aftermath', title: 'Aftermath', webBody: 'The discovery reshapes modern science and medicine.', hudPages: ['The discovery reshapes modern science and medicine.'], sourceRefs: [] },
			{ id: 'artifact', title: 'Artifact', webBody: 'Archive and image trails survive the moment.', hudPages: ['Archive and image trails survive the moment.'], sourceRefs: [] },
		],
		taxonomy: {
			categories: ['Science', 'Discovery'],
		},
		scoring: {
			retention: 88,
			obscurity: 79,
			weirdness: 68,
			compressibility: 81,
			confidence: 91,
		},
	},
	sources: [],
};

beforeEach(() => {
	vi.restoreAllMocks();
	window.localStorage.clear();
	window.__THIS_DAY_ENV__ = { API_BASE_URL: 'http://127.0.0.1:3001' };
});

describe('webview', () => {
	it('renders all five sections from the today payload', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify(samplePayload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}),
		);

		render(<App />);

		await waitFor(() => expect(screen.getByText(samplePayload.fact.title)).toBeInTheDocument());
		expect(screen.getByText('The moment')).toBeInTheDocument();
		expect(screen.getByText('Why it matters')).toBeInTheDocument();
		expect(screen.getByText('Context')).toBeInTheDocument();
		expect(screen.getByText('Aftermath')).toBeInTheDocument();
		expect(screen.getAllByText('Artifact').length).toBeGreaterThan(0);
	});

	it('increments the UTC streak only once per day and survives restart via storage fallback', async () => {
		const first = await readAndBumpStreak('2026-04-20');
		const second = await readAndBumpStreak('2026-04-20');
		const third = await readAndBumpStreak('2026-04-21');
		expect(first.count).toBe(1);
		expect(second.count).toBe(1);
		expect(third.count).toBe(2);
	});

	it('degrades cleanly when the payload has no hero image', async () => {
		const noImagePayload = {
			...samplePayload,
			fact: {
				...samplePayload.fact,
				heroImage: undefined,
			},
		};

		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify(noImagePayload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}),
		);

		render(<App />);
		await waitFor(() => expect(screen.getByText(noImagePayload.fact.title)).toBeInTheDocument());
		expect(screen.queryByAltText('Marie Curie portrait')).not.toBeInTheDocument();
	});
});
