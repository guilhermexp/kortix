import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ID } from "@repo/lib/constants";
import { normalizeSelectedProject } from "./project-selection";

describe("normalizeSelectedProject", () => {
  it("normalizes legacy default to DEFAULT_PROJECT_ID", () => {
    expect(normalizeSelectedProject("default")).toBe(DEFAULT_PROJECT_ID);
  });

  it("normalizes empty values to DEFAULT_PROJECT_ID", () => {
    expect(normalizeSelectedProject("")).toBe(DEFAULT_PROJECT_ID);
    expect(normalizeSelectedProject(null)).toBe(DEFAULT_PROJECT_ID);
    expect(normalizeSelectedProject(undefined)).toBe(DEFAULT_PROJECT_ID);
  });

  it("keeps explicit container tags unchanged", () => {
    expect(normalizeSelectedProject("sm_project_abc")).toBe("sm_project_abc");
  });
});
