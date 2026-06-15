import { cdp } from "../cdp-eval.js";
import { withHandle } from "./element-ops.js";
import { CDP } from "../constants.js";

/**
 * Set files on a file input.
 * @param {string} selector CSS selector / @ref / loc= / xpath= for an input[type=file].
 * @param {string|string[]} path Absolute file path or paths to upload.
 * @returns {Promise<void>}
 */
export async function uploadFile(selector: string, path: string | string[]) {
  const files = Array.isArray(path) ? path : [path];
  await withHandle(selector, async ({ objectId, sessionId }) => {
    await cdp(CDP.domSetFileInputFiles, { files, objectId }, sessionId);
  });
}
