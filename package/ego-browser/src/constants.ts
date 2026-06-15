/**
 * Centralized string constants for values drawn from fixed sets, so identifiers
 * are defined once and referenced everywhere instead of scattered as literals.
 */

/** Chrome DevTools Protocol method names used by the driver layer. */
export const CDP = {
  runtimeEvaluate: "Runtime.evaluate",
  runtimeCallFunctionOn: "Runtime.callFunctionOn",
  runtimeReleaseObject: "Runtime.releaseObject",
  domGetBoxModel: "DOM.getBoxModel",
  domResolveNode: "DOM.resolveNode",
  domSetFileInputFiles: "DOM.setFileInputFiles",
  accessibilityGetFullAXTree: "Accessibility.getFullAXTree",
  inputDispatchMouseEvent: "Input.dispatchMouseEvent",
  inputDispatchKeyEvent: "Input.dispatchKeyEvent",
  inputInsertText: "Input.insertText",
  pageNavigate: "Page.navigate",
  pageGetFrameTree: "Page.getFrameTree",
  pageEnable: "Page.enable",
  pageCaptureScreenshot: "Page.captureScreenshot",
  targetAttachToTarget: "Target.attachToTarget",
  targetActivateTarget: "Target.activateTarget",
  targetCloseTarget: "Target.closeTarget",
  targetGetTargets: "Target.getTargets",
  networkEnable: "Network.enable",
  networkDisable: "Network.disable",
} as const;

/** Task-space ownership states (see the ownership policy in helpers.ts). */
export const OWNERSHIP = {
  agent: "agent",
  agentDelegatedToUser: "agentDelegatedToUser",
  user: "user",
} as const;

export type Ownership = (typeof OWNERSHIP)[keyof typeof OWNERSHIP];

/** Reason a task-space helper skipped (resolved without acting). */
export const SKIP_REASON = {
  userOwned: "user-owned",
} as const;

/** Locator kinds parsed from `loc=` selectors. */
export const LOCATOR_KIND = {
  css: "css",
  href: "href",
  role: "role",
} as const;

export type LocatorKind = (typeof LOCATOR_KIND)[keyof typeof LOCATOR_KIND];

/** Site-skill tool execution contexts. */
export const TOOL_TYPE = {
  node: "node",
  browser: "browser",
} as const;

export type ToolType = (typeof TOOL_TYPE)[keyof typeof TOOL_TYPE];

/** Manifest keys holding each tool kind. */
export const MANIFEST_TOOL_KEY = {
  node: "nodeTools",
  browser: "browserTools",
} as const;

/** Environment variable names read across the runtime. */
export const ENV = {
  browserName: "EGO_BROWSER_NAME",
  agentWorkspace: "EGO_BROWSER_AGENT_WORKSPACE",
  debugClicks: "EGO_BROWSER_DEBUG_CLICKS",
} as const;
