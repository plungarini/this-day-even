import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { __resetProgressStoreForTests, ensureBridgeStorageReady, readAndTrackProgress } from '../src/services/bridge-storage';
import { __resetIdentityStoreForTests, getEvenIdentity } from '../src/services/identity';

const mockGetLocalStorage = vi.fn(async () => '');
const mockSetLocalStorage = vi.fn(async () => true);
const mockGetUserInfo = vi.fn(async () => ({ uid: 42, country: 'IT' }));

vi.mock('@evenrealities/even_hub_sdk', () => ({
	waitForEvenAppBridge: vi.fn(async () => ({
		getLocalStorage: mockGetLocalStorage,
		setLocalStorage: mockSetLocalStorage,
		getUserInfo: mockGetUserInfo,
	})),
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
			{ id: 'moment', title: 'The Moment', webBody: '1902: Marie Curie isolates radium.', hudPages: ['1902: Marie Curie isolates radium.'], sourceRefs: [] },
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

const sampleMePayload = {
	user: {
		appUserId: 'user-1',
		evenUid: '42',
		country: 'IT',
		lastSeenAt: '2026-04-20T00:00:00.000Z',
		firstSeenAt: '2026-04-20T00:00:00.000Z',
	},
	access: {
		phase: 'free',
		state: 'trial_active',
		accessAllowed: true,
		trialStartedAt: '2026-04-20T00:00:00.000Z',
		trialEndsAt: '2026-04-27T00:00:00.000Z',
		activeUntil: null,
		appUserId: 'user-1',
		evenUid: '42',
	},
};

beforeEach(() => {
	vi.restoreAllMocks();
	__resetProgressStoreForTests();
	__resetIdentityStoreForTests();
	mockGetLocalStorage.mockResolvedValue('');
	mockSetLocalStorage.mockResolvedValue(true);
	mockGetUserInfo.mockResolvedValue({ uid: 42, country: 'IT' });
	window.__THIS_DAY_ENV__ = { API_BASE_URL: 'http://127.0.0.1:3001' };
});

describe('webview', () => {
	it('renders all five sections from the today payload', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			if (String(input).includes('/api/me')) {
				return new Response(JSON.stringify(sampleMePayload), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			return new Response(JSON.stringify(samplePayload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		});

		render(<App />);

		await waitFor(() => expect(screen.getByText(samplePayload.fact.title)).toBeInTheDocument());
		expect(screen.getByText('The Moment')).toBeInTheDocument();
		expect(screen.getByText('Why it matters')).toBeInTheDocument();
		expect(screen.getByText('Context')).toBeInTheDocument();
		expect(screen.getByText('Aftermath')).toBeInTheDocument();
		expect(screen.getAllByText('Artifact').length).toBeGreaterThan(0);
		expect(screen.getByText('Keep the ritual alive.')).toBeInTheDocument();
		expect(screen.queryByText('Your daily access.')).not.toBeInTheDocument();
		const todayCall = fetchSpy.mock.calls.find((call) => String(call[0]).includes('/api/today'));
		const options = todayCall?.[1] as RequestInit | undefined;
		expect(todayCall).toBeTruthy();
		expect(options?.headers).toBeInstanceOf(Headers);
		expect((options?.headers as Headers).get('X-Even-User-Uid')).toBe('42');
	});

	it('tracks daily, weekly, and monthly progress without browser localStorage', async () => {
		await ensureBridgeStorageReady();
		const first = await readAndTrackProgress('2026-04-20');
		const second = await readAndTrackProgress('2026-04-20');
		const third = await readAndTrackProgress('2026-04-21');
		expect(first.currentDailyStreak).toBe(1);
		expect(second.currentDailyStreak).toBe(1);
		expect(third.currentDailyStreak).toBe(2);
		expect(third.weeklyConsistency).toBe(2);
		expect(third.monthlyConsistency).toBe(2);
	});

	it('caches the Even uid through bridge storage and reuses it', async () => {
		const identity = await getEvenIdentity();
		expect(identity.evenUid).toBe('42');
		expect(identity.country).toBe('IT');
		expect(mockSetLocalStorage).toHaveBeenCalled();
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
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			if (String(input).includes('/api/me')) {
				return new Response(JSON.stringify(sampleMePayload), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			return new Response(JSON.stringify(noImagePayload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		});

		render(<App />);
		await waitFor(() => expect(screen.getByText(noImagePayload.fact.title)).toBeInTheDocument());
		expect(screen.queryByAltText('Marie Curie portrait')).not.toBeInTheDocument();
	});

	it('shows the access widget only once paid mode is enabled', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			if (String(input).includes('/api/me')) {
				return new Response(
					JSON.stringify({
						...sampleMePayload,
						access: {
							...sampleMePayload.access,
							phase: 'gated',
							state: 'trial_active',
						},
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					},
				);
			}

			return new Response(JSON.stringify(samplePayload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		});

		render(<App />);
		await waitFor(() => expect(screen.getByText('Your daily access.')).toBeInTheDocument());
		expect(screen.getByText(/Free trial ends/i)).toBeInTheDocument();
	});
});
