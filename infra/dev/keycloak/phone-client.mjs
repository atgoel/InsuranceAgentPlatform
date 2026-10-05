// Adds an origin to the iap-web client (redirect URIs, web origins, post-logout URIs). Idempotent.
//   node phone-client.mjs --host 192.168.1.20 [--dry-run]          phone: origin https://<host>
//   node phone-client.mjs --origin http://localhost:9080 [--dry-run]  any origin, e.g. a second stack's web port
// Env: KC_ADMIN_URL (default http://localhost:8180), KC_ADMIN_USER / KC_ADMIN_PASSWORD (default admin / admin), KC_REALM (iap).
// Works on an imported realm and on one persisted in the iap-kc-data volume: it only reads and updates the live client.
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const hostIndex = args.indexOf('--host');
const originIndex = args.indexOf('--origin');
const host = hostIndex >= 0 ? args[hostIndex + 1] : process.env.IAP_PHONE_HOST;
const explicitOrigin = originIndex >= 0 ? args[originIndex + 1] : undefined;
const target = explicitOrigin ?? (host ? `https://${host}` : undefined);
if (!target || target.startsWith('--')) {
  process.stderr.write('usage: phone-client.mjs (--host <ip-or-name> | --origin <scheme://host[:port]>) [--dry-run]\n');
  process.exit(2);
}
const base = process.env.KC_ADMIN_URL ?? 'http://localhost:8180';
const realm = process.env.KC_REALM ?? 'iap';
const origin = target.replace(/\/+$/, '');

async function call(path, init) {
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res;
}

async function adminToken() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: process.env.KC_ADMIN_USER ?? 'admin',
    password: process.env.KC_ADMIN_PASSWORD ?? 'admin',
  });
  const res = await call('/realms/master/protocol/openid-connect/token', { method: 'POST', body });
  return (await res.json()).access_token;
}

function withEntry(list, entry) {
  return list.includes(entry) ? { list, added: false } : { list: [...list, entry], added: true };
}

const token = await adminToken();
const auth = { Authorization: `Bearer ${token}` };
const found = await (await call(`/admin/realms/${realm}/clients?clientId=iap-web`, { headers: auth })).json();
if (found.length !== 1) {
  throw new Error(`expected one client iap-web in realm ${realm}, found ${found.length}`);
}
const client = found[0];
const attributes = { ...(client.attributes ?? {}) };
const logoutUris = (attributes['post.logout.redirect.uris'] ?? '').split('##').filter((u) => u !== '');

const redirects = withEntry(client.redirectUris ?? [], `${origin}/*`);
const origins = withEntry(client.webOrigins ?? [], origin);
const logouts = withEntry(logoutUris, `${origin}/*`);
const changes = [];
if (redirects.added) changes.push(`redirectUris += ${origin}/*`);
if (origins.added) changes.push(`webOrigins += ${origin}`);
if (logouts.added) changes.push(`post.logout.redirect.uris += ${origin}/*`);

if (changes.length === 0) {
  process.stdout.write(`iap-web already allows ${origin}; nothing to change\n`);
} else {
  for (const change of changes) {
    process.stdout.write(`${dryRun ? 'would add' : 'add'}: ${change}\n`);
  }
  if (!dryRun) {
    attributes['post.logout.redirect.uris'] = logouts.list.join('##');
    const updated = { ...client, redirectUris: redirects.list, webOrigins: origins.list, attributes };
    const headers = { ...auth, 'Content-Type': 'application/json' };
    await call(`/admin/realms/${realm}/clients/${client.id}`, { method: 'PUT', headers, body: JSON.stringify(updated) });
  }
}
