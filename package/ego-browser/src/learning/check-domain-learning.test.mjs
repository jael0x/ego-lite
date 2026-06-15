import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  urlHostname,
  siteSkillsForUrl,
} from "../../dist/src/learning/check-domain-learning.js";
import { loadLearnedContext } from "../../dist/src/learning/index.js";

function makeRoot(sites) {
  const root = mkdtempSync(join(tmpdir(), "ego-learn-"));
  for (const [dir, manifest] of Object.entries(sites)) {
    const siteDir = join(root, dir);
    mkdirSync(join(siteDir, "notes"), { recursive: true });
    writeFileSync(
      join(siteDir, "manifest.json"),
      typeof manifest === "string" ? manifest : JSON.stringify(manifest),
    );
  }
  return root;
}

test("urlHostname extracts a lowercased host from many URL shapes", () => {
  assert.equal(urlHostname("https://GitHub.com/foo/bar"), "github.com");
  assert.equal(urlHostname("github.com"), "github.com"); // no scheme
  assert.equal(urlHostname("https://example.com."), "example.com"); // trailing dot
  assert.equal(urlHostname("sub.example.com/path?q=1"), "sub.example.com");
  assert.equal(urlHostname(""), "");
  assert.equal(urlHostname("::::"), "");
});

test("siteSkillsForUrl matches exact and wildcard domains, ignores others", async () => {
  const root = makeRoot({
    github: {
      id: "github",
      name: "GitHub",
      domains: ["github.com"],
      notes: [],
    },
    example: {
      id: "example",
      name: "Example",
      domains: ["*.example.com"],
      notes: [],
    },
  });
  try {
    const exact = await siteSkillsForUrl("https://github.com/x", { root });
    assert.equal(exact.length, 1);
    assert.equal(exact[0].id, "github");

    const wildcard = await siteSkillsForUrl("https://sub.example.com", {
      root,
    });
    assert.equal(wildcard.length, 1);
    assert.equal(wildcard[0].id, "example");

    // Bare apex does not match a "*." wildcard.
    assert.equal(
      (await siteSkillsForUrl("https://example.com", { root })).length,
      0,
    );
    assert.equal(
      (await siteSkillsForUrl("https://evil.com", { root })).length,
      0,
    );
    assert.deepEqual(await siteSkillsForUrl("", { root }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("siteSkillsForUrl skips a malformed manifest without throwing", async () => {
  const root = makeRoot({
    good: { id: "good", name: "Good", domains: ["good.com"], notes: [] },
    broken: "{ not valid json",
  });
  try {
    // The broken pack is skipped (surfaced on stderr); the good one still matches.
    const matches = await siteSkillsForUrl("https://good.com", { root });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, "good");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadLearnedContext returns a discriminated no-match shape", async () => {
  const root = makeRoot({
    github: {
      id: "github",
      name: "GitHub",
      domains: ["github.com"],
      notes: [],
    },
  });
  try {
    const miss = await loadLearnedContext("https://nowhere.test", { root });
    assert.equal(miss.exists, false);
    assert.equal(miss.siteId, null);
    assert.equal(miss.siteName, null);
    assert.deepEqual(miss.knowledge, []);
    assert.deepEqual(miss.tools, []);

    const hit = await loadLearnedContext("https://github.com/x", { root });
    assert.equal(hit.exists, true);
    assert.equal(hit.siteId, "github");
    assert.equal(hit.siteName, "GitHub");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
