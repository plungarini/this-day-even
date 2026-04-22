import { AppShell, Badge, Button, Card, Divider, Loading } from 'even-toolkit/web';
import { useEffect, useMemo, useState } from 'react';
import { formatUtcLongDate, secondsUntilNextUtcMidnight } from '../shared/utc';
import type { SourceRecord, TodayResponse } from '../shared/types';
import { loadToday } from './api/today';
import { getApiBaseUrl } from './config';
import { formatFriendlyCountdown, formatLocalReleaseTime } from './lib/time';
import { ensureBridgeStorageReady, readAndTrackProgress, type ProgressSnapshot } from './services/bridge-storage';
import type { ProgressMetric } from './types/progress';

type LoadState = 'loading' | 'ready' | 'error';

function Pill({ children, tone = 'default' }: { children: string; tone?: 'default' | 'accent' | 'muted' }) {
	return <span className={`td-pill td-pill-${tone}`}>{children}</span>;
}

const BLANK_HREF = 'about:blank';

function sourceIndex(sources: SourceRecord[]) {
	return new Map(sources.map((source) => [source.id, source]));
}

function ProgressCard({ progress }: { progress: ProgressSnapshot }) {
	const metrics: ProgressMetric[] = [
		{
			label: 'Daily',
			value: String(progress.currentDailyStreak),
			footnote: `${progress.bestDailyStreak} best`,
		},
		{
			label: 'Week',
			value: `${progress.weeklyConsistency}/7`,
			footnote: 'consistency',
		},
		{
			label: 'Month',
			value: `${progress.monthlyConsistency}`,
			footnote: 'reads',
		},
	];

	return (
		<Card className="td-panel td-progress-card">
			<div className="td-panel-head">
				<div>
					<div className="td-panel-kicker">Progress</div>
					<h2 className="td-panel-title">Keep the ritual alive.</h2>
				</div>
				<div className="td-best-badge" aria-label={`Best streak ${progress.bestDailyStreak}`}>
					<span>Best</span>
					<strong>{progress.bestDailyStreak}</strong>
				</div>
			</div>
			<div className="td-progress-grid">
				{metrics.map((metric) => (
					<div key={metric.label} className="td-progress-metric">
						<div className="td-progress-label">{metric.label}</div>
						<div className="td-progress-value">{metric.value}</div>
						<div className="td-progress-footnote">{metric.footnote}</div>
					</div>
				))}
			</div>
			<div className="td-milestones">
				{progress.milestones.map((milestone) => (
					<span key={milestone.id} className={`td-milestone-pill${milestone.earned ? ' is-earned' : ''}`}>
						{milestone.label}
					</span>
				))}
			</div>
		</Card>
	);
}

function TimerCard({ now }: { now: Date }) {
	const seconds = secondsUntilNextUtcMidnight(now);
	return (
		<Card className="td-panel td-timer-card">
			<div className="td-panel-kicker">Next drop</div>
			<div className="td-timer-line">{formatFriendlyCountdown(seconds)}</div>
			<div className="td-timer-meta">{formatLocalReleaseTime(now)} local time</div>
			<div className="td-timer-note">The new fact always unlocks at 00:00 UTC.</div>
		</Card>
	);
}

function SectionCard({
	payload,
	index,
	total,
}: {
	payload: TodayResponse;
	index: number;
	total: number;
}) {
	const section = payload.fact.sections[index];
	const sources = sourceIndex(payload.sources);
	if (!section) return null;

	return (
		<Card className="td-panel td-section-card">
			<div className="td-section-meta">
				<div className="td-section-kicker">
					<span>{String(index + 1).padStart(2, '0')}</span>
					<span>{`${section.title} • ${index + 1}/${total}`}</span>
				</div>
				<h3 className="td-section-title">{section.title}</h3>
			</div>
			<p className="td-section-body">{section.webBody}</p>
			{section.sourceRefs.length > 0 ? (
				<div className="td-inline-sources">
					{section.sourceRefs.map((ref) => {
						return (
							<a key={ref.sourceId} href={BLANK_HREF} target="_blank" rel="noreferrer">
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
		<details className="td-panel td-sources-drawer">
			<summary>
				<span className="td-panel-kicker">Sources</span>
				<span className="td-sources-summary">Open the archive trail</span>
			</summary>
			<div className="td-source-list">
				{payload.sources.map((source) => (
					<Card key={source.id} className="td-source-card">
						<div className="td-source-card-top">
							<span className="td-source-kind">{source.kind}</span>
							<a href={BLANK_HREF} target="_blank" rel="noreferrer">
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
	const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
	const [error, setError] = useState('');
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const timer = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		void (async () => {
			setLoadState('loading');
			try {
				await ensureBridgeStorageReady();
				const response = await loadToday(getApiBaseUrl());
				const nextProgress = await readAndTrackProgress(response.dateUtc);
				setPayload(response);
				setProgress(nextProgress);
				setError('');
				setLoadState('ready');
			} catch (loadError) {
				setError(loadError instanceof Error ? loadError.message : 'Could not load the daily artifact.');
				setLoadState('error');
			}
		})();
	}, []);

	const header = useMemo(
		() => (
			<div className="td-topbar">
				<div className="td-topbar-copy">
					<div className="td-brand">THIS DAY</div>
					<div className="td-brand-subtitle">One sharp historical moment, daily.</div>
				</div>
				{progress ? (
					<div className="td-streak-badge" aria-label={`Current streak ${progress.currentDailyStreak} days`}>
						<span className="td-streak-badge-icon" aria-hidden>
							🔥
						</span>
						<span>{`${progress.currentDailyStreak} day streak`}</span>
					</div>
				) : null}
			</div>
		),
		[progress],
	);

	return (
		<AppShell header={header}>
			<div className="td-app-shell">
				<div className="td-glow td-glow-top" />
				<div className="td-glow td-glow-bottom" />

				{loadState === 'loading' ? (
					<Card className="td-panel td-loading-card">
						<Loading />
						<div>
							<h2>Compiling today&apos;s ritual</h2>
							<p>Loading the daily artifact and your saved progress from the Even bridge.</p>
						</div>
					</Card>
				) : null}

				{loadState === 'error' ? (
					<Card className="td-panel td-error-card">
						<h2>History missed its cue</h2>
						<p>{error}</p>
						<Button onClick={() => window.location.reload()}>Reload</Button>
					</Card>
				) : null}

				{payload ? (
					<div className="td-page">
						<Card className="td-panel td-hero-card">
							<div className="td-hero-date">
								<div className="td-hero-date-badge">{formatUtcLongDate(payload.dateUtc)}</div>
								<div className="td-hero-year-wrap">
									<div className="td-hero-year">{payload.fact.year}</div>
									<div className="td-hero-year-caption">On this day</div>
								</div>
							</div>
							<div className="td-hero-copy">
								<div className="td-status-row">
									<div className="td-pill-row">
										<Pill tone={payload.isFallback ? 'muted' : 'accent'}>
											{payload.isFallback ? 'Fallback' : 'Live artifact'}
										</Pill>
										{payload.fact.taxonomy.categories.map((category) => (
											<Pill key={category}>{category}</Pill>
										))}
									</div>
								</div>
								<h1 className="td-hero-title">{payload.fact.title}</h1>
								<p className="td-hero-deck">{payload.fact.deck}</p>
								<Divider />
								<p className="td-hero-summary">{payload.fact.summary}</p>
							</div>
						</Card>

						<TimerCard now={now} />
						{progress ? <ProgressCard progress={progress} /> : null}

						<section className="td-reading-zone" aria-label="Daily sections">
							<div className="td-reading-header">
								<div className="td-panel-kicker">Section deck</div>
								<h2 className="td-panel-title">Scroll the full story</h2>
							</div>
							<div className="td-section-strip">
								{payload.fact.sections.map((section, index) => (
									<SectionCard key={section.id} payload={payload} index={index} total={payload.fact.sections.length} />
								))}
							</div>
						</section>

						{payload.fact.heroImage ? (
							<Card className="td-panel td-image-card">
								<div className="td-image-copy">
									<div className="td-panel-kicker">Artifact</div>
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
					</div>
				) : null}
			</div>
		</AppShell>
	);
}
