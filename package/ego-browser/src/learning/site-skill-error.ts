/**
 * Typed error for the site-skill (learning) subsystem. Callers branch on the
 * stable `code` rather than matching against the human-readable message, which
 * may change between builds — mirroring the ego-errors.ts pattern used for the
 * native bridge.
 */

export const SITE_SKILL_ERROR_CODES = [
  "SITE_SKILL_NOT_FOUND",
  "TOOL_NOT_DECLARED",
  "TOOL_CALLABLE_MISSING",
  "TOOL_CALLABLE_NOT_FOUND",
  "TOOL_PATH_INVALID",
] as const;

export type SiteSkillErrorCode = (typeof SITE_SKILL_ERROR_CODES)[number];

export class SiteSkillError extends Error {
  code: SiteSkillErrorCode;
  constructor(code: SiteSkillErrorCode, message: string) {
    super(message);
    this.name = "SiteSkillError";
    this.code = code;
  }
}
