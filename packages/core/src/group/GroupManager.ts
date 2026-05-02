import type { GroupConfig } from '../types/index.js';

export class GroupManager {
  private readonly groups = new Map<string, GroupConfig>();

  add(group: GroupConfig): void {
    this.groups.set(group.wid, group);
  }

  find(wid: string): GroupConfig | undefined {
    return this.groups.get(wid);
  }

  getAll(): GroupConfig[] {
    return [...this.groups.values()];
  }
}
