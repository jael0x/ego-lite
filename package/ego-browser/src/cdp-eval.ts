import { send, state } from "./state.js";
import { CDP } from "./constants.js";
import type { CdpParams, CdpResult } from "./types.js";

class TimeoutError extends Error {}

let hasWarnedAboutFunctionJs = false;

/**
 * Send a raw Chrome DevTools Protocol command.
 * @param {string} method CDP method name, for example Runtime.evaluate.
 * @param {object} [params] CDP command parameters.
 * @param {string} [sessionId] Optional attached target session id.
 * @returns {Promise<object>} CDP result object.
 */
export async function cdp(
  method: string,
  params: CdpParams = {},
  sessionId?: string,
): Promise<CdpResult> {
  const result = state.cdpOverride
    ? await state.cdpOverride(method, params, sessionId)
    : (await send({ method, params, session_id: sessionId })).result || {};
  if (
    !sessionId &&
    (method === CDP.networkEnable || method === CDP.networkDisable)
  ) {
    // Mirror the default session's Network domain state so helpers like
    // waitForNetworkIdle can restore it instead of tearing down a domain
    // the caller still relies on for drainEvents().
    state.networkDomainEnabled = method === "Network.enable";
  }
  return result;
}

/**
 * Evaluate JavaScript in the current page or a target tab.
 * @param {string | Function} expression JavaScript source string or a function whose body should be evaluated.
 *   Passing a function is accepted as a convenience but emits a one-time warning to stderr so callers can
 *   switch to the canonical string form. Top-level return statements in strings are auto-wrapped in an IIFE.
 * @param {string} [targetId] Optional target id to attach and evaluate in.
 * @returns {Promise<any>} Runtime.evaluate return-by-value result.
 */
// Trust boundary: js() is a thin wrapper over CDP Runtime.evaluate and runs the
// caller-supplied expression with full page authority by design. Callers are the
// local operator's own automation scripts, not untrusted input.
export async function js(
  expression: string | (() => unknown),
  targetId?: string,
): Promise<any> {
  if (typeof expression === "function") {
    const source = expression.toString();
    if (!hasWarnedAboutFunctionJs) {
      hasWarnedAboutFunctionJs = true;
      process.stderr.write(
        `[ego-browser] js() received a function and auto-wrapped it (${jsSnippet(source, 80)}).\n` +
          `  js() is a thin wrapper over CDP Runtime.evaluate; it takes a string expression,\n` +
          `  not a Puppeteer/Playwright-style callable. Auto-wrap does NOT capture closure\n` +
          `  variables and has NO args channel.\n` +
          `  Prefer:\n` +
          `    js(\`<expression>\`)  // pure expression or explicit IIFE\n`,
      );
    }
    expression = `(${source})()`;
  } else if (typeof expression !== "string") {
    throw new TypeError(
      `js() expects a string expression or function, got ${expression === null ? "null" : typeof expression}`,
    );
  }
  const sessionId = targetId
    ? (await cdp(CDP.targetAttachToTarget, { targetId, flatten: true }))
        .sessionId
    : undefined;
  let finalExpression = expression;
  if (hasReturnStatement(expression) && !expression.trim().startsWith("(")) {
    finalExpression = `(function(){${expression}})()`;
  }
  return runtimeEvaluate(finalExpression, sessionId, true);
}

async function runtimeEvaluate(
  expression: string,
  sessionId?: string,
  awaitPromise = false,
) {
  try {
    const response = await cdp(
      CDP.runtimeEvaluate,
      {
        expression,
        returnByValue: true,
        awaitPromise,
      },
      sessionId,
    );
    return runtimeValue(response, expression);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error instanceof TimeoutError || /timed out/i.test(message)) {
      throw new Error(
        `Runtime.evaluate timed out; expression: ${jsSnippet(expression)}`,
      );
    }
    throw error;
  }
}

export function runtimeValue(response: CdpResult, expression: string): any {
  const result = response.result || {};
  const details = response.exceptionDetails;
  if (details || result.subtype === "error") {
    const desc = jsExceptionDescription(result, details);
    const loc =
      details?.lineNumber !== undefined && details?.columnNumber !== undefined
        ? ` at line ${details.lineNumber}, column ${details.columnNumber}`
        : "";
    throw new Error(
      `JavaScript evaluation failed${loc}: ${desc}; expression: ${jsSnippet(expression)}`,
    );
  }
  if (Object.hasOwn(result, "value")) {
    return result.value;
  }
  if (Object.hasOwn(result, "unserializableValue")) {
    return decodeUnserializableJsValue(result.unserializableValue);
  }
  return null;
}

function jsExceptionDescription(
  result: CdpResult,
  details: CdpResult | undefined,
) {
  let desc = result.description;
  const exception = details?.exception;
  if (!desc && exception && typeof exception === "object") {
    desc = exception.description;
    if (desc === undefined && Object.hasOwn(exception, "value")) {
      desc = String(exception.value);
    }
    if (desc === undefined) {
      desc = exception.className;
    }
  }
  return desc || details?.text || "JavaScript evaluation failed";
}

export function decodeUnserializableJsValue(value: string) {
  if (value === "NaN") {
    return Number.NaN;
  }
  if (value === "Infinity") {
    return Number.POSITIVE_INFINITY;
  }
  if (value === "-Infinity") {
    return Number.NEGATIVE_INFINITY;
  }
  if (value === "-0") {
    return -0;
  }
  if (value.endsWith("n")) {
    return BigInt(value.slice(0, -1));
  }
  return value;
}

function jsSnippet(expression: string, limit = 160) {
  const snippet = expression.trim().replace(/\n/g, "\\n");
  return snippet.length > limit ? `${snippet.slice(0, limit - 3)}...` : snippet;
}

export function hasReturnStatement(expression: string) {
  let i = 0;
  let stateName = "code";
  let quote = "";
  while (i < expression.length) {
    const ch = expression[i];
    const next = expression[i + 1] || "";
    if (stateName === "code") {
      if (ch === "'" || ch === '"' || ch === "`") {
        stateName = "string";
        quote = ch;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "/") {
        stateName = "line_comment";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        stateName = "block_comment";
        i += 2;
        continue;
      }
      if (expression.startsWith("return", i)) {
        const before = i > 0 ? expression[i - 1] : "";
        const after = expression[i + 6] || "";
        if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)) {
          return true;
        }
      }
      i += 1;
      continue;
    }
    if (stateName === "line_comment") {
      if (ch === "\n") {
        stateName = "code";
      }
      i += 1;
      continue;
    }
    if (stateName === "block_comment") {
      if (ch === "*" && next === "/") {
        stateName = "code";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (stateName === "string") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) {
        stateName = "code";
        quote = "";
      }
      i += 1;
    }
  }
  return false;
}
