import type { Dispatch, SetStateAction } from 'react';
import { clearDebugLogs, useDebugLogs, type DebugLogEntry } from './logs';

function formatDetails(details: unknown[]): string {
	return details
		.map((detail, index) => {
			if (typeof detail === 'string') return `[Arg ${index + 1}] ${detail}`;
			try {
				return `[Arg ${index + 1}] ${JSON.stringify(detail, null, 2)}`;
			} catch {
				return `[Arg ${index + 1}] ${String(detail)}`;
			}
		})
		.join('\n\n');
}

function logsToText(logs: DebugLogEntry[]): string {
	return logs
		.map((entry) => {
			const time = new Date(entry.ts).toLocaleTimeString('en-GB', { hour12: false });
			const base = `[${time}] ${entry.level.toUpperCase()} ${entry.msg}`;
			if (!entry.details?.length) return base;
			return `${base}\n${formatDetails(entry.details)}`;
		})
		.join('\n\n');
}

export function DebugPanel({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: Dispatch<SetStateAction<boolean>>;
}) {
	const logs = useDebugLogs();

	const handleCopy = () => {
		const text = logsToText(logs);
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.appendChild(textarea);
		textarea.select();
		try {
			const successful = document.execCommand('copy');
			if (successful) {
				console.log('[DebugPanel] copied logs to clipboard');
			} else {
				console.error('[DebugPanel] execCommand copy was unsuccessful');
			}
		} catch (err) {
			console.error('[DebugPanel] execCommand copy failed', err);
		} finally {
			document.body.removeChild(textarea);
		}
	};

	if (!open) return null;

	return (
		<div className="dbg-panel" role="dialog" aria-label="Debug logs">
			<div className="dbg-header">
				<span className="dbg-title">Debug Logs</span>
				<button type="button" className="dbg-clear" onClick={handleCopy}>
					copy
				</button>
				<button type="button" className="dbg-clear" onClick={clearDebugLogs}>
					clear
				</button>
				<button type="button" className="dbg-close" onClick={() => setOpen(false)}>
					close
				</button>
			</div>
			<div className="dbg-list">
				{logs.length === 0 ? <p className="dbg-empty">No logs yet.</p> : null}
				{[...logs].reverse().map((entry, index) => {
					const time = new Date(entry.ts).toLocaleTimeString('en-GB', { hour12: false });
					return (
						<details key={`${entry.ts}-${index}`} className={`dbg-entry dbg-entry--${entry.level}`}>
							<summary>
								<span className="dbg-time">{time}</span>
								<span className="dbg-level">{entry.level}</span>
								<span className="dbg-msg">{entry.msg}</span>
							</summary>
							{entry.details?.length ? <pre className="dbg-detail">{formatDetails(entry.details)}</pre> : null}
						</details>
					);
				})}
			</div>
		</div>
	);
}
