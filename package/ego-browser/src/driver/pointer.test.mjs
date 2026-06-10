import test from "node:test";
import assert from "node:assert/strict";

import { setOverrides } from "../../dist/src/state.js";
import { scroll } from "../../dist/src/driver/pointer.js";

test("scroll defaults to scrolling down (positive deltaY, DOM wheel convention)", async () => {
  // Regression: the default used to be deltaY -300, which scrolls UP — CDP
  // negates wheel deltas internally, so the DOM convention (positive = down)
  // applies end to end. SKILL.md documents scroll({ dy: 900 }) as a downward
  // scroll, matching scrollBy / scrollToBottomUntil.
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params) {
      calls.push({ method, params });
      return {};
    }
  });
  try {
    await scroll();
  } finally {
    restore();
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "Input.dispatchMouseEvent");
  assert.equal(calls[0].params.deltaY, 300);
  assert.equal(calls[0].params.deltaX, 0);
});

test("scroll falls back to DOM scrolling when mouseWheel dispatch fails", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      if (method === "Input.dispatchMouseEvent") {
        throw new Error("CDP request timed out: Input.dispatchMouseEvent");
      }
      if (method === "Runtime.evaluate") {
        return { result: { value: { x: 0, y: 450 } } };
      }
      return {};
    }
  });
  try {
    const result = await scroll({ x: 50, y: 60, dx: 10, dy: 450 });
    assert.deepEqual(result, { x: 0, y: 450 });
  } finally {
    restore();
  }

  assert.equal(calls[0].method, "Input.dispatchMouseEvent");
  assert.deepEqual(calls[0].params, {
    type: "mouseWheel",
    x: 50,
    y: 60,
    deltaX: 10,
    deltaY: 450
  });
  assert.equal(calls[1].method, "Runtime.evaluate");
  assert.match(calls[1].params.expression, /window\.scrollBy/);
});
