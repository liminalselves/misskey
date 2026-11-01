/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DriveFile } from 'misskey-js/entities.js';
import { downloadDriveFile } from '@/utility/download-drive-file.js';
import { misskeyApi } from '@/utility/misskey-api.js';

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
const api = vi.mocked(misskeyApi);
const file = { id: 'image1', name: 'image.png', url: 'https://storage.example/original.png' } as DriveFile;

afterEach(() => {
	vi.restoreAllMocks();
	api.mockReset();
});

describe('drive downloads after media viewer integration', () => {
	test.each([{ isDeleted: true }, { isAgentImageBlocked: true }])('never requests a download for an unavailable file: %s', state => {
		return downloadDriveFile({ ...file, ...state }).then(() => {
			expect(api).not.toHaveBeenCalled();
		});
	});

	test('uses the authorized download URL instead of the raw storage URL', async () => {
		api.mockResolvedValue({ url: 'https://storage.example/signed-download' } as never);
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		await downloadDriveFile(file);
		expect(api).toHaveBeenCalledExactlyOnceWith('drive/files/download-url', { fileId: file.id });
		expect(click).toHaveBeenCalledOnce();
		const link = click.mock.instances[0] as HTMLAnchorElement;
		expect(link.href).toBe('https://storage.example/signed-download');
		expect(link.download).toBe(file.name);
		expect(link.isConnected).toBe(false);
	});
});
