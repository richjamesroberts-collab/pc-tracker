import adapter from '@sveltejs/adapter-static';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, except for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		adapter: adapter(),
		// Set when the site is served from a subfolder, e.g. BASE_PATH=/pc-tracker for
		// https://<user>.github.io/pc-tracker/. Empty for localhost and root domains.
		paths: { base: process.env.BASE_PATH ?? '' },
		// Hash routing: the whole app is one index.html, so it works on any static host
		// (or a subfolder of one) without server rewrite rules.
		router: { type: 'hash' }
	}
};

export default config;
