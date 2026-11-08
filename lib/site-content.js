const imagePath = /^(hero\.jpg|media\/[a-f0-9]{32}\.(webp|png|jpg))$/;
const videoPath = /^media\/[a-f0-9]{32}\.(mp4|webm)$/;

function validateMedia(item, video = false, defaultX = 50) {
  if (!item || typeof item.src !== 'string' || !(video ? videoPath : imagePath).test(item.src) || typeof item.alt !== 'string' || item.alt.length > 300) {
    throw new Error('Revisa los archivos y sus descripciones.');
  }
  const position = item.position || { x: defaultX, y: 50 };
  if (![position.x, position.y].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) throw new Error('Revisa el encuadre de las imágenes.');
  return { src: item.src, alt: item.alt.trim(), position: { x: position.x, y: position.y } };
}

function validateContent(value) {
  if (!value || !Array.isArray(value.testimonials) || value.testimonials.length < 1 || value.testimonials.length > 20) throw new Error('Incluye entre 1 y 20 testimonios.');
  const testimonials = value.testimonials.map(item => {
    if (typeof item?.author !== 'string' || !item.author.trim() || item.author.length > 120 || typeof item.quote !== 'string' || !item.quote.trim() || item.quote.length > 2500) throw new Error('Revisa el nombre y el texto de cada testimonio.');
    return { author: item.author.trim(), quote: item.quote.trim() };
  });
  const photos = {};
  for (const key of ['hero', 'aboutDesktop', 'aboutMobile', 'method', 'movement', 'training']) {
    const item = value.photos?.[key] || (['method', 'movement', 'training'].includes(key) ? value.photos?.hero : null);
    photos[key] = validateMedia(item, false, key.startsWith('about') ? 27 : 50);
  }
  const gallery = value.trainingGallery || { photos: [photos.training], video: null };
  if (!Array.isArray(gallery.photos) || gallery.photos.length > 5) throw new Error('El carrusel admite cinco fotos y un vídeo.');
  const trainingGallery = {
    photos: Array.from({ length: 5 }, (_, index) => gallery.photos[index] == null ? null : validateMedia(gallery.photos[index])),
    video: gallery.video == null ? null : validateMedia(gallery.video, true)
  };
  return { testimonials, photos, trainingGallery };
}

function validateUpload(body) {
  const types = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'video/webm': 'webm' };
  const ext = types[body?.type];
  if (!ext || typeof body.data !== 'string' || !body.data.length || body.data.length > 4194304 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw new Error('Selecciona una imagen de hasta 2 MB o un vídeo MP4/WebM de hasta 3 MB.');
  const bytes = Buffer.from(body.data, 'base64');
  const isVideo = body.type.startsWith('video/');
  const valid = {
    webp: bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    png: bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpg: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    mp4: bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp',
    webm: bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  }[ext];
  if (!valid || bytes.length > (isVideo ? 3145728 : 2097152)) throw new Error('El archivo no tiene un formato válido o supera el tamaño permitido.');
  return { bytes, ext };
}

module.exports = { validateContent, validateUpload };
