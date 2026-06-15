import test from "node:test";
import assert from "node:assert/strict";

import { setOverrides } from "../../dist/src/state.js";
import { pressKey } from "../../dist/src/driver/keyboard.js";

test("pressKey maps Command+A to the selectAll editing command", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return {};
    },
  });
  try {
    await pressKey("a", 4);
  } finally {
    restore();
  }

  // Behavior under test: Command+A dispatches a keyDown carrying the selectAll
  // editing command (with the Meta modifier) followed by a keyUp. Exact key
  // encoding (vk codes, text) is covered elsewhere and intentionally not pinned
  // here so this test does not break on incidental encoding changes.
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "Input.dispatchKeyEvent");
  assert.equal(calls[0].params.type, "keyDown");
  assert.equal(calls[0].params.modifiers, 4);
  assert.deepEqual(calls[0].params.commands, ["selectAll"]);
  assert.equal(calls[1].params.type, "keyUp");
});

test("pressKey maps Control+A to the selectAll editing command", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return {};
    },
  });
  try {
    await pressKey("a", 2);
  } finally {
    restore();
  }

  assert.deepEqual(calls[0].params.commands, ["selectAll"]);
});

test("pressKey does not map modified Command+A variants to selectAll", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return {};
    },
  });
  try {
    await pressKey("a", 12);
  } finally {
    restore();
  }

  assert.equal(calls[0].params.commands, undefined);
});

test("pressKey leaves ordinary printable keys unchanged", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return {};
    },
  });
  try {
    await pressKey("x");
  } finally {
    restore();
  }

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params, {
    type: "keyDown",
    key: "x",
    code: "KeyX",
    modifiers: 0,
    windowsVirtualKeyCode: 88,
    nativeVirtualKeyCode: 88,
    text: "x",
    unmodifiedText: "x",
  });
  assert.deepEqual(calls[1].params, {
    type: "keyUp",
    key: "x",
    code: "KeyX",
    modifiers: 0,
    windowsVirtualKeyCode: 88,
    nativeVirtualKeyCode: 88,
  });
});
