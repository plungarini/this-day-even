import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';

const evenHudFullReload = (): PluginOption => ({
	name: 'even-hud-full-reload',
	apply: 'serve',
	handleHotUpdate({ server, file }) {
		if (file.endsWith('index.html') || file.includes('/src/') || file.includes('\\src\\')) {
			server.ws.send({ type: 'full-reload', path: '*' });
			return [];
		}
	},
});

export default defineConfig({
	plugins: [react(), evenHudFullReload()],
	base: './',
	server: {
		host: true,
		port: 5173,
	},
	build: {
		outDir: 'dist',
		sourcemap: true,
		target: 'es2022',
		chunkSizeWarningLimit: 800,
	},
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./tests/setup.ts'],
	},
});
