import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateLearning } from "../../dist/src/learning/validate-learning-format.js";

function makeSite(id, manifest, files = {}) {
  const root = mkdtempSync(join(tmpdir(), "ego-validate-"));
  const siteDir = join(root, id);
  mkdirSync(join(siteDir, "notes"), { recursive: true });
  writeFileSync(
    join(siteDir, "manifest.json"),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
  );
  for (const [rel, content] of Object.entries(files)) {
    const full = join(siteDir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return { root, siteDir };
}

function hasError(errors, substring) {
  return errors.some((e) => e.includes(substring));
}

test("validateLearning accepts a well-formed notes-only manifest", async () => {
  const { root, siteDir } = makeSite(
    "ok",
    { id: "ok", name: "OK", domains: ["ok.com"], notes: ["notes/guide.md"] },
    { "notes/guide.md": "# stable guidance\nUse css selectors." },
  );
  try {
    assert.deepEqual(await validateLearning(siteDir), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateLearning flags id/name/domain problems", async () => {
  const { root, siteDir } = makeSite("site", {
    id: "wrong-id",
    name: "   ",
    domains: ["bad/domain"],
    notes: [],
  });
  try {
    const errors = await validateLearning(siteDir);
    assert.ok(hasError(errors, "manifest id must match directory name"));
    assert.ok(hasError(errors, "name must be a non-empty string"));
    assert.ok(hasError(errors, "invalid domain"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateLearning rejects empty domains", async () => {
  const { root, siteDir } = makeSite("site", {
    id: "site",
    name: "Site",
    domains: [],
    notes: [],
  });
  try {
    assert.ok(
      hasError(await validateLearning(siteDir), "domains must not be empty"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateLearning rejects a path-traversal Node tool path", async () => {
  const { root, siteDir } = makeSite("site", {
    id: "site",
    name: "Site",
    domains: ["site.com"],
    notes: [],
    nodeTools: {
      grab: {
        description: "grab",
        path: "../escape.js",
        callable: "run",
        args: {},
        returns: { type: "string", description: "x" },
      },
    },
  });
  try {
    assert.ok(
      hasError(
        await validateLearning(siteDir),
        "path must be a relative tools/*.js path",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateLearning reports a note that is not under notes/*.md", async () => {
  const { root, siteDir } = makeSite("site", {
    id: "site",
    name: "Site",
    domains: ["site.com"],
    notes: ["../secrets.md"],
  });
  try {
    assert.ok(
      hasError(
        await validateLearning(siteDir),
        "notes must point to notes/*.md",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateLearning returns a single error for a non-object manifest", async () => {
  const { root, siteDir } = makeSite("site", "[1, 2, 3]");
  try {
    const errors = await validateLearning(siteDir);
    assert.equal(errors.length, 1);
    assert.ok(hasError(errors, "manifest.json must contain a JSON object"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
