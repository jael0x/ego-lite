import { cdp } from "../cdp-eval.js";
import { parseRef } from "../ref-map.js";
import { browserRefMap, ensureRefMapForRef } from "../ref-state.js";
import { resolveElementObjectId } from "../element-resolver.js";

/**
 * Set files on a file input.
 * @param {string} selector CSS selector or @ref for an input[type=file].
 * @param {string|string[]} path Absolute file path or paths to upload.
 * @returns {Promise<void>}
 */
export async function uploadFile(selector, path) {
  const files = Array.isArray(path) ? path : [path];
  if (parseRef(selector)) {
    await ensureRefMapForRef(selector);
    const { objectId, sessionId } = await resolveElementObjectId({ sendRaw: cdp }, undefined, browserRefMap, selector);
    await cdp("DOM.setFileInputFiles", { files, objectId }, sessionId);
    return;
  }
  const doc = await cdp("DOM.getDocument", { depth: -1 });
  const nodeId = (await cdp("DOM.querySelector", { nodeId: doc.root.nodeId, selector })).nodeId;
  if (!nodeId) {
    throw new Error(`no element for ${selector}`);
  }
  await cdp("DOM.setFileInputFiles", { files, nodeId });
}
