/* Published media is the only source of image URLs: no temporary legacy photos. */
(() => {
  const imagePath = /^(hero\.jpg|media\/[a-f0-9]{32}\.(webp|png|jpg))$/;
  const videoPath = /^media\/[a-f0-9]{32}\.(mp4|webm)$/;
  async function loadContent() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/site-content.json', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
    finally { clearTimeout(timeout); }
  }
  window.siteContentReady = loadContent();

  function position(media, item) {
    const { x = 50, y = 50 } = item.position || {};
    media.style.objectPosition = `${x}% ${y}%`;
  }

  function renderPhotos(content) {
    document.querySelectorAll('[data-site-photo]').forEach(image => {
      const key = { aboutMobile: 'aboutDesktop', movement: 'method' }[image.dataset.sitePhoto] || image.dataset.sitePhoto;
      const photo = content.photos?.[key];
      if (!photo || !imagePath.test(photo.src)) return;
      image.onload = () => { image.classList.add('media-ready'); image.parentElement.removeAttribute('data-media-error'); };
      image.onerror = () => { image.classList.remove('media-ready'); image.parentElement.dataset.mediaError = 'Imagen no disponible'; };
      image.alt = photo.alt || '';
      position(image, photo);
      image.src = photo.src;
    });
  }

  function createTrainingCarousel(content) {
    const root = document.querySelector('[data-training-carousel]');
    if (!root) return;
    const gallery = content.trainingGallery;
    const photos = (Array.isArray(gallery?.photos) ? gallery.photos.slice(0, 5) : [content.photos?.training])
      .filter(item => item && imagePath.test(item.src));
    const items = photos.map(item => ({ ...item, type: 'image' }));
    if (gallery?.video && videoPath.test(gallery.video.src)) items.push({ ...gallery.video, type: 'video' });
    if (!items.length) { root.dataset.mediaError = 'Todavía no hay imágenes publicadas'; return; }

    const stage = root.querySelector('[data-training-stage]');
    const controls = root.querySelector('[data-training-controls]');
    const dots = root.querySelector('[data-training-dots]');
    const count = root.querySelector('[data-training-count]');
    const toggle = root.querySelector('[data-training-toggle]');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0, timer, watchdog, frame, inView = !('IntersectionObserver' in window);
    let paused = motion.matches;
    const failed = new Set();
    const slides = items.map((item, i) => {
      const slide = document.createElement('div');
      slide.className = 'training-slide';
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'diapositiva');
      slide.setAttribute('aria-label', `${i + 1} de ${items.length}`);
      const media = document.createElement(item.type === 'video' ? 'video' : 'img');
      if (item.type === 'video') {
        media.muted = true;
        media.defaultMuted = true;
        media.playsInline = true;
        media.preload = 'none';
        if (photos[0]) media.poster = photos[0].src;
        media.classList.add('media-ready');
        media.setAttribute('aria-label', item.alt || 'Entrenamiento adaptado');
        media.addEventListener('ended', finishVideo);
        media.addEventListener('timeupdate', checkVideoTime);
      } else {
        media.alt = item.alt || 'Entrenamiento adaptado';
        media.decoding = 'async';
        media.addEventListener('load', () => media.classList.add('media-ready'));
      }
      media.addEventListener('error', () => {
        failed.add(i);
        if (i === index) {
          if (failed.size < items.length) show(nextIndex(1));
          else { stop(); root.dataset.mediaError = 'No se han podido cargar las imágenes'; }
        }
      });
      position(media, item);
      slide.append(media);
      stage.append(slide);
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', item.type === 'video' ? 'Ver vídeo de entrenamiento' : `Ver foto ${i + 1}`);
      dot.addEventListener('click', () => { paused = true; show(i); });
      dots.append(dot);
      return { slide, media, dot };
    });

    function canPlay() { return !paused && inView && !document.hidden && !failed.has(index); }
    function nextIndex(delta) {
      let next = index;
      for (let step = 0; step < items.length; step++) {
        next = (next + delta + items.length) % items.length;
        if (!failed.has(next)) return next;
      }
      return index;
    }
    function stop() {
      clearTimeout(timer); clearTimeout(watchdog); cancelAnimationFrame(frame);
      slides.forEach(({ media }) => { if (media.tagName === 'VIDEO') media.pause(); });
    }
    function finishVideo() {
      const media = slides[index].media;
      if (media.tagName !== 'VIDEO') return;
      media.pause();
      if (canPlay()) {
        const next = nextIndex(1);
        if (next === index) media.currentTime = 0;
        show(next);
      }
    }
    function checkVideoTime() {
      const media = slides[index].media;
      if (media.tagName === 'VIDEO' && media.currentTime >= 2) { finishVideo(); return true; }
      return false;
    }
    function watchVideo() {
      if (!canPlay() || slides[index].media.tagName !== 'VIDEO') return;
      if (checkVideoTime()) return;
      if (canPlay() && slides[index].media.tagName === 'VIDEO') frame = requestAnimationFrame(watchVideo);
    }
    function syncPlayback() {
      stop();
      toggle.textContent = paused ? '▶' : 'Ⅱ';
      toggle.setAttribute('aria-label', paused ? 'Reproducir carrusel' : 'Pausar carrusel');
      stage.setAttribute('aria-live', paused ? 'polite' : 'off');
      if (!canPlay()) return;
      const media = slides[index].media;
      if (media.tagName === 'VIDEO') {
        if (media.currentTime >= 2 || media.ended) media.currentTime = 0;
        const active = index;
        // Skip unavailable/stalled video without leaving the carousel stuck.
        watchdog = setTimeout(() => { if (active === index && canPlay()) show(nextIndex(1)); }, 8000);
        media.play().then(() => {
          if (active !== index || !canPlay()) { media.pause(); return; }
          media.classList.add('media-ready');
          frame = requestAnimationFrame(watchVideo);
        }).catch(() => {
          if (active !== index || !canPlay()) return;
          paused = true;
          syncPlayback();
        });
      } else if (items.length > 1) timer = setTimeout(() => show(nextIndex(1)), 4000);
    }
    function show(next) {
      stop();
      if (next !== index && slides[index].media.tagName === 'VIDEO') slides[index].media.currentTime = 0;
      index = next;
      slides.forEach(({ slide, dot }, i) => {
        slide.hidden = i !== index;
        dot.setAttribute('aria-current', String(i === index));
      });
      const media = slides[index].media;
      if (!media.hasAttribute('src')) media.src = items[index].src;
      // Warm only the next photo; the video is not fetched until it is selected.
      const nextPhoto = nextIndex(1);
      if (items[nextPhoto].type === 'image' && !slides[nextPhoto].media.hasAttribute('src')) slides[nextPhoto].media.src = items[nextPhoto].src;
      count.textContent = `${index + 1} / ${items.length}`;
      syncPlayback();
    }
    root.querySelector('[data-training-prev]').addEventListener('click', () => { paused = true; show(nextIndex(-1)); });
    root.querySelector('[data-training-next]').addEventListener('click', () => { paused = true; show(nextIndex(1)); });
    toggle.addEventListener('click', () => { paused = !paused; syncPlayback(); });
    root.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); paused = true; show(nextIndex(event.key === 'ArrowRight' ? 1 : -1));
    });
    root.addEventListener('focusin', event => {
      if (event.target !== toggle) { paused = true; syncPlayback(); }
    });
    let touch;
    stage.addEventListener('touchstart', event => { touch = event.touches[0]; }, { passive: true });
    stage.addEventListener('touchend', event => {
      if (!touch) return;
      const dx = event.changedTouches[0].clientX - touch.clientX;
      const dy = event.changedTouches[0].clientY - touch.clientY;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { paused = true; show(nextIndex(dx < 0 ? 1 : -1)); }
      touch = null;
    }, { passive: true });
    document.addEventListener('visibilitychange', syncPlayback);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', syncPlayback);
    motion.addEventListener('change', () => { if (motion.matches) { paused = true; syncPlayback(); } });
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting; syncPlayback();
    }, { threshold: .15 }).observe(root);
    controls.hidden = items.length < 2 && items[0].type !== 'video';
    show(0);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const content = await window.siteContentReady;
    if (content?.photos) { renderPhotos(content); createTrainingCarousel(content); return; }
    const root = document.querySelector('.hero-photo');
    root.dataset.mediaError = 'No se han podido cargar las imágenes';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'media-retry'; retry.textContent = 'Reintentar imágenes';
    root.append(retry);
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      window.siteContentReady = loadContent();
      const fresh = await window.siteContentReady;
      if (fresh?.photos) { retry.remove(); root.removeAttribute('data-media-error'); renderPhotos(fresh); createTrainingCarousel(fresh); }
      else retry.disabled = false;
    });
  });
})();
