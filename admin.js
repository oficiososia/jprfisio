const login = document.querySelector('#login');
const dashboard = document.querySelector('#dashboard');
const form = document.querySelector('#login-form');
const message = document.querySelector('#login-message');
const status = document.querySelector('#status');
const reports = document.querySelector('#reports');
const names = { day: 'Evolución diaria', requestPath: 'Páginas', country: 'Países', referrerHostname: 'Procedencia de las visitas', deviceType: 'Dispositivos', browserName: 'Navegadores', osName: 'Sistemas operativos', utmSource: 'Fuentes de campaña', utmMedium: 'Medios de campaña', utmCampaign: 'Campañas', events: 'Eventos personalizados' };
async function api(action, body) {
  const response = await fetch(`/api/admin?action=${action}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'No se ha podido completar la solicitud.'); error.code = response.status; throw error; }
  return data;
}
function showLogin() { dashboard.hidden = true; login.hidden = false; reports.replaceChildren(); }
function cell(tag, text) { const el = document.createElement(tag); el.textContent = text; return el; }
async function load() {
  const refresh = document.querySelector('#refresh'); refresh.disabled = true;
  status.textContent = 'Consultando estadísticas…'; reports.replaceChildren();
  try {
    const data = await api('stats&days=' + document.querySelector('#days').value);
    for (const [key, report] of Object.entries(data.reports)) {
      const card = document.createElement('section'); card.className = 'card'; card.append(cell('h2', names[key] || key));
      if (report.error) card.append(cell('p', report.error));
      else if (!Array.isArray(report.data) || !report.data.length) card.append(cell('p', 'Todavía no hay datos para este periodo.'));
      else {
        const table = document.createElement('table'); const head = document.createElement('thead'); const tr = document.createElement('tr');
        ['Detalle', key === 'events' ? 'Eventos' : 'Vistas', 'Visitantes'].forEach(x => tr.append(cell('th', x))); head.append(tr); table.append(head);
        const tbody = document.createElement('tbody');
        for (const row of report.data) {
          const item = document.createElement('tr');
          let label = row[key === 'day' ? 'timestamp' : key === 'events' ? 'eventName' : key];
          if (key === 'day' && label) label = new Date(label).toLocaleDateString('es-ES');
          item.append(cell('td', label || 'Sin especificar'), cell('td', row.pageviews ?? row.count ?? '—'), cell('td', row.visitors ?? '—')); tbody.append(item);
        }
        table.append(tbody); card.append(table);
      }
      reports.append(card);
    }
    status.textContent = 'Actualizado a las ' + new Date().toLocaleTimeString('es-ES') + '. Los informes dependen de la retención y los permisos de tu plan.';
  } catch (error) { if (error.code === 401) { showLogin(); message.textContent = 'La sesión ha caducado.'; } else status.textContent = error.message; }
  finally { refresh.disabled = false; }
}
async function enter() { login.hidden = true; dashboard.hidden = false; await load(); }
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = form.querySelector('button'); button.disabled = true; message.textContent = '';
  try { const fields = new FormData(form); await api('login', { username: fields.get('username'), password: fields.get('password') }); form.reset(); await enter(); }
  catch (error) { message.textContent = error.message; } finally { button.disabled = false; }
});
document.querySelector('#logout').addEventListener('click', async () => { try { await api('logout', {}); showLogin(); } catch (error) { status.textContent = error.message; } });
document.querySelector('#refresh').addEventListener('click', load); document.querySelector('#days').addEventListener('change', load);
api('session').then(enter).catch(error => { if (error.code !== 401) message.textContent = error.message; });
