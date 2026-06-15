import type { RefEntry } from "./types.js";

export class RefMap {
  map: Map<string, RefEntry>;

  constructor() {
    this.map = new Map();
  }

  add(
    refId: string,
    backendNodeId: number | null | undefined,
    role?: string,
    name?: string,
    nth: number | undefined = undefined,
  ) {
    this.addWithFrame(refId, backendNodeId, role, name, nth, undefined);
  }

  addWithFrame(
    refId: string,
    backendNodeId: number | null | undefined,
    role: string | undefined,
    name: string | undefined,
    nth: number | undefined = undefined,
    frameId: string | undefined = undefined,
  ) {
    this.map.set(refId, {
      backendNodeId,
      role,
      name,
      nth,
      selector: undefined,
      frameId,
    });
  }

  get(refId: string) {
    return this.map.get(refId);
  }

  remove(refId: string) {
    this.map.delete(refId);
  }

  clear() {
    this.map.clear();
  }
}

export function parseRef(input: unknown) {
  const trimmed = String(input || "").trim();
  for (const candidate of [
    trimmed.startsWith("@") ? trimmed.slice(1) : null,
    trimmed.startsWith("ref=") ? trimmed.slice(4) : null,
    trimmed,
  ]) {
    if (candidate && /^\d+$/.test(candidate)) {
      return candidate;
    }
  }
  return null;
}
