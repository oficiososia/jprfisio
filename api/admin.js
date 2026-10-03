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
async function readBody(req, limit = 8192) {
  let raw = req.body;
  if (raw == null) {
    const chunks=[]; let size=0;
    for await (const chunk of req) { const bytes=Buffer.from(chunk);size+=bytes.length;if(size>limit)throw new Error('size');chunks.push(bytes); }
    raw=Buffer.concat(chunks);
  }
  if(typeof raw==='string'||Buffer.isBuffer(raw)||raw instanceof Uint8Array){if(Buffer.byteLength(raw)>limit)throw new Error('size');return JSON.parse(raw.toString());}
  if(Buffer.byteLength(JSON.stringify(raw))>limit)throw new Error('size');return raw;
}
async function github(path, options={}) {
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...options.headers};
  if(setting('GITHUB_CONTENT_TOKEN'))headers.Authorization=`Bearer ${setting('GITHUB_CONTENT_TOKEN')}`;
  const response=await fetch('https://api.github.com/repos/oficiososia/jprfisio/contents/'+path,{...options,headers,signal:AbortSignal.timeout(18000)});
  const data=await response.json();
  if(!response.ok){const error=new Error(response.status===409||response.status===422?'El contenido ha cambiado. Recarga antes de publicar.':'No se ha podido acceder a GitHub. Revisa el token y sus permisos de escritura.');error.status=response.status===409||response.status===422?409:502;throw error;}
  return data;
}
function validateContent(value){
  if(!value||!Array.isArray(value.testimonials)||value.testimonials.length<1||value.testimonials.length>20)throw new Error('Incluye entre 1 y 20 testimonios.');
  const testimonials=value.testimonials.map(item=>{if(typeof item?.author!=='string'||!item.author.trim()||item.author.length>120||typeof item.quote!=='string'||!item.quote.trim()||item.quote.length>2500)throw new Error('Revisa el nombre y el texto de cada testimonio.');return {author:item.author.trim(),quote:item.quote.trim()};});
  const photos={};
  for(const key of ['hero','aboutDesktop','aboutMobile','method','movement','training']){const item=value.photos?.[key]||(['method','movement','training'].includes(key)?value.photos?.hero:null);if(!item||typeof item.src!=='string'||!/^((hero\.jpg)|(media\/[a-f0-9]{32}\.(webp|png|jpg)))$/.test(item.src)||typeof item.alt!=='string'||item.alt.length>300)throw new Error('Revisa las imágenes y sus descripciones.');photos[key]={src:item.src,alt:item.alt.trim()};}
  return {testimonials,photos};
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const action = req.query?.action || 'session';
  const send = (status, data) => res.status(status).json(data);
  const configured = Boolean(setting('ADMIN_PASSWORD')) && setting('ADMIN_SESSION_SECRET')?.length >= 32;
  if (!configured) return send(503, { error: 'El acceso de administrador está pendiente de configuración.' });
  if (['content','publish','upload'].includes(action)) {
    if (!authenticated(req)) return send(401, {error:'Inicia sesión para editar la web.'});
    if(action==='content'&&req.method==='GET') {
      try {const file=await github('site-content.json?ref=main');return send(200,{content:JSON.parse(Buffer.from(file.content,'base64').toString('utf8')),revision:file.sha,canPublish:Boolean(setting('GITHUB_CONTENT_TOKEN'))});}
      catch(error){return send(error.status||502,{error:error.message});}
    }
    if(req.method!=='POST'||action==='content')return send(405,{error:'Método no permitido.'});
    const host=req.headers['x-forwarded-host']||req.headers.host;
    if(req.headers.origin!=='https://'+host)return send(403,{error:'Origen no permitido.'});
    if(!(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'Formato no permitido.'});
    if(!setting('GITHUB_CONTENT_TOKEN'))return send(503,{error:'Falta configurar GITHUB_CONTENT_TOKEN en Vercel para publicar los cambios.'});
    try {
      const body=await readBody(req,action==='upload'?3000000:70000);
      if(action==='upload') {
        if(typeof body.data!=='string'||!['image/webp','image/png','image/jpeg'].includes(body.type)||body.data.length>2800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.data))return send(400,{error:'Selecciona una imagen WebP, PNG o JPG de hasta 2 MB.'});
        const bytes=Buffer.from(body.data,'base64');
        const valid=body.type==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':body.type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
        if(!valid||bytes.length>2097152)return send(400,{error:'La imagen no tiene un formato válido o supera 2 MB.'});
        const ext={'image/webp':'webp','image/png':'png','image/jpeg':'jpg'}[body.type];const path='media/'+crypto.randomBytes(16).toString('hex')+'.'+ext;
        const result=await github(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'content: upload website photo',content:bytes.toString('base64'),branch:'main'})});
        return send(200,{src:path,commit:result.commit.sha});
      }
      if(typeof body.revision!=='string'||!/^[a-f0-9]{40}$/.test(body.revision))return send(400,{error:'Recarga el contenido antes de publicar.'});
      let content;try{content=validateContent(body.content);}catch(error){return send(400,{error:error.message});}
      const result=await github('site-content.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'content: publish website testimonials and photos',content:Buffer.from(JSON.stringify(content,null,2)+'\n').toString('base64'),sha:body.revision,branch:'main'})});
      return send(200,{revision:result.content.sha,commit:result.commit.sha,message:'Cambios guardados. Vercel iniciará el despliegue automáticamente.'});
    }catch(error){return send(error.message==='size'?413:error.status||400,{error:error.message==='size'?'La imagen o el contenido supera el tamaño permitido.':error.message});}
  }
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
    try {
      let raw = req.body;
      if (raw === undefined || raw === null) {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          const bytes = Buffer.from(chunk); size += bytes.length;
          if (size > 8192) return send(413, { error: 'Solicitud demasiado grande.' });
          chunks.push(bytes);
        }
        raw = Buffer.concat(chunks);
      }
      body = typeof raw === 'string' || Buffer.isBuffer(raw) || raw instanceof Uint8Array
        ? JSON.parse(raw.toString()) : raw;
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
        return send(400, { error: 'No se han recibido correctamente los datos del formulario.' });
      }
    } catch { return send(400, { error: 'No se ha podido leer el formulario de acceso.' }); }
    if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 1024 || !equal(body.username, username()) || !equal(body.password, setting('ADMIN_PASSWORD'))) return send(401, { error: 'Usuario o contraseña incorrectos.' });
    attempts.delete(ip);
    const payload = Buffer.from(JSON.stringify({ user: username(), exp: now + 8 * 60 * 60 * 1000, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
    res.setHeader('Set-Cookie', `${cookieName}=${payload}.${sign(payload)}; HttpOnly; Secure; SameSite=Strict; Path=/`);
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
      if (!result.ok) return { error: (result.status === 402 || result.status === 403) ? 'Este informe requiere permisos o un plan de Vercel que lo incluya.' : `Vercel no ha podido devolver este informe (HTTP ${result.status}).` };
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

