/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import { prefer } from '@/preferences.js';
import { useUploader } from '@/composables/use-uploader.js';
import MkUploaderDialog from '@/components/MkUploaderDialog.vue';
import { i18n } from '@/i18n.js';

const { uploadFileMock, UploadAbortedErrorMock } = vi.hoisted(() => {
	class MockUploadAbortedError extends Error {
		constructor() {
			super('Upload aborted');
		}
	}
	return {
		uploadFileMock: vi.fn(),
		UploadAbortedErrorMock: MockUploadAbortedError,
	};
});

vi.mock('@/i.js', () => ({
	$i: { id: 'u1', policies: { watermarkAvailable: false, maxFileSizeMb: 50 } },
	iAmModerator: false,
	iAmAdmin: false,
	notesCount: 0,
	incNotesCount: vi.fn(),
	ensureSignin: () => ({ id: 'u1', policies: { watermarkAvailable: false, maxFileSizeMb: 50 } }),
}));

vi.mock('@/utility/drive.js', () => ({
	uploadFile: uploadFileMock,
	UploadAbortedError: UploadAbortedErrorMock,
}));

vi.mock('@/utility/isWebpSupported.js', () => ({
	isWebpSupported: () => true,
}));

vi.mock('@/os.js', () => ({
	confirm: vi.fn().mockResolvedValue({ canceled: false }),
	alert: vi.fn(),
	popupMenu: vi.fn(),
	contextMenu: vi.fn(),
	chooseFileFromPc: vi.fn().mockResolvedValue([]),
	popupAsyncWithDialog: vi.fn(),
	popup: vi.fn(),
	claimZIndex: () => 1000100,
}));

function makeDriveFile(id: string): Misskey.entities.DriveFile {
	return { id, name: `${id}.txt`, type: 'text/plain', size: 5 } as Misskey.entities.DriveFile;
}

async function flush() {
	await nextTick();
	await new Promise(resolve => setTimeout(resolve, 0));
	await nextTick();
}

beforeEach(() => {
	Object.assign(prefer.s, {
		keepOriginalFilename: true,
		defaultImageCompressionLevel: 0,
		defaultVideoCompressionLevel: 0,
		watermarkPresets: [],
		defaultWatermarkPresetId: null,
		uploadFolder: null,
	});
	vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
	vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
	uploadFileMock.mockReset();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('useUploader retry readiness after failure or abort', () => {
	test('readyForUpload stays true after upload failure and after abort so upload() can retry', async () => {
		let uploader!: ReturnType<typeof useUploader>;
		render(defineComponent({
			setup() {
				uploader = useUploader({ multiple: true });
				return () => null;
			},
		}));

		const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
		uploader.addFiles([file]);
		await flush();
		expect(uploader.readyForUpload.value).toBe(true);

		// 1) Simulate failed upload
		uploadFileMock.mockReturnValueOnce({
			filePromise: Promise.reject(new Error('network fail')),
			abort: vi.fn(),
		});
		await uploader.upload();
		expect(uploader.items.value[0].uploadFailed).toBe(true);
		expect(uploader.readyForUpload.value).toBe(true);

		// 2) Simulate user-aborted upload
		let rejectAborted!: (err: Error) => void;
		uploadFileMock.mockReturnValueOnce({
			filePromise: new Promise((_, reject) => { rejectAborted = reject; }),
			abort: () => rejectAborted(new UploadAbortedErrorMock()),
		});
		const uploadPromise = uploader.upload();
		await nextTick();
		uploader.abortAll();
		await uploadPromise;
		expect(uploader.items.value[0].aborted).toBe(true);
		expect(uploader.readyForUpload.value).toBe(true);

		// 3) Retry succeeds and marks allItemsUploaded
		uploadFileMock.mockReturnValueOnce({
			filePromise: Promise.resolve(makeDriveFile('file-1')),
			abort: vi.fn(),
		});
		await uploader.upload();
		expect(uploader.items.value[0].uploadFailed).toBe(false);
		expect(uploader.items.value[0].aborted).toBe(false);
		expect(uploader.allItemsUploaded.value).toBe(true);
	});

	test('MkUploaderDialog shows Retry button after a failed upload and succeeds on retry', async () => {
		const closeMock = vi.fn();
		const onDone = vi.fn();

		uploadFileMock
			.mockReturnValueOnce({
				filePromise: Promise.reject(new Error('boom')),
				abort: vi.fn(),
			})
			.mockReturnValueOnce({
				filePromise: Promise.resolve(makeDriveFile('file-2')),
				abort: vi.fn(),
			});

		const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
		const { container } = render(MkUploaderDialog, {
			props: {
				files: [file],
				multiple: false,
				onDone,
			},
			global: {
				stubs: {
					MkModalWindow: defineComponent({
						setup(_, { slots, expose }) {
							expose({ close: closeMock });
							return () => h('div', [slots.header?.(), slots.default?.(), slots.footer?.()]);
						},
					}),
					MkUploaderItems: true,
					MkTip: true,
					MkButton: defineComponent({
						props: ['disabled'],
						emits: ['click'],
						template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot/></button>',
					}),
				},
			},
		});
		await flush();

		const uploadBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(i18n.ts.upload));
		expect(uploadBtn).toBeDefined();
		expect(uploadBtn!.disabled).toBe(false);

		await fireEvent.click(uploadBtn!);
		await flush();

		const retryBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(i18n.ts.retry));
		expect(retryBtn).toBeDefined();

		await fireEvent.click(retryBtn!);
		await flush();

		expect(onDone).toHaveBeenCalledWith([expect.objectContaining({ id: 'file-2' })]);
		expect(closeMock).toHaveBeenCalled();
	});
});
