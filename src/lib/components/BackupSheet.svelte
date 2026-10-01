<script lang="ts">
	import qrcode from 'qrcode-generator';
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { encodeRestoreCode } from '$lib/backup/backup';
	import { saveBackupFile } from '$lib/backup/share';
	import type { Character } from '$lib/types';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	const c = $derived(session.character as Character);
	let link = $state('');
	let qrSvg = $state('');
	let copied = $state(false);
	let busy = $state(false);

	$effect(() => {
		if (open) {
			link = '';
			qrSvg = '';
			copied = false;
		}
	});

	const lastBackup = $derived(
		c.lastBackupAt
			? new Date(c.lastBackupAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
			: 'never'
	);

	function markBackedUp() {
		session.record((ch) => (ch.lastBackupAt = new Date().toISOString()));
	}

	async function saveFile() {
		busy = true;
		try {
			if (await saveBackupFile($state.snapshot(c) as Character)) {
				markBackedUp();
				session.notify('Backup saved');
			}
		} finally {
			busy = false;
		}
	}

	async function makeLink(): Promise<string> {
		if (link) return link;
		const code = await encodeRestoreCode($state.snapshot(c) as Character);
		link = `${location.origin}${location.pathname}?restore=${code}`;
		return link;
	}

	async function copyLink() {
		const url = await makeLink();
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			markBackedUp();
		} catch {
			// Clipboard needs HTTPS; the link is shown below to copy by hand.
			copied = false;
		}
	}

	async function showQr() {
		const url = await makeLink();
		const qr = qrcode(0, 'L');
		qr.addData(url);
		qr.make();
		qrSvg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
	}
</script>

<Sheet {open} {onclose} label="Back up {c.name}">
	<h2>Back up {c.name}</h2>
	<p class="muted">Last backup: {lastBackup}</p>

	<button type="button" class="big primary" disabled={busy} onclick={saveFile}>
		<strong>Save backup file</strong>
		<span>Save to Files, AirDrop or message it to yourself. Includes your photo.</span>
	</button>

	<button type="button" class="big" onclick={copyLink}>
		<strong>{copied ? 'Link copied' : 'Copy restore link'}</strong>
		<span>Paste it into Notes. Opening the link restores everything except the photo.</span>
	</button>

	<button type="button" class="big" onclick={showQr}>
		<strong>Show QR code</strong>
		<span>Scan with another phone's camera to move this character across.</span>
	</button>

	{#if qrSvg}
		<!-- Generated locally by qrcode-generator from our own link; no user HTML. -->
		<div class="qr">{@html qrSvg}</div>
	{/if}

	{#if link && !copied}
		<label class="manual">
			<span>Restore link</span>
			<textarea readonly rows="3" onfocus={(e) => e.currentTarget.select()}>{link}</textarea>
		</label>
	{/if}
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.muted {
		color: var(--color-text-muted);
		font-size: 14px;
		margin-bottom: 14px;
	}

	.big {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		text-align: left;
		padding: 14px 16px;
		margin-top: 8px;
		border-radius: 14px;
		border: 1.5px solid var(--color-border-strong);
		background: var(--color-surface);
		color: var(--color-text);
	}

	.big strong {
		font-size: 16px;
	}

	.big span {
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text-muted);
	}

	.big.primary {
		background: var(--color-accent);
		border-color: var(--color-accent-edge);
		color: var(--color-on-accent);
	}

	.big.primary span {
		color: inherit;
		opacity: 0.85;
	}

	.qr {
		margin: 14px auto 0;
		width: min(280px, 80vw);
		padding: 12px;
		background: #ffffff;
		border-radius: 12px;
	}

	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}

	.manual {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 12px;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	textarea {
		font-size: 13px;
		word-break: break-all;
	}
</style>
