import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Project } from '@shared/types';
import type { JsonStore } from './store';

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

  add(inputPath: string, name?: string): Project {
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
      };
      draft.projects.push(created);
    });
    return created;
  }

  remove(id: string): void {
    this.store.update((draft) => {
      draft.projects = draft.projects.filter((p) => p.id !== id);
      if (draft.lastActiveProjectId === id) draft.lastActiveProjectId = null;
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
      // Any projects not in orderedIds keep their relative position at the end.
      const missing = draft.projects.filter((p) => !positions.has(p.id));
      missing
        .sort((a, b) => a.order - b.order)
        .forEach((p, i) => {
          p.order = orderedIds.length + i;
        });
    });
  }

  setLastActive(id: string | null): void {
    this.store.update((draft) => {
      draft.lastActiveProjectId = id;
      if (id) {
        const proj = draft.projects.find((p) => p.id === id);
        if (proj) proj.lastOpenedAt = new Date().toISOString();
      }
    });
  }

  getLastActive(): string | null {
    return this.store.get().lastActiveProjectId;
  }

  getById(id: string): Project | undefined {
    return this.store.get().projects.find((p) => p.id === id);
  }
}
