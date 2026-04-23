import { useEffect, useState } from 'react';

export interface DebugLogEntry {
	level: 'log' | 'warn' | 'error';
	msg: string;
	ts: number;
	details?: unknown[];
}

declare global {
	var __thisDayDebugInstalled: boolean | undefined;
	var __thisDayDebugLogs: DebugLogEntry[] | undefined;
	var __thisDayRefreshDebug: (() => void) | undefined;
}

const MAX_LOGS = 250;

function refresh() {
	globalThis.__thisDayRefreshDebug?.();
}

function normalize(detail: unknown): string {
	if (detail instanceof Error) return `${detail.name}: ${detail.message}\n${detail.stack ?? ''}`.trim();
	if (typeof detail === 'string') return detail;
	try {
		return JSON.stringify(detail, null, 2);
	} catch {
		return String(detail);
	}
}

function joinArgs(args: unknown[]): string {
	if (args.length === 0) return '';
	return args.map((arg) => normalize(arg)).join(' ');
}

function push(level: DebugLogEntry['level'], msg: string, details?: unknown[]) {
	const next = [...(globalThis.__thisDayDebugLogs ?? []), { level, msg, ts: Date.now(), details }];
	globalThis.__thisDayDebugLogs = next.slice(-MAX_LOGS);
	refresh();
}

function installCapture() {
	if (globalThis.__thisDayDebugInstalled) return;
	globalThis.__thisDayDebugInstalled = true;
	globalThis.__thisDayDebugLogs = globalThis.__thisDayDebugLogs ?? [];

	const original = {
		log: console.log.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console),
	};

	console.log = (...args: unknown[]) => {
		push('log', joinArgs(args), args);
		original.log(...args);
	};
	console.warn = (...args: unknown[]) => {
		push('warn', joinArgs(args), args);
		original.warn(...args);
	};
	console.error = (...args: unknown[]) => {
		push('error', joinArgs(args), args);
		original.error(...args);
	};

	window.addEventListener('error', (event) => {
		push('error', event.message || 'window error', [event.error ?? event.filename, { lineno: event.lineno, colno: event.colno }]);
	});

	window.addEventListener('unhandledrejection', (event) => {
		push('error', 'unhandled rejection', [event.reason]);
	});

	push('log', '[Debug] console capture installed');
}

installCapture();

function cloneLogs() {
	return [...(globalThis.__thisDayDebugLogs ?? [])];
}

export function clearDebugLogs(): void {
	globalThis.__thisDayDebugLogs = [];
	refresh();
}

export function getDebugLogCount(): number {
	return globalThis.__thisDayDebugLogs?.length ?? 0;
}

export function useDebugLogs(): DebugLogEntry[] {
	const [logs, setLogs] = useState<DebugLogEntry[]>(cloneLogs());

	useEffect(() => {
		const previous = globalThis.__thisDayRefreshDebug;
		const handleRefresh = () => {
			setLogs(cloneLogs());
			previous?.();
		};
		globalThis.__thisDayRefreshDebug = handleRefresh;
		return () => {
			if (globalThis.__thisDayRefreshDebug === handleRefresh) {
				globalThis.__thisDayRefreshDebug = previous;
			}
		};
	}, []);

	return logs;
}

export {};
