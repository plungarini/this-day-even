export function formatCountdown(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatClock(now: Date): string {
	return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function formatFriendlyCountdown(totalSeconds: number): string {
	const clamped = Math.max(0, totalSeconds);
	const days = Math.floor(clamped / 86_400);
	const hours = Math.floor((clamped % 86_400) / 3_600);
	const minutes = Math.floor((clamped % 3_600) / 60);

	if (days > 0) return `in ${days} day${days === 1 ? '' : 's'} ${hours} hr`;
	if (hours > 0) return `in ${hours} hr ${minutes} min`;
	if (minutes > 0) return `in ${minutes} min`;
	return 'in under a minute';
}

export function formatLocalReleaseTime(now = new Date()): string {
	const next = new Date(now);
	next.setUTCHours(24, 0, 0, 0);
	return new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit',
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	}).format(next);
}

