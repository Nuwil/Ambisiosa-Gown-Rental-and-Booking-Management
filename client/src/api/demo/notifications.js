import { authenticate, mount } from './router.js';
import { getDb } from './store.js';
import { array, int, object, parse } from './validate.js';
import { stamp } from './util.js';

const readSchema = object({ ids: array(int(), { max: 100, optional: true }) });
const idsSchema = object({ ids: array(int(), { min: 1, max: 200 }) });

export const routes = mount('/notifications', [authenticate], [
  ['GET', '/', [], ({ user, query }) => {
    const mine = getDb().notifications.filter((n) => n.user_id === user.id).sort((a, b) => b.id - a.id);
    const limit = Math.min(Math.max(Number(query?.limit) || 50, 1), 200);
    return { data: mine.slice(0, limit).map(({ id, type, message, ref_id, read_at, created_at }) => ({ id, type, message, ref_id, read_at, created_at })), unread: mine.filter((n) => !n.read_at).length };
  }],
  ['POST', '/read', [], ({ user, body }) => {
    const { ids } = parse(readSchema, body);
    getDb().notifications.filter((n) => n.user_id === user.id && !n.read_at && (!ids?.length || ids.includes(n.id))).forEach((n) => { n.read_at = stamp(); });
    return { ok: true };
  }],
  ['POST', '/unread', [], ({ user, body }) => {
    const { ids } = parse(idsSchema, body);
    getDb().notifications.filter((n) => n.user_id === user.id && ids.includes(n.id)).forEach((n) => { n.read_at = null; });
    return { ok: true };
  }],
  ['POST', '/delete', [], ({ user, body }) => {
    const { ids } = parse(idsSchema, body);
    const db = getDb();
    db.notifications = db.notifications.filter((n) => !(n.user_id === user.id && ids.includes(n.id)));
    return { ok: true };
  }],
]);
