import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const e2eSkip = { skip: process.env.EGO_BROWSER_E2E !== "1" };
const egoBin = process.env.EGO_BROWSER_BIN || "ego-browser";

function runScript(script, timeout = 30_000) {
  const result = spawnSync(egoBin, ["nodejs"], {
    input: script,
    encoding: "utf8",
    timeout,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `ego-browser nodejs failed: status=${result.status} signal=${result.signal}\n` +
      `stdout: ${result.stdout}\nstderr: ${result.stderr}\nerror: ${result.error?.message || ""}`
    );
  }
  return result;
}

function lastJsonLine(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("{") || lines[i].startsWith("[")) {
      return JSON.parse(lines[i]);
    }
  }
  throw new Error(`no JSON line found in output:\n${text}`);
}

test("real browser runtime can navigate, inspect page info, and snapshot", e2eSkip, () => {
  const script = `
    await useOrCreateTaskSpace('e2e-navigate');
    await openOrReuseTab('https://example.com', { wait: true, timeout: 20 });
    const info = await pageInfo();
    const text = await snapshotText();
    cliLog(JSON.stringify({ title: info.title, hasExample: text.includes('Example') }));
    await completeTaskSpace('e2e-navigate', { keep: false });
  `;
  const result = runScript(script, 30_000);
  const payload = lastJsonLine(result.stderr);
  assert.equal(payload.title, "Example Domain");
  assert.equal(payload.hasExample, true);
});

test("ego.snapshot rejects under user-control after handOffTaskSpace", e2eSkip, () => {
  const script = `
    const name = 'e2e-probe-handoff';
    await useOrCreateTaskSpace(name);
    await openOrReuseTab('https://example.com', { wait: true, timeout: 20 });
    let beforeOk = false, afterRejected = false, afterError = '';
    try { await globalThis.ego.snapshot({ maxResultLength: 1 }); beforeOk = true; } catch (e) { afterError = 'before:' + e.message; }
    await handOffTaskSpace(name);
    try { await globalThis.ego.snapshot({ maxResultLength: 1 }); }
    catch (e) { afterRejected = true; afterError = e.message; }
    await takeOverTaskSpace(name);
    await completeTaskSpace(name, { keep: false });
    cliLog(JSON.stringify({ beforeOk, afterRejected, afterError }));
  `;
  const result = runScript(script);
  const payload = lastJsonLine(result.stderr);
  assert.equal(payload.beforeOk, true, "snapshot should succeed when agent has control");
  assert.equal(payload.afterRejected, true, `snapshot should reject under user-control; got: ${payload.afterError}`);
});

test("waitForAgentControl blocks until takeOverTaskSpace restores control", e2eSkip, () => {
  const script = `
    const name = 'e2e-wait-control';
    await useOrCreateTaskSpace(name);
    await openOrReuseTab('https://example.com', { wait: true, timeout: 20 });
    await handOffTaskSpace(name);
    setTimeout(() => { takeOverTaskSpace(name).catch(() => {}); }, 3000);
    const t0 = Date.now();
    await waitForAgentControl(name, { interval: 1, timeout: 20 });
    const elapsed = (Date.now() - t0) / 1000;
    await completeTaskSpace(name, { keep: false });
    cliLog(JSON.stringify({ elapsed, blocked: elapsed >= 2 }));
  `;
  const result = runScript(script);
  const payload = lastJsonLine(result.stderr);
  assert.equal(payload.blocked, true, `waitForAgentControl should block ~3s; elapsed=${payload.elapsed}s`);
});

test("elementEval: arrow (el)=>el.X, (el,arg)=>el[arg], and legacy function(){this} all work in a real page", e2eSkip, () => {
  const script = `
    const name = 'e2e-element-eval';
    await useOrCreateTaskSpace(name);
    await openOrReuseTab('https://example.com', { wait: true, timeout: 20 });

    const arrowReadText  = await elementEval('h1', (el) => el.textContent);
    const arrowWithArg   = await elementEval('h1', (el, prop) => el[prop], 'tagName');
    const legacyThisForm = await elementEval('h1', function () { return this.tagName; });

    await completeTaskSpace(name, { keep: false });
    cliLog(JSON.stringify({ arrowReadText, arrowWithArg, legacyThisForm }));
  `;
  const result = runScript(script);
  const payload = lastJsonLine(result.stderr);
  assert.equal(payload.arrowReadText, "Example Domain", "arrow (el)=>el.textContent must read the element");
  assert.equal(payload.arrowWithArg, "H1", "arrow (el, prop)=>el[prop] must forward args after el");
  assert.equal(payload.legacyThisForm, "H1", "legacy function(){return this.tagName} must remain bound to el");
});
