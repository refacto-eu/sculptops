import type { Playbook } from "@/lib/db/schema";

export type SafePlaybook = Omit<Playbook, "gitToken"> & {
  hasGitToken: boolean;
};

export function safePlaybook<T extends { gitToken?: string | null }>(
  playbook: T
): Omit<T, "gitToken"> & { hasGitToken: boolean } {
  const { gitToken, ...rest } = playbook;
  return { ...rest, hasGitToken: !!gitToken };
}

export function safePlaybooks<T extends { gitToken?: string | null }>(
  playbooks: T[]
): Array<Omit<T, "gitToken"> & { hasGitToken: boolean }> {
  return playbooks.map(safePlaybook);
}
