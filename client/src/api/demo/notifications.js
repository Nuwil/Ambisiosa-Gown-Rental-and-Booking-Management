import { authenticate, mount } from './router.js';
import { getDb } from './store.js';
import { array, int, object, parse } from './validate.js';
import { stamp } from './util.js';

const readSchema = object({ ids: array(int(), { max: 100, optional: true }) });

export const routes = mount('/notifications', [authenticate], [
  ['GET', '/', [], ({ user }) => {
    const mine = getDb().notifications.filter((n) => n.user_id === user.id).sort((a, b) => b.id - a.id);
    return { data: mine.slice(0, 50).map(({ id, type, message, ref_id, read_at, created_at }) => ({ id, type, message, ref_id, read_at, created_at })), unread: mine.filter((n) => !n.read_at).length };
  }],
  ['POST', '/read', [], ({ user, body }) => {
    const { ids } = parse(readSchema, body);
    getDb().notifications.filter((n) => n.user_id === user.id && !n.read_at && (!ids?.length || ids.includes(n.id))).forEach((n) => { n.read_at = stamp(); });
    return { ok: true };
  }],
]);
