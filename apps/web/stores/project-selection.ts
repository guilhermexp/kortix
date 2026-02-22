import { DEFAULT_PROJECT_ID } from "@repo/lib/constants";

export function normalizeSelectedProject(
  selectedProject: string | null | undefined,
): string {
  if (!selectedProject || selectedProject === "default") {
    return DEFAULT_PROJECT_ID;
  }
  return selectedProject;
}
