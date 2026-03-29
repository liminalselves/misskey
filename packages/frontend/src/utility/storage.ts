/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, shallowRef, watch, defineAsyncComponent } from 'vue';
import * as os from '@/os.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';

async function getStoragePersisted(): Promise<boolean> {
	if (typeof navigator === 'undefined' || navigator.storage == null) {
		return false;
	}
	try {
		return await navigator.storage.persisted();
	} catch {
		return false;
	}
}

export const storagePersisted = ref(await getStoragePersisted());

export async function enableStoragePersistence() {
	if (typeof navigator === 'undefined' || navigator.storage == null) {
		return;
	}
	try {
		const persisted = await navigator.storage.persist();
		if (persisted) {
			storagePersisted.value = true;
		} else {
			os.alert({
				type: 'error',
				text: i18n.ts.somethingHappened,
			});
		}
	}	catch (err) {
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	}
}

export function skipStoragePersistence() {
	store.set('showStoragePersistenceSuggestion', false);
}
