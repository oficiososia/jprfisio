const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { validateContent, validateUpload } = require('../lib/site-content');
const base = require('../site-content.json');
const photo = { src: 'media/' + 'a'.repeat(32) + '.webp', alt: 'Entrenamiento', position: { x: 20, y: 80 } };
const video = { ...photo, src: 'media/' + 'b'.repeat(32) + '.mp4' };

test('existing published content retains photos and creates one real training slide', () => {
  const value = validateContent(base);
  assert.deepEqual(value.photos, base.photos);
  assert.deepEqual(value.trainingGallery.photos, [base.photos.training, null, null, null, null]);
  assert.equal(value.trainingGallery.video, null);
});
test('five photos and one video survive a publish round trip with crop positions', () => {
  const value = validateContent({ ...base, trainingGallery: { photos: Array(5).fill(photo), video } });
  assert.deepEqual(validateContent(JSON.parse(JSON.stringify(value))), value);
  assert.equal(value.trainingGallery.photos.length, 5);
  assert.deepEqual(value.trainingGallery.video, video);
});
test('empty slots stay empty and gallery order is preserved', () => {
  const value = validateContent({ ...base, trainingGallery: { photos: [null, photo, null, photo, null], video: null } });
  assert.deepEqual(value.trainingGallery.photos, [null, photo, null, photo, null]);
});
test('extra slides, executable paths, wrong media types and invalid crops are rejected', () => {
  for (const gallery of [
    { photos: Array(6).fill(photo) },
    { photos: [{ ...photo, src: 'https://example.com/tracking.png' }] },
    { photos: [{ ...photo, src: '../hero.jpg' }] },
    { photos: [video] },
    { photos: [photo], video: photo },
    { photos: [{ ...photo, position: { x: -1, y: 50 } }] }
  ]) assert.throws(() => validateContent({ ...base, trainingGallery: gallery }));
});
test('MP4 and WebM uploads validate their signatures and size bounds', () => {
  const mp4 = Buffer.alloc(3145728); mp4.write('ftyp', 4);
  assert.equal(validateUpload({ type: 'video/mp4', data: mp4.toString('base64') }).ext, 'mp4');
  assert.equal(validateUpload({ type: 'video/webm', data: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0]).toString('base64') }).ext, 'webm');
  assert.throws(() => validateUpload({ type: 'video/mp4', data: Buffer.concat([mp4, Buffer.from([0])]).toString('base64') }));
  assert.throws(() => validateUpload({ type: 'video/mp4', data: Buffer.from('<script>alert(1)</script>').toString('base64') }));
  assert.throws(() => validateUpload({ type: 'image/jpeg', data: mp4.toString('base64') }));
});
test('HTML never requests a legacy photo before loading published content', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const images = html.match(/<img\b[^>]*data-site-photo[^>]*>/g);
  assert.equal(images.length, 5);
  for (const image of images) assert.doesNotMatch(image, /\ssrc=/);
  assert.doesNotMatch(html, /rel="preload"[^>]*hero\.jpg/);
  assert.match(html, /data-training-carousel/);
});
test('authenticated upload and publish preserve gallery; unauthenticated writes remain blocked', async () => {
  process.env.ADMIN_PASSWORD = 'fixture-password';
  process.env.ADMIN_SESSION_SECRET = 'test-only-session-secret-32-characters';
  process.env.GITHUB_CONTENT_TOKEN = 'test-only-token';
  const handler = require('../api/admin');
  const payload = Buffer.from(JSON.stringify({ user: 'jpr', exp: Date.now() + 60000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
  const cookie = `__Host-jpr_admin=${payload}.${signature}`;
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ content: { sha: 'c'.repeat(40) }, commit: { sha: 'd'.repeat(40) } }) }; };
  function response() { return { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } }; }
  const headers = { cookie, origin: 'https://fixture.example', host: 'fixture.example', 'content-type': 'application/json' };
  try {
    const denied = response();
    await handler({ method: 'POST', query: { action: 'publish' }, headers: { ...headers, cookie: '' }, body: {} }, denied);
    assert.equal(denied.code, 401); assert.equal(requests.length, 0);
    const bytes = Buffer.alloc(24); bytes.write('ftyp', 4);
    const uploaded = response();
    await handler({ method: 'POST', query: { action: 'upload' }, headers, body: { type: 'video/mp4', data: bytes.toString('base64') } }, uploaded);
    assert.equal(uploaded.code, 200); assert.match(uploaded.body.src, /^media\/[a-f0-9]{32}\.mp4$/);
    const published = response();
    await handler({ method: 'POST', query: { action: 'publish' }, headers, body: { content: { ...base, trainingGallery: { photos: Array(5).fill(photo), video: { ...video, src: uploaded.body.src } } }, revision: 'a'.repeat(40) } }, published);
    assert.equal(published.code, 200);
    const saved = JSON.parse(Buffer.from(requests[1].body.content, 'base64'));
    assert.equal(saved.trainingGallery.photos.length, 5);
    assert.equal(saved.trainingGallery.video.src, uploaded.body.src);
    assert.equal(requests[1].body.sha, 'a'.repeat(40));
  } finally { global.fetch = originalFetch; }
});
