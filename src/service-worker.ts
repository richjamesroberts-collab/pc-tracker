/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Caches the whole app on install so it opens with no signal at the table.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `pc-tracker-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(['./', ...ASSETS]))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.origin !== sw.location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			// Built assets are content-hashed, so cache-first is safe.
			const cached = await cache.match(event.request, { ignoreSearch: url.pathname === new URL('./', sw.location.href).pathname });
			if (cached && ASSETS.some((a) => url.pathname.endsWith(a.replace(/^\.?\//, '')))) return cached;
			try {
				const res = await fetch(event.request);
				if (res.ok) cache.put(event.request, res.clone());
				return res;
			} catch {
				if (cached) return cached;
				// Offline and not cached: fall back to the app shell (restore links carry a ?restore= query).
				return (await cache.match('./')) ?? Response.error();
			}
		})()
	);
});
