import type { Role } from '../validation';
export type Permission = 'dashboard.read' | 'memberships.read' | 'audit.read' | 'settings.read' | 'settings.write' | 'ai.draft' | 'ai.configure';
const grants: Partial<Record<Role, readonly Permission[]>> = {
  management: ['dashboard.read', 'memberships.read', 'audit.read', 'settings.read', 'ai.draft'],
  principal: ['dashboard.read', 'memberships.read', 'audit.read', 'settings.read', 'settings.write', 'ai.draft', 'ai.configure'],
  admin: ['dashboard.read', 'memberships.read', 'settings.read', 'settings.write', 'ai.draft', 'ai.configure'],
  hod: ['dashboard.read', 'settings.read', 'ai.draft'],
  teacher: ['dashboard.read', 'settings.read', 'ai.draft'],
  accounts: ['dashboard.read', 'settings.read', 'ai.draft'],
  parent: ['dashboard.read', 'settings.read'],
  student: []
};
export function allowed(role: string, permission: string): boolean {
  return permissions(role as Role).includes(permission as Permission);
}
const extraStaff=['incharge','vicePrincipal','examCoordinator','admissionsOfficer','hr','librarian','transportManager','driver','busAttendant','hostelWarden','inventoryManager','nurse','counsellor','security','auditor','groupAdmin','applicantParent','alumni'];
export function permissions(role: Role): readonly Permission[] { return grants[role]??(extraStaff.includes(role)?['dashboard.read','settings.read']:[]); }
