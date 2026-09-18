/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: MIT
 */
//@ts-check
(() => {
	const panels = new Set(['model', 'draw', 'proactive', 'memory', 'worldbook', 'rules', 'style', 'operations']);

	class MisskeyAgentControl {
		/**
		 * @param {{
		 *   origin: string;
		 *   sessionId: string;
		 *   panel: 'model' | 'draw' | 'proactive' | 'memory' | 'worldbook' | 'rules' | 'style' | 'operations';
		 *   token: string | (() => string | Promise<string>);
		 *   appearance?: Record<string, unknown>;
		 *   className?: string;
		 *   title?: string;
		 *   autoHeight?: boolean;
		 *   minHeight?: number;
		 *   maxHeight?: number;
		 *   onEvent?: (message: Record<string, unknown>) => void;
		 * }} options
		 */
		constructor(options) {
			if (!options || typeof options !== 'object') throw new TypeError('options is required');
			if (!panels.has(options.panel)) throw new TypeError(`Unknown panel: ${options.panel}`);
			this.origin = new URL(options.origin).origin;
			this.sessionId = String(options.sessionId);
			this.panel = options.panel;
			this.token = options.token;
			this.appearance = options.appearance ?? {};
			this.autoHeight = options.autoHeight !== false;
			this.minHeight = Number.isFinite(options.minHeight) ? Math.max(0, Number(options.minHeight)) : 320;
			this.maxHeight = Number.isFinite(options.maxHeight) ? Math.max(this.minHeight, Number(options.maxHeight)) : Infinity;
			this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
			this.iframe = document.createElement('iframe');
			const iframeUrl = new URL(`/agents/embed/${encodeURIComponent(this.sessionId)}/${this.panel}`, this.origin);
			try {
				iframeUrl.searchParams.set('appearance', btoa(unescape(encodeURIComponent(JSON.stringify(this.appearance)))));
			} catch {
				// Runtime postMessage still applies the appearance when it cannot be serialized for bootstrap.
			}
			this.iframe.src = iframeUrl.href;
			this.iframe.title = options.title || `Agent ${this.panel} control`;
			this.iframe.loading = 'eager';
			this.iframe.referrerPolicy = 'origin';
			this.iframe.style.width = '100%';
			this.iframe.style.height = `${this.minHeight}px`;
			this.iframe.style.border = '0';
			this.iframe.style.display = 'block';
			if (options.className) this.iframe.className = options.className;
			this._mounted = false;
			this._onMessage = this._onMessage.bind(this);
		}

		/** @param {HTMLElement} container */
		mount(container) {
			if (!(container instanceof HTMLElement)) throw new TypeError('container must be an HTMLElement');
			if (this._mounted) return this;
			this._mounted = true;
			window.addEventListener('message', this._onMessage);
			container.appendChild(this.iframe);
			return this;
		}

		async _resolveToken() {
			const value = typeof this.token === 'function' ? await this.token() : this.token;
			if (typeof value !== 'string' || value.trim() === '') throw new TypeError('token must resolve to a non-empty string');
			return value.trim();
		}

		async _configure() {
			this.iframe.contentWindow?.postMessage({
				type: 'misskey:agent-control:update-appearance',
				appearance: this.appearance,
			}, this.origin);
			try {
				const token = await this._resolveToken();
				this.iframe.contentWindow?.postMessage({
					type: 'misskey:agent-control:update-token',
					token,
				}, this.origin);
			} catch (error) {
				this.onEvent?.({ type: 'misskey:agent-control:host-error', error });
			}
		}

		/** @param {MessageEvent} event */
		_onMessage(event) {
			if (event.origin !== this.origin || event.source !== this.iframe.contentWindow) return;
			const message = event.data;
			if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
			if (message.type === 'misskey:agent-control:ready') void this._configure();
			if (message.type === 'misskey:agent-control:height' && this.autoHeight && Number.isFinite(message.height)) {
				const height = Math.max(this.minHeight, Math.min(this.maxHeight, Number(message.height)));
				this.iframe.style.height = `${height}px`;
			}
			this.onEvent?.(message);
		}

		/** @param {Record<string, unknown>} appearance */
		setAppearance(appearance) {
			this.appearance = appearance ?? {};
			this.iframe.contentWindow?.postMessage({
				type: 'misskey:agent-control:update-appearance',
				appearance: this.appearance,
			}, this.origin);
		}

		/** @param {string | (() => string | Promise<string>)} token */
		setToken(token) {
			this.token = token;
			void this._resolveToken().then(value => {
				this.iframe.contentWindow?.postMessage({
					type: 'misskey:agent-control:update-token',
					token: value,
				}, this.origin);
			}).catch(error => {
				this.onEvent?.({ type: 'misskey:agent-control:host-error', error });
			});
		}

		destroy() {
			window.removeEventListener('message', this._onMessage);
			this.iframe.remove();
			this._mounted = false;
		}
	}

	Object.defineProperty(window, 'MisskeyAgentControl', {
		value: MisskeyAgentControl,
		configurable: false,
		writable: false,
	});
})();
