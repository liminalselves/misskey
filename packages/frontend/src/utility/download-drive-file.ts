/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';

// The authorized URL supplies attachment headers for cross-origin downloads.
export async function downloadDriveFile(file: Misskey.entities.DriveFile): Promise<void> {
	if (file.isDeleted || file.isAgentImageBlocked) return;

	const result = await (misskeyApi as unknown as (
		endpoint: 'drive/files/download-url',
		data: { fileId: string },
	) => Promise<{ url: string }>)('drive/files/download-url', {
		fileId: file.id,
	});
	const a = window.document.createElement('a');
	a.href = result.url;
	a.download = file.name || 'download';
	a.style.display = 'none';
	window.document.body.appendChild(a);
	a.click();
	a.remove();
}
