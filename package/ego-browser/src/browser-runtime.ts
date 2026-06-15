import { state } from "./state.js";
import { CDP } from "./constants.js";
import type { CdpParams, CdpResult, EgoRuntime } from "./types.js";
import type { RefMap } from "./ref-map.js";

const RESPONSE_TIMEOUT_MS = 15000;
const SESSION_TTL_MS = 2000;
// Upper bound for buffered CDP events. The runtime can be long-lived (installEgoSdk
// inside the browser); without a cap, undrained events grow without bound.
const MAX_BUFFERED_EVENTS = 10000;
const SESSION_LOST =
  /Session (?:with given id )?not found|Target closed|No session/i;
const BROWSER_LEVEL = (method: string) =>
  method.startsWith("Target.") || method.startsWith("Browser.");
let nextMessageId = 1;
type PendingEntry = {
  resolve: (response: CdpResult) => void;
  reject: (error: Error) => void;
};
const pending = new Map<number, PendingEntry>();
const events: CdpResult[] = [];
const pageEnabledSessions = new Set<string>();
const pendingDialogs = new Map<string, CdpResult>();
export function isBrowserRuntime() {
  return Boolean(
    globalThis.ego && typeof globalThis.ego.sendCDPMessage === "function",
  );
}

export function browserEgo(): EgoRuntime {
  if (!globalThis.ego) {
    throw new Error("browser runtime is not available");
  }
  return globalThis.ego;
}

function rawCdp(
  method: string,
  params: CdpParams = {},
  sessionId?: string,
  timeoutMs = RESPONSE_TIMEOUT_MS,
): Promise<CdpResult> {
  const runtime = browserEgo();
  const sendCDPMessage = runtime.sendCDPMessage;
  if (typeof sendCDPMessage !== "function") {
    throw new Error("browser runtime is not available");
  }
  runtime.onCDPMessage = handleMessage;
  const id = nextMessageId++;
  const payload = JSON.stringify({
    id,
    method,
    params,
    ...(sessionId ? { sessionId } : {}),
  });
  return new Promise<CdpResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP request timed out: ${method}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    try {
      sendCDPMessage.call(runtime, payload);
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}

export async function browserCdp(
  method: string,
  params: CdpParams = {},
  sessionId?: string,
  timeoutMs = RESPONSE_TIMEOUT_MS,
): Promise<CdpResult> {
  // Test mock: cdpOverride bypasses everything including session injection.
  if (state.cdpOverride) {
    return state.cdpOverride(method, params, sessionId);
  }
  const explicit = sessionId !== undefined;
  let effective = sessionId;
  if (!explicit && !BROWSER_LEVEL(method)) {
    effective = (await ensureSession()) ?? undefined;
  }
  try {
    return await rawCdp(method, params, effective, timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const lost = SESSION_LOST.test(message);
    if (lost && !explicit && !BROWSER_LEVEL(method)) {
      invalidateSession();
      const fresh = (await ensureSession()) ?? undefined;
      return rawCdp(method, params, fresh, timeoutMs);
    }
    throw error;
  }
}

export async function ensureSession() {
  if (state.sessionId && Date.now() - state.sessionAt < SESSION_TTL_MS) {
    return state.sessionId;
  }
  if (state.sessionInflight) {
    return state.sessionInflight;
  }
  state.sessionInflight = (async () => {
    try {
      const listTabs = browserEgo().listTabs;
      if (typeof listTabs !== "function") {
        throw new Error("browser runtime cannot list tabs");
      }
      const result = await listTabs();
      if (result?.error) {
        throw new Error(result.error);
      }
      const tabs: CdpResult[] = result?.tabs || result?.targetInfos || [];
      const preferred = state.preferredTargetId
        ? tabs.find((t) => t.targetId === state.preferredTargetId)
        : null;
      const active =
        preferred || tabs.find((t) => t.active) || tabs[tabs.length - 1];
      if (!active) {
        throw new Error("no active tab to attach session");
      }
      const targetId = active.targetId;
      if (targetId !== state.sessionTargetId || !state.sessionId) {
        const attached = await rawCdp(
          CDP.targetAttachToTarget,
          { targetId, flatten: true },
          undefined,
        );
        state.sessionId = attached.result?.sessionId || attached.sessionId;
        state.sessionTargetId = targetId;
      }
      await enablePageEvents(state.sessionId);
      state.sessionAt = Date.now();
      return state.sessionId;
    } finally {
      state.sessionInflight = null;
    }
  })();
  return state.sessionInflight;
}

export function invalidateSession() {
  if (state.sessionId) {
    pageEnabledSessions.delete(state.sessionId);
    pendingDialogs.delete(state.sessionId);
  }
  state.sessionId = null;
  state.sessionTargetId = null;
  state.sessionAt = 0;
}

export function setPreferredTarget(targetId?: string | null) {
  state.preferredTargetId = targetId || null;
}

export function clearPreferredTarget() {
  state.preferredTargetId = null;
}

export function drainBrowserEvents() {
  const out = events.splice(0, events.length);
  return out;
}

export function pendingDialog(sessionId: string | null = state.sessionId) {
  if (sessionId && pendingDialogs.has(sessionId)) {
    return { ...pendingDialogs.get(sessionId) };
  }
  return null;
}

async function enablePageEvents(sessionId: string | null | undefined) {
  if (!sessionId || pageEnabledSessions.has(sessionId)) {
    return;
  }
  try {
    await rawCdp(CDP.pageEnable, {}, sessionId);
    pageEnabledSessions.add(sessionId);
  } catch {
    // Dialog tracking is best-effort. Do not make all helpers fail on targets
    // that reject Page.enable, such as unusual internal pages.
  }
}

function handleMessage(message: string) {
  let data;
  try {
    data = JSON.parse(message);
  } catch {
    return;
  }
  if (Object.hasOwn(data, "id")) {
    const entry = pending.get(data.id);
    if (!entry) {
      return;
    }
    pending.delete(data.id);
    if (data.error) {
      entry.reject(new Error(data.error.message || data.error));
      return;
    }
    entry.resolve(data);
    return;
  }
  if (
    data.method === "Target.detachedFromTarget" ||
    data.method === "Target.targetDestroyed"
  ) {
    const sessionId = data.params?.sessionId || data.sessionId;
    if (sessionId) {
      pageEnabledSessions.delete(sessionId);
      pendingDialogs.delete(sessionId);
    }
    const targetId = data.params?.targetId || data.params?.targetInfo?.targetId;
    if (targetId && targetId === state.sessionTargetId) {
      invalidateSession();
    }
  }
  if (data.method === "Page.javascriptDialogOpening") {
    const sessionId = data.sessionId || state.sessionId;
    if (sessionId) {
      pendingDialogs.set(sessionId, data.params || {});
    }
  } else if (data.method === "Page.javascriptDialogClosed") {
    const sessionId = data.sessionId || state.sessionId;
    if (sessionId) {
      pendingDialogs.delete(sessionId);
    }
  }
  events.push(data);
  if (events.length > MAX_BUFFERED_EVENTS) {
    events.splice(0, events.length - MAX_BUFFERED_EVENTS);
  }
}

export function browserSnapshotRefsToRefMap(
  refMap: RefMap,
  refs: CdpResult[] = [],
) {
  refMap.clear();
  for (const ref of refs) {
    if (!ref || typeof ref !== "object") {
      continue;
    }
    if (ref.backendNodeId === undefined || ref.backendNodeId === null) {
      continue;
    }
    refMap.add(
      String(ref.backendNodeId),
      ref.backendNodeId,
      ref.role,
      ref.name,
      undefined,
    );
  }
}
