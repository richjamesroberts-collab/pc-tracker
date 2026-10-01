<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Toast from '$lib/components/Toast.svelte';
	import { pendingRestore } from '$lib/backup/pending';

	let { children } = $props();

	onMount(() => {
		// Restore links look like https://host/?restore=<code>; hand the code to the import page.
		const url = new URL(location.href);
		const code = url.searchParams.get('restore');
		if (code) {
			pendingRestore.code = code;
			url.searchParams.delete('restore');
			history.replaceState(history.state, '', url.pathname + url.search + url.hash);
			goto(resolve('/import'));
		}
	});
</script>

{@render children()}
<Toast />
