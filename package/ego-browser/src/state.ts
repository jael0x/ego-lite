import { writeFile } from "node:fs/promises";

import { agentWorkspace, loadEnv } from "./env.js";
import { browserCdp } from "./browser-runtime.js";
import { ENV } from "./constants.js";
import type { CdpRequest, CdpResult, CdpSend } from "./types.js";

loadEnv();

export const NAME = process.env[ENV.browserName] || "default";

async function defaultSend(req: CdpRequest): Promise<{ result: CdpResult }> {
  if (!req || typeof req !== "object" || !req.method) {
    throw new Error(
      `unsupported browser runtime request: ${JSON.stringify(req)}`,
    );
  }
  const response = await browserCdp(
    req.method,
    req.params || {},
    req.session_id,
  );
  return { result: response.result || {} };
}

type AppState = {
  send: (req: CdpRequest) => Promise<{ result: CdpResult }>;
  cdpOverride: CdpSend | null;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  platform: NodeJS.Platform;
  agentWorkspace: () => string;
  writeFile: typeof writeFile;
  sessionId: string | null;
  sessionTargetId: string | null;
  sessionAt: number;
  sessionInflight: Promise<string | null> | null;
  preferredTargetId: string | null;
  networkDomainEnabled: boolean;
};

export const state: AppState = {
  send: defaultSend,
  cdpOverride: null,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  platform: process.platform,
  agentWorkspace: () => agentWorkspace(),
  writeFile,
  sessionId: null,
  sessionTargetId: null,
  sessionAt: 0,
  sessionInflight: null,
  preferredTargetId: null,
  // Last observed Network domain state on the default session (tracked in cdp()).
  networkDomainEnabled: false,
};

export async function send(req: CdpRequest) {
  return state.send(req);
}

export function cdpAvailable() {
  return Boolean(state.cdpOverride) || state.send !== defaultSend;
}

export function setOverrides(overrides: Partial<AppState>) {
  const previous = { ...state };
  Object.assign(state, overrides);
  return () => {
    Object.assign(state, previous);
  };
}
