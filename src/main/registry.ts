import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { ActiveSelection, Project, Todo, Worktree } from '@shared/types';
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
        todos: [],
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

  listTodos(projectId: string): Todo[] {
    const proj = this.getById(projectId);
    return proj?.todos ?? [];
  }

  addTodo(projectId: string, text: string): Todo | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    let created: Todo | null = null;
    this.store.update((draft) => {
      const proj = draft.projects.find((p) => p.id === projectId);
      if (!proj) return;
      if (!Array.isArray(proj.todos)) proj.todos = [];
      created = {
        id: uuid(),
        text: trimmed,
        done: false,
        createdAt: new Date().toISOString(),
      };
      proj.todos.push(created);
    });
    return created;
  }

  updateTodo(
    projectId: string,
    todoId: string,
    patch: Partial<Pick<Todo, 'text' | 'done'>>,
  ): Todo | null {
    let updated: Todo | null = null;
    this.store.update((draft) => {
      const proj = draft.projects.find((p) => p.id === projectId);
      if (!proj || !Array.isArray(proj.todos)) return;
      const todo = proj.todos.find((t) => t.id === todoId);
      if (!todo) return;
      if (typeof patch.text === 'string') {
        const trimmed = patch.text.trim();
        if (trimmed) todo.text = trimmed;
      }
      if (typeof patch.done === 'boolean') todo.done = patch.done;
      updated = { ...todo };
    });
    return updated;
  }

  removeTodo(projectId: string, todoId: string): void {
    this.store.update((draft) => {
      const proj = draft.projects.find((p) => p.id === projectId);
      if (!proj || !Array.isArray(proj.todos)) return;
      proj.todos = proj.todos.filter((t) => t.id !== todoId);
    });
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
