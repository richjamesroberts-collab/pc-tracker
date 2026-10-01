const SIZE = 256;

/** Crop a picked photo to a centred square and shrink it to a small data URL for storage and backups. */
export async function portraitFromFile(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const side = Math.min(bitmap.width, bitmap.height);
	const canvas = document.createElement('canvas');
	canvas.width = SIZE;
	canvas.height = SIZE;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas unavailable');
	ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
	bitmap.close();
	const webp = canvas.toDataURL('image/webp', 0.8);
	// Older Safari can't encode WebP and silently returns PNG; JPEG is much smaller than that.
	return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}
