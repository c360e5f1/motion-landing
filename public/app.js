'use strict';

(() => {
  const STORAGE_PREFIX = 'motion-landing:';
  const store = {
    get(key) {
      try {
        return localStorage.getItem(STORAGE_PREFIX + key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, value);
      } catch {
        /* storage unavailable (e.g. private mode) */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + key);
      } catch {
        /* storage unavailable */
      }
    },
  };

  const $ = (id) => document.getElementById(id);
  const statusRegion = $('status');
  /** Motion graphics controller; assigned once the scene is created below. */
  let scene = null;

  /** Announces a short message to assistive technology. */
  function announce(message) {
    statusRegion.textContent = '';
    window.setTimeout(() => {
      statusRegion.textContent = message;
    }, 50);
  }

  /* -------------------------------------------------------------------------
   * Theme (top left)
   * ----------------------------------------------------------------------- */
  const THEME_COLORS = { dark: '#0c1622', light: '#ffffff' };
  const themeButton = $('theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  function applyTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    themeMeta.setAttribute('content', THEME_COLORS[theme]);
    const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
    themeButton.setAttribute('aria-label', label);
    themeButton.title = label;
    if (persist) store.set('theme', theme);
    if (scene) scene.refreshColors();
  }

  applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false);
  themeButton.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    announce(`${next === 'dark' ? 'Dark' : 'Light'} theme`);
  });

  /* -------------------------------------------------------------------------
   * Clock (top right) - ISO 8601, UTC, second precision
   * ----------------------------------------------------------------------- */
  const clock = $('clock');

  function formatIso8601(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function tick() {
    const iso = formatIso8601(new Date());
    clock.textContent = iso;
    clock.dateTime = iso;
    // Re-align to the next second boundary so the display never drifts.
    window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  }
  tick();

  /* -------------------------------------------------------------------------
   * Title and subtitle (bottom right)
   * ----------------------------------------------------------------------- */
  const hero = $('hero');
  const titleEl = $('title');
  const subtitleEl = $('subtitle');
  const ruleEl = $('rule');
  const defaults = {
    title: hero.dataset.defaultTitle,
    subtitle: hero.dataset.defaultSubtitle,
  };
  /** The title as entered, including any *highlight* markers. */
  const current = { title: defaults.title, subtitle: defaults.subtitle };
  let revealTimer = 0;

  const plainTitle = (raw) => raw.replace(/\*/g, '');

  /** Restarts an element's CSS animation. */
  function replay(el) {
    el.style.animation = 'none';
    void el.offsetWidth; // force a reflow so the animation starts over
    el.style.animation = '';
  }

  /**
   * Renders the title as one span per word so each word can animate in turn.
   * Words wrapped in *asterisks* get the gradient highlight; a title without
   * any markers is highlighted entirely. Text is set with textContent only.
   * @returns {number} Number of words rendered.
   */
  function renderTitle(raw) {
    titleEl.textContent = '';
    titleEl.classList.remove('is-revealed');
    window.clearTimeout(revealTimer);

    const hasMarkers = raw.includes('*');
    let count = 0;
    for (const part of raw.split(/(\*[^*]+\*)/).filter(Boolean)) {
      const highlight = !hasMarkers || /^\*.*\*$/.test(part);
      for (const word of part.replace(/^\*|\*$/g, '').split(/\s+/).filter(Boolean)) {
        const span = document.createElement('span');
        span.className = highlight ? 'word word-highlight' : 'word';
        span.textContent = word;
        span.style.animationDelay = `${(0.2 + count * 0.1).toFixed(2)}s`;
        titleEl.append(span, ' ');
        count++;
      }
    }
    titleEl.dataset.built = 'true';
    // Start the gradient shimmer once every word has arrived.
    revealTimer = window.setTimeout(() => titleEl.classList.add('is-revealed'), 1200 + count * 100);
    return count;
  }

  function applyText() {
    current.title = store.get('title') ?? defaults.title;
    current.subtitle = store.get('subtitle') ?? defaults.subtitle;

    const words = renderTitle(current.title);
    document.title = plainTitle(current.title) || 'Motion Landing';

    // The accent bar, then the subtitle, follow the last word in (top to bottom).
    subtitleEl.textContent = current.subtitle;
    subtitleEl.hidden = current.subtitle === '';
    ruleEl.style.setProperty('--delay', `${(0.4 + words * 0.1).toFixed(2)}s`);
    replay(ruleEl);
    subtitleEl.style.setProperty('--delay', `${(0.6 + words * 0.1).toFixed(2)}s`);
    replay(subtitleEl);
  }
  applyText();

  const dialog = $('settings-dialog');
  const form = $('settings-form');
  const titleInput = $('title-input');
  const subtitleInput = $('subtitle-input');
  const titleError = $('title-error');
  const settingsButton = $('settings-open');

  function setTitleError(show) {
    titleError.hidden = !show;
    titleInput.setAttribute('aria-invalid', String(show));
  }

  settingsButton.addEventListener('click', () => {
    titleInput.value = current.title;
    subtitleInput.value = current.subtitle;
    setTitleError(false);
    dialog.showModal();
    titleInput.focus();
    titleInput.select();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const subtitle = subtitleInput.value.trim();
    if (!plainTitle(title).trim()) {
      setTitleError(true);
      titleInput.focus();
      return;
    }
    if (title === defaults.title) store.remove('title');
    else store.set('title', title);
    if (subtitle === defaults.subtitle) store.remove('subtitle');
    else store.set('subtitle', subtitle);
    applyText();
    dialog.close();
    announce('Page text saved');
  });

  titleInput.addEventListener('input', () => {
    if (plainTitle(titleInput.value).trim()) setTitleError(false);
  });

  $('settings-reset').addEventListener('click', () => {
    titleInput.value = defaults.title;
    subtitleInput.value = defaults.subtitle;
    setTitleError(false);
    titleInput.focus();
  });

  for (const button of dialog.querySelectorAll('[data-action="close"]')) {
    button.addEventListener('click', () => dialog.close());
  }

  // Clicking the backdrop (the dialog element itself, outside the form) closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => settingsButton.focus());

  /* -------------------------------------------------------------------------
   * Screen wake lock (bottom left)
   * ----------------------------------------------------------------------- */
  const wakeButton = $('wake-toggle');
  const wake = {
    supported: 'wakeLock' in navigator,
    wanted: store.get('wake') !== 'off',
    sentinel: null,
    requesting: false,
  };

  function renderWake() {
    let state;
    let label;
    if (!wake.supported) {
      state = 'unsupported';
      label = window.isSecureContext
        ? 'Keep screen awake is not supported by this browser'
        : 'Keep screen awake requires HTTPS';
    } else if (!wake.wanted) {
      state = 'off';
      label = 'Keep screen awake: off';
    } else if (wake.sentinel) {
      state = 'on';
      label = 'Keep screen awake: on';
    } else {
      state = 'pending';
      label = 'Keep screen awake: waiting, select to retry';
    }
    wakeButton.dataset.state = state;
    wakeButton.setAttribute('aria-pressed', String(state === 'on' || state === 'pending'));
    wakeButton.setAttribute('aria-disabled', String(state === 'unsupported'));
    wakeButton.setAttribute('aria-label', label);
    wakeButton.title = label;
  }

  async function acquireWake() {
    if (
      !wake.supported ||
      !wake.wanted ||
      wake.sentinel ||
      wake.requesting ||
      document.visibilityState !== 'visible'
    ) {
      renderWake();
      return;
    }
    wake.requesting = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!wake.wanted) {
        await sentinel.release();
      } else {
        wake.sentinel = sentinel;
        sentinel.addEventListener('release', () => {
          if (wake.sentinel === sentinel) wake.sentinel = null;
          renderWake();
        });
      }
    } catch {
      // Denied (no user activation, battery saver, policy...). Stay "pending"
      // so the next interaction or visibility change retries.
      wake.sentinel = null;
    } finally {
      wake.requesting = false;
    }
    renderWake();
  }

  async function releaseWake() {
    const sentinel = wake.sentinel;
    wake.sentinel = null;
    if (sentinel) {
      try {
        await sentinel.release();
      } catch {
        /* already released */
      }
    }
    renderWake();
  }

  wakeButton.addEventListener('click', async () => {
    if (!wake.supported) {
      announce(wakeButton.title);
      return;
    }
    if (wake.wanted && wake.sentinel) {
      wake.wanted = false;
      store.set('wake', 'off');
      await releaseWake();
      announce('The screen may now sleep');
    } else {
      wake.wanted = true;
      store.set('wake', 'on');
      await acquireWake();
      announce(wake.sentinel ? 'The screen will stay awake' : 'Could not keep the screen awake');
    }
  });

  // The browser releases the lock when the page is hidden; re-acquire on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') acquireWake();
  });

  // Some browsers only grant the lock after a user gesture; retry on the first one.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.target.closest && event.target.closest('#wake-toggle')) return;
      acquireWake();
    },
    { capture: true },
  );

  renderWake();
  acquireWake();

  /* -------------------------------------------------------------------------
   * Motion graphics: drifting icons linked by orthogonal, diagram-style
   * connectors with data packets flowing between them. Rendered on a canvas
   * above slowly drifting colour orbs (CSS) and below a soft veil.
   * ----------------------------------------------------------------------- */
  function createScene() {
    const canvas = $('scene');
    const ctx = canvas.getContext('2d');
    const sources = Array.from(document.querySelectorAll('#icon-sources .motion-icon'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const images = [];
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let W = 0;
    let H = 0;
    let dpr = 1;
    let nodes = [];
    let packets = [];
    let lineRGB = '182, 190, 201';
    let packetRGB = '255, 153, 0';
    let last = 0;
    let swapTimer = 0;
    let raf = 0;
    let ready = false;

    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    function refreshColors() {
      const cs = getComputedStyle(document.documentElement);
      lineRGB = cs.getPropertyValue('--scene-line').trim() || lineRGB;
      packetRGB = cs.getPropertyValue('--scene-packet').trim() || packetRGB;
    }

    /** Waits for the server-selected icons; broken images are skipped. */
    function loadImages() {
      return Promise.all(
        sources.map((img) =>
          img.decode().then(
            () => images.push(img),
            () => {
              /* skip icons that fail to load */
            },
          ),
        ),
      );
    }

    /** Picks an icon that is not currently on screen where possible. */
    function pickImage() {
      const used = new Set(nodes.map((n) => n.img));
      const free = images.filter((img) => !used.has(img));
      const pool = free.length ? free : images;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function baseSize() {
      return clamp(Math.min(W, H) * 0.075, 34, 76);
    }

    /** How many icons fill the screen, relative to the original layout. */
    const ICON_DENSITY = 2;

    /** Grid cell size of the original layout (about one icon per cell). */
    function cellSize() {
      return baseSize() * 3.1;
    }

    function makeNode(x, y) {
      const depth = rand(0.55, 1.1);
      return {
        img: pickImage(),
        x,
        y,
        vx: rand(-1, 1) * 9 * depth, // px per second
        vy: rand(-1, 1) * 7 * depth,
        depth,
        size: baseSize() * depth,
        phase: rand(0, Math.PI * 2),
        life: 0, // 0 -> 1 fade-in progress
        dying: false,
      };
    }

    /** Places icons on a jittered grid, with natural gaps, for even coverage. */
    function populate() {
      nodes = [];
      packets = [];
      const cell = cellSize();
      const cols = Math.max(2, Math.round(W / cell));
      const rows = Math.max(2, Math.round(H / cell));
      const cw = W / cols;
      const ch = H / rows;
      // Each cell is split into ICON_DENSITY side-by-side slots, one icon per slot.
      const sw = cw / ICON_DENSITY;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          for (let k = 0; k < ICON_DENSITY; k++) {
            if (Math.random() < 0.28) continue; // leave natural gaps
            const n = makeNode(c * cw + k * sw + rand(0.2, 0.8) * sw, r * ch + rand(0.2, 0.8) * ch);
            n.life = reducedMotion.matches ? 1 : -rand(0, 1.2); // staggered entrance
            nodes.push(n);
          }
        }
      }
    }

    function resize() {
      const prevW = W || 1;
      const prevH = H || 1;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!nodes.length) {
        populate();
        return;
      }
      // Keep existing icons; rescale positions and sizes to the new viewport.
      const s = baseSize();
      for (const n of nodes) {
        n.x *= W / prevW;
        n.y *= H / prevH;
        n.size = s * n.depth;
      }
      // Rebalance the count for very different viewport areas.
      const target = Math.round(((W * H) / Math.pow(cellSize(), 2)) * 0.72 * ICON_DENSITY);
      while (nodes.length > target + 3) nodes.pop();
      while (nodes.length < target - 3) {
        const n = makeNode(rand(0, W), rand(0, H));
        if (reducedMotion.matches) n.life = 1;
        nodes.push(n);
      }
    }

    /** Fades icons that sit behind the title so the text stays readable. */
    function centerFade(x, y) {
      const dx = (x - W / 2) / (W * 0.36);
      const dy = (y - H / 2) / (H * 0.26);
      const d = Math.sqrt(dx * dx + dy * dy);
      return clamp((d - 0.55) / 0.6, 0.08, 1);
    }

    /** Orthogonal connector path, like a line on an architecture diagram. */
    function connectorPath(a, b) {
      const horizontalFirst = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
      return horizontalFirst
        ? [[a.x, a.y], [(a.x + b.x) / 2, a.y], [(a.x + b.x) / 2, b.y], [b.x, b.y]]
        : [[a.x, a.y], [a.x, (a.y + b.y) / 2], [b.x, (a.y + b.y) / 2], [b.x, b.y]];
    }

    function pointOnPath(pts, t) {
      const segs = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const len = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
        segs.push(len);
        total += len;
      }
      let dist = t * total;
      for (let i = 0; i < segs.length; i++) {
        if (dist <= segs[i] || i === segs.length - 1) {
          const k = segs[i] ? dist / segs[i] : 0;
          return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
        }
        dist -= segs[i];
      }
      return pts[pts.length - 1];
    }

    /** Gentle float plus pointer parallax, both scaled by depth. */
    function screenPos(n, time) {
      const fx = Math.sin(time * 0.0006 + n.phase) * 6 * n.depth;
      const fy = Math.cos(time * 0.0008 + n.phase) * 8 * n.depth;
      return {
        x: n.x + fx + pointer.x * 18 * n.depth,
        y: n.y + fy + pointer.y * 18 * n.depth,
      };
    }

    function step(dt) {
      const margin = baseSize() * 1.5;
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2);

      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        // Wrap around the edges seamlessly.
        if (n.x < -margin) n.x = W + margin;
        else if (n.x > W + margin) n.x = -margin;
        if (n.y < -margin) n.y = H + margin;
        else if (n.y > H + margin) n.y = -margin;
        n.life = n.dying ? n.life - dt * 1.2 : Math.min(1, n.life + dt * 0.9);
      }

      // Swap one icon for another roughly every two seconds for variety.
      swapTimer += dt;
      if (swapTimer > 2 && nodes.length) {
        swapTimer = 0;
        const n = nodes[Math.floor(Math.random() * nodes.length)];
        if (n.life >= 1) n.dying = true;
      }
      for (const n of nodes) {
        if (n.dying && n.life <= 0) {
          n.img = pickImage();
          n.dying = false;
          n.life = 0;
        }
      }

      // Spawn data packets along nearby connections.
      if (nodes.length > 1 && packets.length < Math.max(6, nodes.length * 0.4) && Math.random() < dt * 6) {
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        let best = null;
        let bestD = Infinity;
        for (const b of nodes) {
          if (b === a) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < bestD && Math.random() > 0.3) {
            bestD = d;
            best = b;
          }
        }
        if (best && bestD < baseSize() * 5) packets.push({ a, b: best, t: 0, speed: rand(0.35, 0.7) });
      }
      for (const p of packets) p.t += p.speed * dt;
      packets = packets.filter((p) => p.t < 1 && nodes.includes(p.a) && nodes.includes(p.b));
    }

    function draw(time) {
      ctx.clearRect(0, 0, W, H);
      const linkDist = baseSize() * 4.2;
      const pos = nodes.map((n) => screenPos(n, time));

      // Connectors: dashed "marching ants" between nearby icons.
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -time * 0.02;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = pos[i];
          const b = pos[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > linkDist) continue;
          const vis = Math.min(easeOut(clamp(nodes[i].life, 0, 1)), easeOut(clamp(nodes[j].life, 0, 1)));
          const alpha =
            0.32 *
            (1 - d / linkDist) *
            vis *
            Math.min(centerFade(a.x, a.y), centerFade(b.x, b.y)) *
            ((nodes[i].depth + nodes[j].depth) / 2);
          if (alpha < 0.01) continue;
          ctx.strokeStyle = `rgba(${lineRGB}, ${alpha})`;
          const path = connectorPath(a, b);
          ctx.beginPath();
          ctx.moveTo(path[0][0], path[0][1]);
          for (let k = 1; k < path.length; k++) ctx.lineTo(path[k][0], path[k][1]);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // Data packets with a glowing trail.
      for (const p of packets) {
        const path = connectorPath(pos[nodes.indexOf(p.a)], pos[nodes.indexOf(p.b)]);
        const fade = Math.sin(Math.PI * p.t);
        for (let k = 0; k < 6; k++) {
          const [x, y] = pointOnPath(path, clamp(p.t - k * 0.025, 0, 1));
          ctx.fillStyle = `rgba(${packetRGB}, ${(0.9 - k * 0.14) * fade * centerFade(x, y)})`;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.6, 3 - k * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Icons: far (small) first so near ones overlap them.
      const order = nodes.map((_, i) => i).sort((i, j) => nodes[i].depth - nodes[j].depth);
      for (const i of order) {
        const n = nodes[i];
        const p = pos[i];
        const life = clamp(n.life, 0, 1);
        if (life <= 0) continue;
        const e = easeOut(life);
        const s = n.size * (0.6 + 0.4 * e);
        const alpha = e * centerFade(p.x, p.y) * (0.45 + (0.55 * (n.depth - 0.55)) / 0.55);
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 14 * n.depth;
        ctx.shadowOffsetY = 4 * n.depth;
        ctx.drawImage(n.img, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = 'transparent';
    }

    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw(now);
      raf = window.requestAnimationFrame(loop);
    }

    function stop() {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }

    /** Animates, or renders a single still frame when reduced motion is preferred. */
    function play() {
      stop();
      if (!ready) return;
      if (reducedMotion.matches) {
        for (const n of nodes) {
          n.life = 1;
          n.dying = false;
        }
        packets = [];
        draw(0);
        return;
      }
      if (document.hidden) return;
      last = performance.now();
      raf = window.requestAnimationFrame(loop);
    }

    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      window.cancelAnimationFrame(resizeRaf);
      resizeRaf = window.requestAnimationFrame(() => {
        if (!ready) return;
        resize();
        if (reducedMotion.matches) draw(0);
      });
    });
    window.addEventListener('pointermove', (event) => {
      if (!W || !H) return;
      pointer.tx = (event.clientX / W - 0.5) * 2;
      pointer.ty = (event.clientY / H - 0.5) * 2;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else play();
    });
    reducedMotion.addEventListener('change', play);

    loadImages().then(() => {
      if (!images.length) return;
      ready = true;
      refreshColors();
      resize();
      play();
    });

    return {
      refreshColors() {
        refreshColors();
        if (ready && reducedMotion.matches) draw(0);
      },
    };
  }

  scene = createScene();

  /* -------------------------------------------------------------------------
   * Progressive web application
   * ----------------------------------------------------------------------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is optional */
      });
    });
  }
})();
