import test from "node:test";
import assert from "node:assert/strict";

import { resolveElementCenter, ElementResolutionError } from "../dist/src/element-resolver.js";
import { RefMap } from "../dist/src/ref-map.js";

class FakeCDP {
  constructor(handler) {
    this.calls = [];
    this.handler = handler;
  }

  async sendRaw(method, params = {}, sessionId = undefined) {
    this.calls.push([method, params, sessionId]);
    return this.handler(method, params, sessionId);
  }
}

const AX_TREE = {
  nodes: [
    { role: { value: "button" }, name: { value: "ok" }, backendDOMNodeId: 100 }
  ]
};

test("resolveElementCenter computes the center from a valid box model", async () => {
  const refMap = new RefMap();
  refMap.add("5", 100, "button", "ok");
  const cdp = new FakeCDP(async (method) => {
    if (method === "DOM.getBoxModel") {
      return { model: { content: [0, 0, 10, 0, 10, 10, 0, 10] } };
    }
    return {};
  });
  const point = await resolveElementCenter(cdp, undefined, refMap, "@5");
  assert.equal(point.x, 5);
  assert.equal(point.y, 5);
});

test("degenerate box model throws transient instead of returning (0,0)", async () => {
  // Regression: boxModelCenter used to return {x:0,y:0} for a missing content
  // quad, which made callers click the top-left viewport corner.
  const refMap = new RefMap();
  refMap.add("5", 100, "button", "ok");
  const cdp = new FakeCDP(async (method) => {
    if (method === "DOM.getBoxModel") {
      return { model: { content: [] } };
    }
    if (method === "Accessibility.getFullAXTree") {
      return AX_TREE;
    }
    return {};
  });
  await assert.rejects(
    () => resolveElementCenter(cdp, undefined, refMap, "@5"),
    (error) => {
      assert.ok(error instanceof ElementResolutionError);
      assert.equal(error.kind, "transient");
      assert.match(error.message, /no box model/);
      return true;
    }
  );
});

test("role locator with degenerate box model throws transient", async () => {
  const cdp = new FakeCDP(async (method) => {
    if (method === "Accessibility.getFullAXTree") {
      return AX_TREE;
    }
    if (method === "DOM.getBoxModel") {
      return { model: {} };
    }
    return {};
  });
  await assert.rejects(
    () => resolveElementCenter(cdp, undefined, new RefMap(), 'loc=role:button[name="ok"]'),
    (error) => {
      assert.ok(error instanceof ElementResolutionError);
      assert.equal(error.kind, "transient");
      return true;
    }
  );
});
