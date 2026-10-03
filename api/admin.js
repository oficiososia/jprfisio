const crypto = require('node:crypto');
const cookieName = '__Host-jpr_admin';
function setting(name) {
  let value = (process.env[name] || '').trim();
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
  return value;
}
const username = () => setting('ADMIN_USERNAME') || 'jpr';
const equal = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(); const y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };
const sign = value => crypto.createHmac('sha256', setting('ADMIN_SESSION_SECRET')).update(value).digest('base64url');
function authenticated(req) {
  if (!setting('ADMIN_SESSION_SECRET')) return false;
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='));
  if (!cookie) return false;
  const [payload, signature] = cookie.slice(cookieName.length + 1).split('.');
  if (!payload || !signature || !equal(sign(payload), signature)) return false;
  try { const session = JSON.parse(Buffer.from(payload, 'base64url')); return session.exp > Date.now() && session.user === username(); } catch { return false; }
}
const attempts = new Map();
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const action = req.query?.action || 'session';
  const send = (status, data) => res.status(status).json(data);
  const configured = Boolean(setting('ADMIN_PASSWORD')) && setting('ADMIN_SESSION_SECRET')?.length >= 32;
  if (!configured) return send(503, { error: 'El acceso de administrador está pendiente de configuración.' });
  if (req.method === 'POST') {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (!req.headers.origin || req.headers.origin !== 'https://' + host) return send(403, { error: 'Origen no permitido.' });
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(415, { error: 'Formato no permitido.' });
    if (action === 'logout') { res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`); return send(200, { ok: true }); }
    if (action !== 'login') return send(405, { error: 'Método no permitido.' });
    const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    if (attempts.size > 10000) attempts.clear();
    let attempt = attempts.get(ip);
    if (!attempt || attempt.until < now) { attempt = { count: 0, until: now + 15 * 60 * 1000 }; attempts.set(ip, attempt); }
    if (++attempt.count > 5) { res.setHeader('Retry-After', '900'); return send(429, { error: 'Demasiados intentos. Inténtalo dentro de 15 minutos.' }); }
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch { return send(400, { error: 'Solicitud inválida.' }); }
    if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 1024 || !equal(body.username, username()) || !equal(body.password, setting('ADMIN_PASSWORD'))) return send(401, { error: 'Usuario o contraseña incorrectos.' });
    attempts.delete(ip);
    const payload = Buffer.from(JSON.stringify({ user: username(), exp: now + 8 * 60 * 60 * 1000, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
    res.setHeader('Set-Cookie', `${cookieName}=${payload}.${sign(payload)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
    return send(200, { ok: true });
  }
  if (req.method !== 'GET') return send(405, { error: 'Método no permitido.' });
  if (!authenticated(req)) return send(401, { error: 'Inicia sesión para consultar las estadísticas.' });
  if (action === 'session') return send(200, { ok: true });
  if (action !== 'stats') return send(404, { error: 'Ruta no encontrada.' });
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID;
  if (!token || !projectId) return send(503, { error: 'La conexión con las estadísticas de Vercel está pendiente de configuración.' });
  const days = [1, 7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  const until = new Date(); const since = new Date(until.getTime() - days * 86400000);
  async function query(dataset, by) {
    const url = new URL(`https://api.vercel.com/v1/query/web-analytics/${dataset}/aggregate`);
    url.searchParams.set('projectId', projectId);
    if (process.env.VERCEL_ANALYTICS_TEAM_ID) url.searchParams.set('teamId', process.env.VERCEL_ANALYTICS_TEAM_ID);
    url.searchParams.set('since', since.toISOString()); url.searchParams.set('until', until.toISOString());
    url.searchParams.set('by', by); url.searchParams.set('limit', '20');
    try {
      const result = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
      if (!result.ok) return { error: result.status === 403 ? 'Vercel no permite consultar este informe con los permisos o el plan actuales.' : `Vercel no ha podido devolver este informe (HTTP ${result.status}).` };
      const json = await result.json();
      return { data: json.data };
    } catch { return { error: 'No se ha podido conectar con Vercel. Vuelve a intentarlo.' }; }
  }
  const dimensions = ['day', 'requestPath', 'country', 'referrerHostname', 'deviceType', 'browserName', 'osName', 'utmSource', 'utmMedium', 'utmCampaign'];
  const results = await Promise.all(dimensions.map(by => query('visits', by)));
  const reports = Object.fromEntries(dimensions.map((by, i) => [by, results[i]]));
  reports.events = await query('events', 'eventName');
  return send(200, { since: since.toISOString(), until: until.toISOString(), reports });
};
