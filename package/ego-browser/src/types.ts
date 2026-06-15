/**
 * Shared structural types for the ego-browser runtime.
 *
 * The Chrome DevTools Protocol defines hundreds of command/result shapes that
 * this package deliberately does not vendor (no `devtools-protocol` dependency).
 * CDP results are therefore typed as a permissive record: this is a justified
 * `any` (the alternative is hand-mirroring a slice of the protocol that would
 * drift from Chrome). All other boundaries below use precise types.
 */

/** A CDP command result object. Shape is defined by the DevTools Protocol. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped CDP protocol payload, see file header
export type CdpResult = Record<string, any>;

/** Parameters for a CDP command. */
export type CdpParams = Record<string, unknown>;

/** A raw CDP send function: (method, params?, sessionId?) => result. */
export type CdpSend = (
  method: string,
  params?: CdpParams,
  sessionId?: string,
) => Promise<CdpResult>;

/** Object form of the CDP client threaded through the element resolver. */
export type CdpClient = { sendRaw: CdpSend };

/** A browser-runtime request as understood by the native bridge. */
export type CdpRequest = {
  method: string;
  params?: CdpParams;
  session_id?: string;
};

/** A single entry in the {@link RefMap}, describing a resolved page element. */
export type RefEntry = {
  backendNodeId?: number | null;
  role?: string;
  name?: string;
  nth?: number;
  selector?: string;
  frameId?: string;
};

/**
 * The native ego bridge injected by the host browser as `globalThis.ego`.
 *
 * Present only inside the browser runtime; `undefined` on the Node CLI path,
 * which is why every call site guards with a `typeof` check. The surface is
 * owned by the host, so methods are optional and an index signature admits the
 * host-specific methods that {@link exposeEgoMethods} re-exposes dynamically.
 */
export interface EgoRuntime {
  [key: string]: unknown;
  sendCDPMessage?: (payload: string) => void;
  onCDPMessage?: (message: string) => void;
  listTabs?: () => Promise<CdpResult>;
  listTaskSpaces?: () => Promise<CdpResult>;
  useTaskSpace?: (id: number) => Promise<CdpResult>;
  createTaskSpace?: (name: string) => Promise<CdpResult>;
  claimTaskSpace?: (id: number, name?: string) => Promise<CdpResult>;
  completeTaskSpace?: () => Promise<CdpResult>;
  closeTaskSpace?: () => Promise<CdpResult>;
  handOffTaskSpace?: () => Promise<CdpResult>;
  takeOverTaskSpace?: () => Promise<CdpResult>;
  snapshot?: (options?: CdpParams) => Promise<CdpResult>;
  createTab?: (url?: string) => Promise<CdpResult>;
  animationHighlightMouseToPosition?: (x: number, y: number) => void;
  setAgentTaskState?: (label: string) => void;
  helpers?: Record<string, unknown>;
  learnings?: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line no-var -- global augmentation must use `var`
  var ego: EgoRuntime | undefined;
}
