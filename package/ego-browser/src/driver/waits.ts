import { state } from "../state.js";
import { cdp, js } from "../cdp-eval.js";
import { parseRef } from "../ref-map.js";
import { browserRefMap, ensureRefMapForRef } from "../ref-state.js";
import { resolveElementObjectId } from "../element-resolver.js";
import { type WaitForLoadOptions, waitForDocumentLoad } from "./load.js";
import { drainEvents } from "./observe.js";

type WaitForElementOptions = {
  timeout?: number;
  visible?: boolean;
};

type WaitForNetworkIdleOptions = {
  timeout?: number;
  idleMs?: number;
};

/**
 * Sleep for a fixed number of seconds.
 * @param {number} [seconds=1.0] Seconds to wait.
 * @returns {Promise<void>}
 */
export async function wait(seconds = 1.0) {
  await state.sleep(seconds * 1000);
}

/**
 * Wait until document.readyState is complete.
 * @param {{timeout?: number}} [options]
 * @returns {Promise<boolean>} True when loaded before timeout.
 */
export async function waitForLoad(options: WaitForLoadOptions = {}) {
  return waitForDocumentLoad(options);
}

/**
 * Wait until an element exists, optionally requiring visibility.
 * @param {string} selector CSS selector or @ref to poll.
 * @param {{timeout?: number, visible?: boolean}} [options]
 * @returns {Promise<boolean>} True when found before timeout.
 */
export async function waitForElement(selector: string, options: WaitForElementOptions = {}) {
  const timeout = options.timeout ?? 10.0;
  const visible = options.visible ?? false;
  const deadline = state.now() + timeout * 1000;
  if (parseRef(selector)) {
    await ensureRefMapForRef(selector);
    const visibilityFn = "function(){if(typeof this.checkVisibility==='function')return this.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});const s=getComputedStyle(this);return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';}";
    while (state.now() < deadline) {
      try {
        const { objectId, sessionId } = await resolveElementObjectId({ sendRaw: cdp }, undefined, browserRefMap, selector);
        if (!visible) return true;
        const response = await cdp("Runtime.callFunctionOn", {
          functionDeclaration: visibilityFn,
          objectId,
          returnByValue: true,
          awaitPromise: false
        }, sessionId);
        if (response.result?.value) return true;
      } catch {
        // ref not yet resolvable; keep polling.
      }
      await state.sleep(300);
    }
    return false;
  }
  const check = visible
    ? `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;if(typeof e.checkVisibility==='function')return e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'})()`
    : `!!document.querySelector(${JSON.stringify(selector)})`;
  while (state.now() < deadline) {
    if (await js(check)) {
      return true;
    }
    await state.sleep(300);
  }
  return false;
}

/**
 * Wait until network events are idle.
 * @param {{timeout?: number, idleMs?: number}} [options]
 * @returns {Promise<boolean>} True when idle before timeout.
 */
export async function waitForNetworkIdle(options: WaitForNetworkIdleOptions = {}) {
  const timeout = options.timeout ?? 10.0;
  const idleMs = options.idleMs ?? 500;
  const deadline = state.now() + timeout * 1000;
  let lastActivity = state.now();
  const inflight = new Set();
  while (state.now() < deadline) {
    for (const event of await drainEvents()) {
      const method = event.method || "";
      const params = event.params || {};
      if (method === "Network.requestWillBeSent") {
        inflight.add(params.requestId);
        lastActivity = state.now();
      } else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
        inflight.delete(params.requestId);
        lastActivity = state.now();
      } else if (method.startsWith("Network.")) {
        lastActivity = state.now();
      }
    }
    if (inflight.size === 0 && state.now() - lastActivity >= idleMs) {
      return true;
    }
    await state.sleep(100);
  }
  return false;
}
