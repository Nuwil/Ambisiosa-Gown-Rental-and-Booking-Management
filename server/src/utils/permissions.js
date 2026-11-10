/** Staff access areas. The owner always has all of them; renters/admin have none. */
export const PERMISSIONS = ['inventory', 'customers', 'transactions'];
export const parsePermissions = (csv) => (csv ? csv.split(',').filter((p) => PERMISSIONS.includes(p)) : []);
export const serializePermissions = (list) => PERMISSIONS.filter((p) => list.includes(p)).join(',');
export const permissionsFor = (user) => (user.role === 'owner' ? [...PERMISSIONS] : user.role === 'staff' ? parsePermissions(user.staff_permissions) : []);
