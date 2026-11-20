/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { focusTrap } from '@/utility/focus-trap.js';

// Aliyun's popup mode appends its window, mask and error tip directly to <body>
// (see e.initPopup in the SDK), i.e. outside the Vue app root that Misskey modals live in.
const aliyunCaptchaElements = [
	'aliyunCaptcha-mask',
	'aliyunCaptcha-window-popup',
	'aliyunCaptcha-common-errorTip',
	'aliyunCaptcha-errorTip',
];

let appRoot: HTMLDivElement;
let releases: (() => void)[];
let errorRelease: () => void;

beforeEach(() => {
	document.body.innerHTML = '';
	releases = [];

	appRoot = document.createElement('div');
	appRoot.id = 'misskey_app';
	document.body.appendChild(appRoot);

	const signinDialog = document.createElement('div');
	signinDialog.style.zIndex = '1000100';
	appRoot.appendChild(signinDialog);
	releases.push(focusTrap(signinDialog).release);
});

afterEach(() => {
	for (const release of releases) release();
	document.body.innerHTML = '';
});

// Mimics the wrong-password os.alert stacked on top of the signin dialog.
function openErrorDialog(): void {
	const errorDialog = document.createElement('div');
	errorDialog.style.zIndex = '3000100';
	appRoot.appendChild(errorDialog);
	errorRelease = focusTrap(errorDialog).release;
}

describe('focusTrap and Aliyun captcha popup', () => {
	test('the popup stays interactive after a nested error dialog closes', () => {
		// The SDK inserted the popup before the wrong-password error dialog appeared.
		const popup = document.createElement('div');
		popup.id = 'aliyunCaptcha-window-popup';
		document.body.appendChild(popup);

		openErrorDialog();
		errorRelease();

		for (const id of aliyunCaptchaElements) {
			const el = document.createElement('div');
			el.id = id;
			document.body.appendChild(el);
			expect(el.inert, `#${id}`).toBe(false);
		}
	});

	test('a popup opened while an error dialog is showing is not inert either', () => {
		openErrorDialog();
		for (const id of aliyunCaptchaElements) {
			const el = document.createElement('div');
			el.id = id;
			document.body.appendChild(el);
			expect(el.inert, `#${id}`).toBe(false);
			errorRelease();
			expect(el.inert, `#${id}`).toBe(false);
			openErrorDialog();
		}
		errorRelease();
	});

	test('unrelated body siblings are still trapped while a dialog is open', () => {
		const other = document.createElement('div');
		document.body.appendChild(other);

		openErrorDialog();
		expect(other.inert).toBe(true);
		errorRelease();
	});

	test('the app root is trapped again when another dialog opens', () => {
		openErrorDialog();
		errorRelease();

		const sibling = document.createElement('div');
		appRoot.appendChild(sibling);

		const nextDialog = document.createElement('div');
		nextDialog.style.zIndex = '3000200';
		appRoot.appendChild(nextDialog);
		releases.push(focusTrap(nextDialog).release);

		expect(sibling.inert).toBe(true);
	});
});
