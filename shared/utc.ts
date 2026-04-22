export function toUtcDateString(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function toMonthDayKey(date: Date): string {
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${month}-${day}`;
}

export function fromMonthDayKey(key: string, year: number): Date {
	return new Date(`${year}-${key}T00:00:00.000Z`);
}

export function addUtcDays(date: Date, offset: number): Date {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + offset);
	return next;
}

export function formatUtcLongDate(dateUtc: string): string {
	const date = new Date(`${dateUtc}T00:00:00.000Z`);
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(date);
}

export function secondsUntilNextUtcMidnight(now = new Date()): number {
	const next = new Date(now);
	next.setUTCHours(24, 0, 0, 0);
	return Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
}

