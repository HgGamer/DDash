import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { ActiveSelection, Project, ProjectFolder, Worktree } from '@shared/types';
import type { JsonStore } from './store';
import { isGitRepo } from './git';

function normalizePath(p: string): string {
  return path.resolve(p);
}

export class ProjectRegistry {
  constructor(private readonly store: JsonStore) {}

  list(): Project[] {
    return [...this.store.get().projects].sort((a, b) => a.order - b.order);
  }

  findByPath(p: string): Project | undefined {
    const norm = normalizePath(p);
    return this.store.get().projects.find((proj) => normalizePath(proj.path) === norm);
  }

  async add(inputPath: string, name?: string): Promise<Project> {
    const resolvedPath = normalizePath(inputPath);
    const existing = this.findByPath(resolvedPath);
    if (existing) return existing;

    const displayName = (name ?? path.basename(resolvedPath)).trim() || path.basename(resolvedPath);
    const now = new Date().toISOString();
    let created!: Project;
    this.store.update((draft) => {
      const maxOrder = draft.projects.reduce((m, p) => Math.max(m, p.order), -1);
      created = {
        id: uuid(),
        name: displayName,
        path: resolvedPath,
        addedAt: now,
        lastOpenedAt: null,
        order: maxOrder + 1,
        worktrees: [],
      };
      draft.projects.push(created);
    });
    created.isGitRepo = await isGitRepo(created.path);
    return created;
  }

  remove(id: string): void {
    this.store.update((draft) => {
      draft.projects = draft.projects.filter((p) => p.id !== id);
      if (draft.lastActive?.projectId === id) draft.lastActive = null;
      // Re-pack order to keep it contiguous.
      draft.projects
        .sort((a, b) => a.order - b.order)
        .forEach((p, i) => {
          p.order = i;
        });
    });
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.store.update((draft) => {
      const proj = draft.projects.find((p) => p.id === id);
      if (proj) proj.name = trimmed;
    });
  }

  reorder(orderedIds: string[]): void {
    this.store.update((draft) => {
      const positions = new Map(orderedIds.map((id, i) => [id, i]));
      for (const proj of draft.projects) {
        const pos = positions.get(proj.id);
        if (pos !== undefined) proj.order = pos;
      }
      const missing = draft.projects.filter((p) => !positions.has(p.id));
      missing
        .sort((a, b) => a.order - b.order)
        .forEach((p, i) => {
          p.order = orderedIds.length + i;
        });
    });
  }

  setLastActive(active: ActiveSelection | null): void {
    this.store.update((draft) => {
      draft.lastActive = active;
      if (active) {
        const proj = draft.projects.find((p) => p.id === active.projectId);
        if (proj) {
          const now = new Date().toISOString();
          proj.lastOpenedAt = now;
          if (active.worktreeId) {
            const wt = proj.worktrees.find((w) => w.id === active.worktreeId);
            if (wt) wt.lastOpenedAt = now;
          }
        }
      }
    });
  }

  getLastActive(): ActiveSelection | null {
    return this.store.get().lastActive;
  }

  getById(id: string): Project | undefined {
    return this.store.get().projects.find((p) => p.id === id);
  }

  setWorktreesCollapsed(id: string, collapsed: boolean): void {
    this.store.update((draft) => {
      const proj = draft.projects.find((p) => p.id === id);
      if (proj) proj.worktreesCollapsed = collapsed;
    });
  }

  // Folders — flat, one-level grouping of projects in the sidebar. -----------

  listFolders(): ProjectFolder[] {
    return [...(this.store.get().folders ?? [])].sort((a, b) => a.order - b.order);
  }

  createFolder(name: string): ProjectFolder {
    const trimmed = name.trim() || 'New folder';
    let created!: ProjectFolder;
    this.store.update((draft) => {
      if (!Array.isArray(draft.folders)) draft.folders = [];
      const maxOrder = draft.folders.reduce((m, f) => Math.max(m, f.order), -1);
      created = { id: uuid(), name: trimmed, order: maxOrder + 1 };
      draft.folders.push(created);
    });
    return created;
  }

  renameFolder(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.store.update((draft) => {
      const folder = draft.folders?.find((f) => f.id === id);
      if (folder) folder.name = trimmed;
    });
  }

  removeFolder(id: string): void {
    this.store.update((draft) => {
      draft.folders = (draft.folders ?? []).filter((f) => f.id !== id);
      // Orphaned projects fall back to the ungrouped root.
      for (const proj of draft.projects) {
        if (proj.folderId === id) proj.folderId = null;
      }
    });
  }

  setFolderCollapsed(id: string, collapsed: boolean): void {
    this.store.update((draft) => {
      const folder = draft.folders?.find((f) => f.id === id);
      if (folder) folder.collapsed = collapsed;
    });
  }

  reorderFolders(orderedIds: string[]): void {
    this.store.update((draft) => {
      const positions = new Map(orderedIds.map((id, i) => [id, i]));
      for (const folder of draft.folders ?? []) {
        const pos = positions.get(folder.id);
        if (pos !== undefined) folder.order = pos;
      }
    });
  }

  /** File a project under a folder (or null to move it back to the root). */
  setProjectFolder(projectId: string, folderId: string | null): void {
    this.store.update((draft) => {
      const proj = draft.projects.find((p) => p.id === projectId);
      if (!proj) return;
      // Ignore unknown folder ids so a stale drop can't strand the project.
      if (folderId && !draft.folders?.some((f) => f.id === folderId)) return;
      proj.folderId = folderId;
    });
  }

  /** Push a branch onto a project's recently-used list: dedup to the front,
   *  most-recent first, capped at five entries. */
  pushRecentBranch(id: string, branch: string): void {
    const trimmed = branch.trim();
    if (!trimmed) return;
    this.store.update((draft) => {
      const proj = draft.projects.find((p) => p.id === id);
      if (!proj) return;
      const prev = Array.isArray(proj.recentBranches) ? proj.recentBranches : [];
      proj.recentBranches = [trimmed, ...prev.filter((b) => b !== trimmed)].slice(0, 5);
    });
  }

  async refreshGitMeta(): Promise<void> {
    for (const proj of this.store.get().projects) {
      proj.isGitRepo = await isGitRepo(proj.path);
    }
  }

  addWorktree(projectId: string, opts: { branch: string; path: string }): Worktree {
    let created!: Worktree;
    this.store.update((draft) => {
      const proj = draft.projects.find((p) => p.id === projectId);
      if (!proj) throw new Error(`project ${projectId} not found`);
      const maxOrder = proj.worktrees.reduce((m, w) => Math.max(m, w.order), -1);
      created = {
        id: uuid(),
        branch: opts.branch,
        path: opts.path,
        addedAt: new Date().toISOString(),
        lastOpenedAt: null,
        order: maxOrder + 1,
      };
      proj.worktrees.push(created);
    });
    return created;
  }

  removeWorktreeFromRegistry(projectId: string, worktreeId: string): void {
    this.store.update((draft) => {
      const proj = draft.projects.find((p) => p.id === projectId);
      if (!proj) return;
      proj.worktrees = proj.worktrees.filter((w) => w.id !== worktreeId);
      if (
        draft.lastActive?.projectId === projectId &&
        draft.lastActive?.worktreeId === worktreeId
      ) {
        draft.lastActive = { projectId, worktreeId: null };
      }
    });
  }

  findWorktree(projectId: string, worktreeId: string): Worktree | undefined {
    return this.getById(projectId)?.worktrees.find((w) => w.id === worktreeId);
  }

  setWorktreeStatus(projectId: string, worktreeId: string, status: 'missing' | undefined): void {
    const proj = this.getById(projectId);
    if (!proj) return;
    const wt = proj.worktrees.find((w) => w.id === worktreeId);
    if (!wt) return;
    if (status) wt.status = status;
    else delete wt.status;
  }
}
