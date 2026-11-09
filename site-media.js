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

  const expandIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  const pauseIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  const playIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
  const photoSeconds = 2;
  const openIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';
  const pad = value => String(value).padStart(2, '0');

  // Training gallery: swipeable main photo, the next two items beside it and a full-screen viewer.
  function createTrainingCarousel(content) {
    const root = document.querySelector('[data-training-carousel]');
    if (!root || root.dataset.ready) return;
    const gallery = content.trainingGallery;
    const photos = (Array.isArray(gallery?.photos) ? gallery.photos.slice(0, 6) : [content.photos?.training])
      .filter(item => item && imagePath.test(item.src));
    const items = photos.map(item => ({ ...item, type: 'image' }));
    if (gallery?.video && videoPath.test(gallery.video.src)) items.push({ ...gallery.video, type: 'video' });
    const main = root.querySelector('[data-training-stage]');
    if (!items.length) { main.dataset.mediaError = 'Todavía no hay imágenes publicadas'; return; }
    root.dataset.ready = 'true';

    const total = items.length;
    const side = root.querySelector('[data-training-side]');
    const count = root.querySelector('[data-training-count]');
    const prev = root.querySelector('[data-training-prev]');
    const next = root.querySelector('[data-training-next]');
    const viewer = root.querySelector('[data-training-viewer]');
    const track = viewer.querySelector('[data-viewer-track]');
    const thumbs = viewer.querySelector('[data-viewer-thumbs]');
    const viewerCount = viewer.querySelector('[data-viewer-count]');
    const viewerPrev = viewer.querySelector('[data-viewer-prev]');
    const viewerNext = viewer.querySelector('[data-viewer-next]');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canOpen = typeof viewer.showModal === 'function';
    let index = 0, viewerIndex = 0, frame = 0, viewerFrame = 0, opener = null, viewerItems = null;
    // Autoplay: `paused` is the visitor's choice; hover, keyboard focus, viewer and visibility only suspend it.
    let paused = motion.matches, hovering = false, keyboardFocus = false, timer = 0;
    let programmatic = null, programmaticTimer = 0;
    let near = !('IntersectionObserver' in window), inView = near;
    const describe = item => item.alt || (item.type === 'video' ? 'Vídeo de entrenamiento' : 'Entrenamiento adaptado');
    const kind = item => item.type === 'video' ? 'vídeo' : 'foto';
    const clamp = value => Math.max(0, Math.min(total - 1, value));
    const behavior = () => motion.matches ? 'auto' : 'smooth';

    // Media elements get their src only when needed; `still` shows the first video frame without playing.
    function createMedia(item, still = false, onLimit = null) {
      const media = document.createElement(item.type === 'video' ? 'video' : 'img');
      media.className = 'tg-media';
      if (item.type === 'video') {
        media.muted = true;
        media.defaultMuted = true;
        media.playsInline = true;
        media.setAttribute('playsinline', '');
        media.preload = 'none';
        media.setAttribute('aria-label', describe(item));
        // Only the first two seconds are shown: `onLimit` decides what follows, otherwise they loop.
        const limit = () => { if (onLimit) onLimit(); else { media.currentTime = 0; media.play().catch(() => {}); } };
        media.addEventListener('timeupdate', () => { if (media.currentTime >= 2) limit(); });
        media.addEventListener('ended', limit);
        media.addEventListener('loadeddata', ready);
        media.dataset.src = still ? item.src + '#t=0.001' : item.src;
      } else {
        media.alt = describe(item);
        media.decoding = 'async';
        media.draggable = false;
        media.addEventListener('load', ready);
        media.dataset.src = item.src;
      }
      function ready() { media.classList.add('media-ready'); media.parentElement?.removeAttribute('data-media-error'); }
      media.addEventListener('error', () => {
        media.classList.remove('media-ready');
        if (media.parentElement) media.parentElement.dataset.mediaError = item.type === 'video' ? 'Vídeo no disponible' : 'Imagen no disponible';
      });
      const { x = 50, y = 50 } = item.position || {};
      media.style.objectPosition = `${x}% ${y}%`;
      return media;
    }
    function load(media, full = false) {
      if (!media || media.hasAttribute('src')) return;
      if (media.tagName === 'VIDEO') media.preload = full ? 'auto' : 'metadata';
      media.src = media.dataset.src;
    }

    const slides = items.map((item, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tg-main-photo';
      button.tabIndex = i === 0 ? 0 : -1;
      button.setAttribute('aria-label', `Ampliar ${kind(item)} ${i + 1} de ${total}: ${describe(item)}`);
      const media = createMedia(item, false, () => finishVideo(i));
      const expand = document.createElement('span');
      expand.className = 'tg-expand';
      expand.innerHTML = expandIcon;
      const label = document.createElement('span');
      label.className = 'tg-photo-label';
      label.setAttribute('aria-hidden', 'true');
      const number = document.createElement('span');
      number.textContent = `${pad(i + 1)} / ${pad(total)}`;
      label.append('Entrenamientos', number);
      button.append(media, expand, label);
      button.addEventListener('click', () => openViewer(i, button));
      main.append(button);
      return media;
    });

    const sideButtons = total < 3 ? [] : [1, 2].map(() => {
      const button = document.createElement('button');
      button.type = 'button';
      button.addEventListener('click', () => openViewer(Number(button.dataset.index), button));
      side.append(button);
      return button;
    });
    if (total < 3) root.classList.add('tg-single');

    function renderSide() {
      sideButtons.forEach((button, k) => {
        const i = (index + k + 1) % total;
        if (button.dataset.index === String(i)) return;
        button.dataset.index = String(i);
        button.removeAttribute('data-media-error');
        const media = createMedia(items[i], true);
        button.replaceChildren(media);
        if (k === 1) {
          const all = document.createElement('span');
          all.className = 'tg-all-label';
          all.innerHTML = 'Ver galería ' + openIcon;
          button.append(all);
          button.setAttribute('aria-label', `Ver galería completa desde ${kind(items[i])} ${i + 1}`);
        } else button.setAttribute('aria-label', `Ampliar ${kind(items[i])} ${i + 1} de ${total}: ${describe(items[i])}`);
        if (near) load(media);
      });
    }
    // Load the visible item, its neighbours and the side photos once the section is close.
    function warm() {
      if (!near) return;
      load(slides[index], true);
      load(slides[index + 1]);
      load(slides[index - 1]);
      sideButtons.forEach(button => load(button.querySelector('.tg-media')));
    }
    function playIf(media, active) {
      if (media.tagName !== 'VIDEO') return;
      // With reduced motion the video only plays if the visitor started the gallery.
      if (active && (!motion.matches || !paused)) {
        load(media, true);
        media.play().catch(() => {});
      } else if (!media.paused) media.pause();
    }
    function syncVideo() {
      const open = viewer.open;
      slides.forEach((media, i) => {
        playIf(media, !open && i === index && inView && !document.hidden);
        // Each visit to the video starts from the beginning.
        if (i !== index && media.tagName === 'VIDEO' && media.currentTime) media.currentTime = 0;
      });
      viewerItems?.forEach(({ media }, i) => playIf(media, open && i === viewerIndex && !document.hidden));
    }
    const canAutoplay = () => !paused && !hovering && !keyboardFocus && inView && !document.hidden && !viewer.open && total > 1;
    function schedule() {
      clearTimeout(timer);
      if (!canAutoplay()) return;
      // Photos stay two seconds; the video moves on when it finishes (the longer wait is only a fallback).
      timer = setTimeout(advance, items[index].type === 'video' ? 6000 : photoSeconds * 1000);
    }
    function advance() {
      if (!canAutoplay()) return;
      const i = (index + 1) % total;
      scrollToIndex(i, i !== 0);
    }
    function finishVideo(i) {
      const media = slides[i];
      if (i === index && canAutoplay()) { media.pause(); advance(); }
      else { media.currentTime = 0; if (i === index) playIf(media, inView && !viewer.open && !document.hidden); }
    }
    function setPaused(value) {
      paused = value;
      toggle.innerHTML = paused ? playIcon : pauseIcon;
      toggle.setAttribute('aria-label', paused ? 'Reproducir galería' : 'Pausar galería');
      // Announce position changes only when they are not automatic.
      count.setAttribute('aria-live', paused ? 'polite' : 'off');
      syncVideo();
      schedule();
    }
    function select(i) {
      index = i;
      slides.forEach((media, k) => { media.parentElement.tabIndex = k === i ? 0 : -1; });
      count.textContent = `${i + 1} / ${total}`;
      prev.disabled = i === 0;
      next.disabled = i === total - 1;
      renderSide();
      warm();
      syncVideo();
      schedule();
    }
    // Scrolls started here are marked so that only the visitor's own swipes pause the gallery.
    function scrollToIndex(i, smooth) {
      const left = clamp(i) * main.clientWidth;
      if (Math.abs(main.scrollLeft - left) < 2) return;
      programmatic = clamp(i);
      clearTimeout(programmaticTimer);
      programmaticTimer = setTimeout(() => { programmatic = null; }, 1000);
      main.scrollTo({ left, behavior: smooth ? behavior() : 'auto' });
    }
    function go(i, smooth = true) {
      scrollToIndex(i, smooth);
    }
    function navigate(i) {
      setPaused(true);
      go(i);
    }
    main.addEventListener('scroll', () => {
      if (programmatic !== null) {
        // The scroll counts as ours until it has been still for a moment (snapping adds late events).
        clearTimeout(programmaticTimer);
        programmaticTimer = setTimeout(() => { programmatic = null; }, 250);
      } else if (!paused) setPaused(true);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!main.clientWidth) return;
        const i = clamp(Math.round(main.scrollLeft / main.clientWidth));
        if (i !== index) select(i);
      });
    }, { passive: true });
    main.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const i = clamp(index + (event.key === 'ArrowRight' ? 1 : -1));
      navigate(i);
      slides[i].parentElement.focus({ preventScroll: true });
    });
    prev.addEventListener('click', () => navigate(index - 1));
    next.addEventListener('click', () => navigate(index + 1));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tg-round';
    toggle.dataset.trainingToggle = '';
    next.after(toggle);
    toggle.addEventListener('click', () => setPaused(!paused));
    const mosaic = root.querySelector('.tg-mosaic');
    mosaic.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovering = true; schedule(); } });
    mosaic.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') { hovering = false; schedule(); } });
    root.addEventListener('focusin', event => {
      keyboardFocus = event.target !== toggle && event.target.matches(':focus-visible');
      schedule();
    });
    root.addEventListener('focusout', event => {
      if (!root.contains(event.relatedTarget)) { keyboardFocus = false; schedule(); }
    });
    root.querySelector('[data-training-open]').addEventListener('click', event => openViewer(index, event.currentTarget));
    // Keep the current photo aligned when the layout width changes.
    if ('ResizeObserver' in window) new ResizeObserver(() => go(index, false)).observe(main);

    function buildViewer() {
      viewerItems = items.map((item, i) => {
        const slide = document.createElement('div');
        slide.className = 'tg-slide';
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-roledescription', 'diapositiva');
        slide.setAttribute('aria-label', `${i + 1} de ${total}`);
        const media = createMedia(item);
        media.style.objectPosition = '50% 50%';
        if (item.type === 'video') media.controls = true;
        slide.append(media);
        track.append(slide);
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.setAttribute('aria-label', `${item.type === 'video' ? 'Vídeo' : 'Foto'} ${i + 1}`);
        const preview = createMedia(item, true);
        if (preview.tagName === 'IMG') preview.alt = ''; else preview.setAttribute('aria-hidden', 'true');
        thumb.append(preview);
        thumb.addEventListener('click', () => viewerGo(i));
        thumbs.append(thumb);
        return { slide, media, thumb, preview };
      });
      track.addEventListener('scroll', () => {
        if (viewerFrame) return;
        viewerFrame = requestAnimationFrame(() => {
          viewerFrame = 0;
          if (!track.clientWidth) return;
          const i = clamp(Math.round(track.scrollLeft / track.clientWidth));
          if (i !== viewerIndex) viewerSelect(i);
        });
      }, { passive: true });
    }
    function viewerSelect(i) {
      viewerIndex = i;
      viewerItems.forEach(({ slide, thumb, preview }, k) => {
        slide.setAttribute('aria-hidden', String(k !== i));
        thumb.setAttribute('aria-pressed', String(k === i));
        load(preview);
      });
      [i - 1, i, i + 1].forEach(k => load(viewerItems[k]?.media, k === i));
      viewerCount.replaceChildren(pad(i + 1) + ' ');
      const of = document.createElement('span');
      of.textContent = `/ ${pad(total)}`;
      viewerCount.append(of);
      viewerPrev.disabled = i === 0;
      viewerNext.disabled = i === total - 1;
      viewerItems[i].thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      syncVideo();
    }
    function viewerGo(i) {
      track.scrollTo({ left: clamp(i) * track.clientWidth, behavior: behavior() });
    }
    function openViewer(i, trigger) {
      if (!canOpen || viewer.open) return;
      opener = trigger;
      if (!viewerItems) buildViewer();
      viewer.showModal();
      track.scrollTo({ left: i * track.clientWidth, behavior: 'auto' });
      viewerSelect(i);
    }
    viewerPrev.addEventListener('click', () => viewerGo(viewerIndex - 1));
    viewerNext.addEventListener('click', () => viewerGo(viewerIndex + 1));
    viewer.querySelector('[data-viewer-close]').addEventListener('click', () => viewer.close());
    viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
    viewer.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.tagName === 'VIDEO') return;
      event.preventDefault();
      viewerGo(viewerIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });
    viewer.addEventListener('close', () => {
      // Return to the photo last seen in the viewer and give focus back to where it was opened.
      go(viewerIndex, false);
      select(viewerIndex);
      const target = opener?.classList.contains('tg-main-photo') ? slides[viewerIndex].parentElement : opener;
      target?.focus({ preventScroll: true });
      opener = null;
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting) && !near) { near = true; warm(); }
      }, { rootMargin: '600px 0px' }).observe(root);
      new IntersectionObserver(entries => { inView = entries[0].isIntersecting; syncVideo(); schedule(); }, { threshold: .15 }).observe(root);
    }
    document.addEventListener('visibilitychange', () => { syncVideo(); schedule(); });
    motion.addEventListener?.('change', () => { if (motion.matches) setPaused(true); else syncVideo(); });
    const controls = root.querySelector('[data-training-controls]');
    [prev, next, count, toggle].forEach(element => { element.hidden = total < 2; });
    setPaused(paused);
    controls.hidden = false;
    if (!canOpen) root.querySelector('[data-training-open]').hidden = true;
    select(0);
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
