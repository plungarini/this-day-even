import '@testing-library/jest-dom';

const store = new Map<string, Response>();

Object.defineProperty(globalThis, 'caches', {
	value: {
		default: {
			async match(request: Request) {
				return store.get(request.url);
			},
			async put(request: Request, response: Response) {
				store.set(request.url, response);
			},
		},
	},
	configurable: true,
});

