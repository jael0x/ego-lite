import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import {
  iterLearningDirs,
  learningEntry,
  learningsRoot,
  loadLearningManifest,
  siteSkillsForUrl,
  siteSkillsRoot,
  urlHostname,
  LearningEntry,
  LearningManifest,
  LearningOptions,
  LearnedContext,
  LearnedKnowledgeNote,
  LearnedToolSignature,
  NodeToolSchema,
  ToolSchema,
} from "./check-domain-learning.js";
import {
  validateLearning,
  validateLearnings,
  validateSiteSkills,
} from "./validate-learning-format.js";
import { ENV, MANIFEST_TOOL_KEY, TOOL_TYPE } from "../constants.js";
import { SiteSkillError } from "./site-skill-error.js";

export {
  checkDomainLearningExists,
  checkLearningExists,
  iterLearningDirs,
  learningsRoot,
  pathExists,
  siteSkillsForUrl,
  siteSkillsRoot,
} from "./check-domain-learning.js";
export {
  validateLearning,
  validateLearnings,
  validateSiteSkills,
} from "./validate-learning-format.js";

/**
 * Load learned context for a given URL.
 * Returns site knowledge (notes content, available tools, selector hints).
 */
export async function loadLearnedContext(
  url: string,
  options: LearningOptions = {},
): Promise<LearnedContext> {
  const matches = await siteSkillsForUrl(url, options);
  if (matches.length === 0) {
    return {
      exists: false,
      siteId: null,
      siteName: null,
      domain: urlHostname(url),
      knowledge: [],
      tools: [],
    };
  }

  const toolSignatures: LearnedToolSignature[] = [];
  const knowledgeNotes: LearnedKnowledgeNote[] = [];

  for (const entry of matches) {
    const siteId = entry.id;

    for (const notePath of entry.notes) {
      if (!isLearningNotePath(entry.path, notePath)) {
        continue;
      }
      let content: string;
      try {
        content = await readFile(notePath, "utf8");
      } catch (error) {
        // Surface the unreadable note instead of silently dropping it.
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[ego-browser] skipping note ${notePath}: ${message}\n`,
        );
        continue;
      }
      const fileName = notePath.split(/[\\/]/).pop() || "";
      knowledgeNotes.push({ siteId, fileName, content });
    }

    // Build tool signatures with usage examples
    const nodeTools: Record<string, NodeToolSchema> = entry.nodeTools || {};
    for (const [toolName, schema] of Object.entries(nodeTools)) {
      toolSignatures.push({
        siteId,
        toolName,
        toolType: TOOL_TYPE.node,
        description: schema.description || "",
        args: schema.args || {},
        example: `await runSiteTool("${siteId}", "${toolName}", { ... })`,
      });
    }

    const browserTools: Record<string, ToolSchema> = entry.browserTools || {};
    for (const [toolName, schema] of Object.entries(browserTools)) {
      toolSignatures.push({
        siteId,
        toolName,
        toolType: TOOL_TYPE.browser,
        description: schema.description || "",
        args: schema.args || {},
        example: `await runSiteBrowserTool("${siteId}", "${toolName}", { ... })`,
      });
    }
  }

  return {
    exists: true,
    siteId: matches[0].id,
    siteName: matches[0].name,
    domain: urlHostname(url),
    knowledge: knowledgeNotes,
    tools: toolSignatures,
  };
}

function isLearningNotePath(siteDir: string, notePath: string) {
  const relativePath = relative(resolve(siteDir), resolve(notePath));
  const parts = relativePath.split(/[\\/]/);
  return (
    parts.length === 2 &&
    parts[0] === "notes" &&
    parts[1].endsWith(".md") &&
    parts.every((part) => part && part !== "." && part !== "..")
  );
}

export async function findSiteSkill(
  siteId: string,
  options: LearningOptions = {},
): Promise<{ siteDir: string; manifest: LearningManifest }> {
  const root = options.root || siteSkillsRoot(options.agentWorkspace);
  for (const siteDir of await iterLearningDirs(root)) {
    const manifest = await loadLearningManifest(siteDir);
    if (manifest.id === siteId) {
      return { siteDir, manifest };
    }
  }
  throw siteSkillNotFoundError(siteId, root);
}

export async function runNodeSiteTool(
  siteId: string,
  toolName: string,
  args: Record<string, unknown> = {},
  ctx: unknown,
  options: LearningOptions = {},
) {
  const { siteDir, manifest } = await findSiteSkill(siteId, options);
  const schema = toolSchemas(manifest, MANIFEST_TOOL_KEY.node)[toolName];
  if (!schema || typeof schema !== "object") {
    throw new SiteSkillError(
      "TOOL_NOT_DECLARED",
      `Node tool ${JSON.stringify(toolName)} is not declared by site skill ${JSON.stringify(siteId)}`,
    );
  }
  const toolPath = relativeSitePath(siteDir, schema.path, "Node tool");
  const module = await import(
    `${pathToFileURL(toolPath).href}?t=${Date.now()}`
  );
  const callableName = schema.callable;
  if (typeof callableName !== "string" || !callableName.trim()) {
    throw new SiteSkillError(
      "TOOL_CALLABLE_MISSING",
      `Node tool ${JSON.stringify(toolName)} must declare a callable`,
    );
  }
  const tool = module[callableName];
  if (typeof tool !== "function") {
    throw new SiteSkillError(
      "TOOL_CALLABLE_NOT_FOUND",
      `site skill ${JSON.stringify(siteId)} is missing Node callable ${JSON.stringify(callableName)}`,
    );
  }
  return tool(ctx, args || {});
}

export async function loadBrowserToolSource(
  siteId: string,
  toolName: string,
  options: LearningOptions = {},
) {
  const { siteDir, manifest } = await findSiteSkill(siteId, options);
  const schema = toolSchemas(manifest, MANIFEST_TOOL_KEY.browser)[toolName];
  if (!schema || typeof schema !== "object") {
    throw new SiteSkillError(
      "TOOL_NOT_DECLARED",
      `browser tool ${JSON.stringify(toolName)} is not declared by site skill ${JSON.stringify(siteId)}`,
    );
  }
  const toolPath = relativeSitePath(siteDir, schema.path, "browser tool");
  return readFile(toolPath, "utf8");
}

export function wrapBrowserTool(
  source: string,
  args: Record<string, unknown> = {},
) {
  return `(async () => { const __egoBrowserTool = ${source}; return await __egoBrowserTool(${JSON.stringify(args || {})}); })()`;
}

export { learningEntry };

function siteSkillNotFoundError(siteId: string, searchedRoot: string) {
  const workspace = process.env[ENV.agentWorkspace] || "unset";
  const lines = [
    `site skill not found: ${JSON.stringify(siteId)}`,
    `  searched: ${searchedRoot}`,
    `  EGO_BROWSER_AGENT_WORKSPACE: ${workspace}`,
    `  hint: ensure your write path begins with the searched root above`,
  ];
  return new SiteSkillError("SITE_SKILL_NOT_FOUND", lines.join("\n"));
}

function toolSchemas(
  manifest: LearningManifest,
  key: typeof MANIFEST_TOOL_KEY.node,
): Record<string, NodeToolSchema>;
function toolSchemas(
  manifest: LearningManifest,
  key: typeof MANIFEST_TOOL_KEY.browser,
): Record<string, ToolSchema>;
function toolSchemas(
  manifest: LearningManifest,
  key: typeof MANIFEST_TOOL_KEY.node | typeof MANIFEST_TOOL_KEY.browser,
): Record<string, NodeToolSchema | ToolSchema> {
  const value = manifest[key] || {};
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
}

function relativeSitePath(
  siteDir: string,
  manifestPath: string,
  label: string,
) {
  if (typeof manifestPath !== "string" || !manifestPath.trim()) {
    throw new SiteSkillError(
      "TOOL_PATH_INVALID",
      `${label} path must be a non-empty relative path`,
    );
  }
  if (
    manifestPath.includes("\\") ||
    isAbsolute(manifestPath) ||
    manifestPath.split("/").includes("..")
  ) {
    throw new SiteSkillError(
      "TOOL_PATH_INVALID",
      `${label} path must be relative to the site skill directory`,
    );
  }
  const resolved = resolve(siteDir, manifestPath);
  const siteRoot = resolve(siteDir);
  if (resolved !== siteRoot && !resolved.startsWith(`${siteRoot}/`)) {
    throw new SiteSkillError(
      "TOOL_PATH_INVALID",
      `${label} path must stay inside the site skill directory`,
    );
  }
  return resolved;
}
