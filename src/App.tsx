import { AppShell, Badge, Button, Card, Divider, Loading } from 'even-toolkit/web';
import { useEffect, useMemo, useState } from 'react';
import { formatUtcLongDate, secondsUntilNextUtcMidnight } from '../shared/utc';
import type { SourceRecord, TodayResponse } from '../shared/types';
import { loadToday } from './api/today';
import { getApiBaseUrl } from './config';
import { formatCountdown } from './lib/time';
import { readAndBumpStreak } from './services/bridge-storage';

type LoadState = 'loading' | 'ready' | 'error';

function sourceIndex(sources: SourceRecord[]) {
	return new Map(sources.map((source) => [source.id, source]));
}

function SectionCard({ payload, index }: { payload: TodayResponse; index: number }) {
	const section = payload.fact.sections[index];
	const sources = sourceIndex(payload.sources);
	if (!section) return null;

	return (
		<Card className="td-section-card">
			<div className="td-section-meta">
				<div className="td-section-kicker">
					<span>{String(index + 1).padStart(2, '0')}</span>
					<span>{section.id.replace(/-/g, ' ')}</span>
				</div>
				<h3 className="td-section-title">{section.title}</h3>
			</div>
			<p className="td-section-body">{section.webBody}</p>
			{section.sourceRefs.length > 0 ? (
				<div className="td-inline-sources">
					{section.sourceRefs.map((ref) => {
						const source = sources.get(ref.sourceId);
						return (
							<a key={ref.sourceId} href={source?.url || '#'} target="_blank" rel="noreferrer">
								{ref.label}
							</a>
						);
					})}
				</div>
			) : null}
		</Card>
	);
}

function SourceDrawer({ payload }: { payload: TodayResponse }) {
	return (
		<details className="td-sources-drawer">
			<summary>Sources</summary>
			<div className="td-source-list">
				{payload.sources.map((source) => (
					<Card key={source.id} className="td-source-card">
						<div className="td-source-card-top">
							<span className="td-source-kind">{source.kind}</span>
							<a href={source.url} target="_blank" rel="noreferrer">
								Open
							</a>
						</div>
						<div className="td-source-label">{source.label}</div>
						{source.note ? <p className="td-source-note">{source.note}</p> : null}
					</Card>
				))}
			</div>
		</details>
	);
}

export default function App() {
	const [loadState, setLoadState] = useState<LoadState>('loading');
	const [payload, setPayload] = useState<TodayResponse | null>(null);
	const [error, setError] = useState('');
	const [streak, setStreak] = useState(0);
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const timer = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		void (async () => {
			setLoadState('loading');
			try {
				const response = await loadToday(getApiBaseUrl());
				setPayload(response);
				setError('');
				setLoadState('ready');
				const nextStreak = await readAndBumpStreak(response.dateUtc);
				setStreak(nextStreak.count);
			} catch (loadError) {
				setError(loadError instanceof Error ? loadError.message : 'Could not load the daily artifact.');
				setLoadState('error');
			}
		})();
	}, []);

	const countdown = useMemo(() => formatCountdown(secondsUntilNextUtcMidnight(now)), [now]);

	return (
		<AppShell
			header={
				<div className="td-topbar">
					<div>
						<div className="td-brand">THIS DAY</div>
						<div className="td-brand-subtitle">New fact daily at 00:00 UTC</div>
					</div>
					<div className="td-topbar-badges">
						<Badge>{`Streak ${streak}`}</Badge>
						<Badge>{countdown}</Badge>
					</div>
				</div>
			}
		>
			<div className="td-page">
				<div className="td-atmosphere td-atmosphere-top" />
				<div className="td-atmosphere td-atmosphere-bottom" />

				{loadState === 'loading' ? (
					<Card className="td-loading-card">
						<Loading />
						<div>
							<h2>Compiling today&apos;s ritual</h2>
							<p>Pulling one memorable historical moment into the WebView and the HUD.</p>
						</div>
					</Card>
				) : null}

				{loadState === 'error' ? (
					<Card className="td-error-card">
						<h2>History missed its cue</h2>
						<p>{error}</p>
						<Button onClick={() => window.location.reload()}>Reload</Button>
					</Card>
				) : null}

				{payload ? (
					<>
						<Card className="td-hero-card">
							<div className="td-hero-date">
								<div className="td-hero-date-label">{formatUtcLongDate(payload.dateUtc)}</div>
								<div className="td-hero-year">{payload.fact.year}</div>
							</div>
							<div className="td-hero-copy">
								<div className="td-chip-row">
									<Badge>{payload.isFallback ? 'Fallback' : 'Live artifact'}</Badge>
									{payload.fact.taxonomy.categories.map((category) => (
										<Badge key={category}>{category}</Badge>
									))}
								</div>
								<h1 className="td-hero-title">{payload.fact.title}</h1>
								<p className="td-hero-deck">{payload.fact.deck}</p>
								<Divider />
								<p className="td-hero-summary">{payload.fact.summary}</p>
							</div>
							<div className="td-scorebar-grid">
								<div>
									<span>Retention</span>
									<strong>{payload.fact.scoring.retention}</strong>
								</div>
								<div>
									<span>Obscurity</span>
									<strong>{payload.fact.scoring.obscurity}</strong>
								</div>
								<div>
									<span>Weirdness</span>
									<strong>{payload.fact.scoring.weirdness}</strong>
								</div>
								<div>
									<span>Confidence</span>
									<strong>{payload.fact.scoring.confidence}</strong>
								</div>
							</div>
						</Card>

						<div className="td-section-strip" role="region" aria-label="Daily sections">
							{payload.fact.sections.map((section, index) => (
								<SectionCard key={section.id} payload={payload} index={index} />
							))}
						</div>

						{payload.fact.heroImage ? (
							<Card className="td-image-card">
								<div className="td-image-copy">
									<div className="td-image-kicker">Artifact</div>
									<h2>{payload.fact.heroImage.alt}</h2>
									<p>{payload.fact.heroImage.credit}</p>
								</div>
								<img
									className="td-image"
									src={payload.fact.heroImage.url}
									alt={payload.fact.heroImage.alt}
									width={payload.fact.heroImage.width}
									height={payload.fact.heroImage.height}
								/>
							</Card>
						) : null}

						<SourceDrawer payload={payload} />
					</>
				) : null}
			</div>
		</AppShell>
	);
}
