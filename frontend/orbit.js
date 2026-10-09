/**
 * AURA Orbit — Industrial Hardware Experience JavaScript
 * Interactive 360° CAD turntable, haptic waveform synthesizer, and responsive theme engine.
 */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPioneerInteractions();
  init360Viewer();
  initHapticSimulator();
  initGalleryLightbox();
  initScreenPresets();
  initBetaModal();
});

/* ==========================================================================
   Theme Controller (Light & Dark System Sync)
   ========================================================================== */
function initTheme() {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');
  const themeLabel = document.getElementById('theme-label');
  const html = document.documentElement;

  const sunIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
  const moonIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('aura-color-theme', theme);

    if (themeIcon) {
      themeIcon.innerHTML = theme === 'dark' ? sunIconSvg : moonIconSvg;
    }
    if (themeLabel) {
      themeLabel.textContent = theme === 'dark' ? 'Light' : 'Dark';
    }
  }

  const savedTheme = localStorage.getItem('aura-color-theme') || 'dark';
  applyTheme(savedTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = html.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }
}

/* ==========================================================================
   Interactive 360-Degree CAD Viewer
   ========================================================================== */
function init360Viewer() {
  const canvasWrap = document.getElementById('viewer-canvas-wrap');
  if (!canvasWrap) return;
  const activeImg = document.getElementById('viewer-active-image');
  const slider = document.getElementById('orbit-scrubber');
  const angleTag = document.getElementById('angle-degree-num');
  const angleName = document.getElementById('angle-view-title');
  const autoRotateBtn = document.getElementById('auto-rotate-btn');
  const anglePills = document.querySelectorAll('.angle-pill-btn');
  const lightingBtns = document.querySelectorAll('.lighting-pill-btn');
  const hotspots = document.querySelectorAll('.hotspot-point');

  // 6 Primary Curated High-Resolution Rotational Perspectives
  const frames = [
    {
      degree: 0,
      src: 'assets/orbit-front.jpg',
      title: '0° · Front Glanceable Display',
      sub: 'Low-power transflective Memory-in-Pixel screen showing T-5 meeting countdown.',
      hotspots: [
        { id: 'screen', top: '48%', left: '50%', text: 'Sunlight-Readable MIP Display (1.15")' },
        { id: 'crescent', top: '50%', left: '82%', text: 'Brushed Sand Crescent Control Key' }
      ]
    },
    {
      degree: 45,
      src: 'assets/orbit-hero.jpg',
      title: '45° · Three-Quarter Studio Perspective',
      sub: 'Asymmetric soft-square pebble casing with woven hybrid band.',
      hotspots: [
        { id: 'mic', top: '26%', left: '61%', text: 'Hardware-Gated Amber Privacy LED Ring' },
        { id: 'crescent', top: '42%', left: '60%', text: 'Raised Crescent Physical Control Key' },
        { id: 'strap', top: '82%', left: '42%', text: 'Woven-Silicone Breathable Wrist Band' }
      ]
    },
    {
      degree: 90,
      src: 'assets/orbit-right.jpg',
      title: '90° · Right Interaction Macro',
      sub: 'Raised ergonomic crescent button, acoustic mic port, and amber privacy ring.',
      hotspots: [
        { id: 'mic', top: '56%', left: '36%', text: 'Amber Ring: Energizes only when mic power rail is active' },
        { id: 'crescent', top: '48%', left: '62%', text: 'Tactile Crescent: 1-press ack, long-press focus' }
      ]
    },
    {
      degree: 180,
      src: 'assets/orbit-rear.jpg',
      title: '180° · Rear Underside & Charging',
      sub: 'Hypoallergenic matte housing, 4-contact magnetic pogo dock, circular sensor window.',
      hotspots: [
        { id: 'pogo', top: '64%', left: '60%', text: 'Quad Magnetic Pogo Charging Interface' },
        { id: 'sensor', top: '49%', left: '51%', text: 'Optional Optical Wellness Sensor Window' },
        { id: 'lugs', top: '82%', left: '54%', text: 'Quick-Release 20mm Band Lever' }
      ]
    },
    {
      degree: 270,
      src: 'assets/orbit-left.jpg',
      title: '270° · Left Ergonomic Profile',
      sub: 'Ultra-slim curved pebble contour. Seamless button-free edge to prevent wrist pinch.',
      hotspots: [
        { id: 'contour', top: '48%', left: '34%', text: 'Curved Hypoallergenic Wrist Contour' },
        { id: 'strap', top: '50%', left: '76%', text: 'Woven Breathable Inner Surface' }
      ]
    },
    {
      degree: 315,
      src: 'assets/orbit-front-left.jpg',
      title: '315° · Front-Left Three-Quarter',
      sub: 'Glanceable focus progress arc and balanced wrist presence.',
      hotspots: [
        { id: 'screen', top: '42%', left: '65%', text: 'Focus Session Active Progress Arc' },
        { id: 'buckle', top: '63%', left: '19%', text: 'Anodized Metal Buckle Hardware' }
      ]
    }
  ];

  let currentFrameIndex = 1; // Default to 45° Hero view
  let isDragging = false;
  let startX = 0;
  let autoRotateInterval = null;

  // Preload rotational frames for instant scrubbing
  frames.forEach(f => {
    const img = new Image();
    img.src = f.src;
  });

  function updateFrame(index) {
    if (index < 0) index = frames.length - 1;
    if (index >= frames.length) index = 0;
    currentFrameIndex = index;

    const frame = frames[currentFrameIndex];
    if (activeImg) {
      activeImg.src = frame.src;
      activeImg.alt = `AURA Orbit 360-degree render: ${frame.title}`;
    }

    if (slider) {
      slider.value = currentFrameIndex;
    }

    if (angleTag) {
      angleTag.textContent = `${frame.degree}°`;
    }

    if (angleName) {
      angleName.textContent = frame.title;
    }

    anglePills.forEach((btn, i) => {
      btn.classList.toggle('active', i === currentFrameIndex);
    });

    renderHotspots(frame);
  }

  function renderHotspots(frame) {
    hotspots.forEach(hp => hp.style.display = 'none');

    frame.hotspots.forEach((hs, i) => {
      if (hotspots[i]) {
        hotspots[i].style.display = 'flex';
        hotspots[i].style.top = hs.top;
        hotspots[i].style.left = hs.left;
        const tip = hotspots[i].querySelector('.hotspot-tooltip');
        if (tip) tip.textContent = hs.text;
      }
    });
  }

  if (slider) {
    slider.addEventListener('input', (e) => {
      stopAutoRotate();
      updateFrame(parseInt(e.target.value, 10));
    });
  }

  anglePills.forEach((btn) => {
    btn.addEventListener('click', () => {
      stopAutoRotate();
      const targetIndex = parseInt(btn.dataset.frameIndex, 10);
      updateFrame(targetIndex);
    });
  });

  if (canvasWrap) {
    canvasWrap.addEventListener('pointerdown', (e) => {
      isDragging = true;
      startX = e.clientX;
      stopAutoRotate();
      canvasWrap.setPointerCapture(e.pointerId);
    });

    canvasWrap.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const sensitivity = 45;

      if (Math.abs(deltaX) > sensitivity) {
        if (deltaX > 0) {
          updateFrame(currentFrameIndex - 1);
        } else {
          updateFrame(currentFrameIndex + 1);
        }
        startX = e.clientX;
      }
    });

    const stopDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        try {
          canvasWrap.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
    };

    canvasWrap.addEventListener('pointerup', stopDrag);
    canvasWrap.addEventListener('pointercancel', stopDrag);
  }

  function toggleAutoRotate() {
    if (autoRotateInterval) {
      stopAutoRotate();
    } else {
      startAutoRotate();
    }
  }

  function startAutoRotate() {
    if (autoRotateBtn) {
      autoRotateBtn.classList.add('active');
      autoRotateBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        <span>Pause</span>
      `;
    }
    autoRotateInterval = setInterval(() => {
      updateFrame((currentFrameIndex + 1) % frames.length);
    }, 1800);
  }

  function stopAutoRotate() {
    if (autoRotateInterval) {
      clearInterval(autoRotateInterval);
      autoRotateInterval = null;
      if (autoRotateBtn) {
        autoRotateBtn.classList.remove('active');
        autoRotateBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>Auto-Spin</span>
        `;
      }
    }
  }

  if (autoRotateBtn) {
    autoRotateBtn.addEventListener('click', toggleAutoRotate);
  }

  lightingBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      lightingBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.lightingMode || 'sand';
      if (canvasWrap) {
        canvasWrap.setAttribute('data-lighting', mode);
      }
    });
  });

  updateFrame(currentFrameIndex);
}

/* ==========================================================================
   Screen Preset Simulator (Clean Digital MIP Panel)
   ========================================================================== */
function initScreenPresets() {
  const chips = document.querySelectorAll('.preset-chip');
  if (!chips.length) return;
  const previewMain = document.getElementById('preview-screen-main');
  const previewSub = document.getElementById('preview-screen-sub');
  const previewBadge = document.getElementById('preview-screen-badge');

  const presets = {
    focus: {
      main: 'Focus 24 min',
      sub: 'Design Review in 5 min',
      badge: 'FOCUS'
    },
    whisper: {
      main: 'Next: Product Sync',
      sub: 'In 5m · 3 Talking Points Ready',
      badge: 'T-5 PREP'
    },
    voice: {
      main: 'Listening for Memo...',
      sub: 'Hardware Amber Ring Active',
      badge: 'AUDIO MEMO'
    },
    safety: {
      main: 'Check-in: Are you OK?',
      sub: 'Press Crescent Key to Ack',
      badge: 'SAFETY'
    }
  };

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const key = chip.dataset.preset;
      const data = presets[key];
      if (data) {
        if (previewMain) previewMain.textContent = data.main;
        if (previewSub) previewSub.textContent = data.sub;
        if (previewBadge) previewBadge.textContent = data.badge;
      }
    });
  });
}

/* ==========================================================================
   Interactive Haptic Waveform Simulator
   ========================================================================== */
function initHapticSimulator() {
  const triggerBtns = document.querySelectorAll('.haptic-trigger-btn');
  const waveBars = document.querySelectorAll('.wave-segment');
  const statusLabel = document.getElementById('haptic-status-label');

  let animationTimeout = null;

  const patterns = {
    whisper: {
      name: 'Pre-Meeting Double Tap',
      vibrate: [60, 40, 60],
      animate: [
        [0, 1],
        [2, 3],
        [6, 7]
      ],
      soundHz: [440, 520]
    },
    guardian: {
      name: 'Focus Ramp-Up Pulse',
      vibrate: [100, 50, 150, 50, 200],
      animate: [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8, 9]
      ],
      soundHz: [330, 440, 660]
    },
    safety: {
      name: 'Safety Check Heartbeat',
      vibrate: [140, 80, 140],
      animate: [
        [2, 3, 4],
        [5, 6, 7]
      ],
      soundHz: [280, 320]
    }
  };

  triggerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.haptic;
      const p = patterns[type];
      if (!p) return;

      if (statusLabel) {
        statusLabel.textContent = `Emitting waveform: ${p.name}`;
      }

      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(p.vibrate);
        } catch (_) {}
      }

      playSubtlePulse(p.soundHz);

      clearTimeout(animationTimeout);
      waveBars.forEach(bar => {
        bar.classList.remove('active', 'active-amber');
      });

      p.animate.forEach((group, idx) => {
        setTimeout(() => {
          group.forEach(i => {
            if (waveBars[i]) {
              waveBars[i].classList.add(type === 'guardian' ? 'active' : 'active-amber');
            }
          });
          setTimeout(() => {
            group.forEach(i => {
              if (waveBars[i]) waveBars[i].classList.remove('active', 'active-amber');
            });
          }, 180);
        }, idx * 140);
      });

      animationTimeout = setTimeout(() => {
        if (statusLabel) {
          statusLabel.textContent = 'Ready — Select a waveform pattern to test';
        }
      }, 1400);
    });
  });
}

function playSubtlePulse(freqs) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);

      gain.gain.setValueAtTime(0.04, ctx.currentTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.12 + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.12);
    });
  } catch (_) {}
}

/* ==========================================================================
   Visual Gallery Lightbox
   ========================================================================== */
function initGalleryLightbox() {
  const tiles = document.querySelectorAll('.gallery-tile');
  const modal = document.getElementById('orbit-lightbox-modal');
  const modalImg = document.getElementById('lightbox-modal-img');
  const modalTitle = document.getElementById('lightbox-modal-title');
  const modalText = document.getElementById('lightbox-modal-text');
  const closeBtn = document.getElementById('lightbox-close-btn');

  if (!modal) return;

  tiles.forEach(tile => {
    tile.addEventListener('click', () => {
      const img = tile.querySelector('img');
      const title = tile.querySelector('.gallery-tile-title')?.textContent || '';
      const sub = tile.querySelector('.gallery-tile-sub')?.textContent || '';

      if (img && modalImg) {
        modalImg.src = img.src;
        modalImg.alt = img.alt;
      }
      if (modalTitle) modalTitle.textContent = title;
      if (modalText) modalText.textContent = sub;

      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });
}

/* ==========================================================================
   Beta Access Waitlist Form
   ========================================================================== */
function initBetaModal() {
  const form = document.getElementById('beta-waitlist-form');
  const feedback = document.getElementById('beta-form-feedback');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const email = emailInput ? emailInput.value.trim() : '';

      if (!email || !email.includes('@')) {
        if (feedback) {
          feedback.textContent = 'Please enter a valid work email address.';
          feedback.style.color = '#ef4444';
        }
        return;
      }

      const waitlist = JSON.parse(localStorage.getItem('aura-orbit-waitlist') || '[]');
      if (!waitlist.includes(email)) {
        waitlist.push(email);
        localStorage.setItem('aura-orbit-waitlist', JSON.stringify(waitlist));
      }

      if (feedback) {
        feedback.innerHTML = `✓ Thank you! Your inquiry for AURA Orbit Edition ($70) has been received. Our team will contact you shortly with direct purchase & order fulfillment details.`;
        feedback.style.color = '#10b981';
      }

      if (emailInput) {
        emailInput.value = '';
        emailInput.disabled = true;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.textContent = 'Inquiry Sent';
        submitBtn.disabled = true;
      }
    });
  }
}

/* ==========================================================================
   Pioneer Bento Interactivity
   Interactive specs diagram hotpins, leader line illumination & chip sync
   ========================================================================== */
function initPioneerInteractions() {
  const chips = document.querySelectorAll('.quick-chip');
  const hotspots = document.querySelectorAll('.spec-pin-hotspot');
  const callouts = document.querySelectorAll('.diagram-callout');
  const lines = {
    'spec-mic': document.querySelectorAll('.line-mic-seg'),
    'spec-pogo': document.querySelectorAll('.line-pogo-seg'),
    'spec-led': document.querySelectorAll('.line-led-seg'),
    'spec-button': document.querySelectorAll('.line-btn-seg')
  };

  function activateSpec(specId) {
    if (!specId) return;

    // Sync Chips
    chips.forEach(c => {
      c.classList.toggle('active', c.dataset.spec === specId);
    });

    // Sync Hotspots
    hotspots.forEach(h => {
      h.classList.toggle('active', h.dataset.spec === specId);
    });

    // Sync Callout Labels
    callouts.forEach(cl => {
      cl.classList.toggle('active', cl.dataset.spec === specId);
    });

    // Sync SVG Leader Lines
    Object.keys(lines).forEach(k => {
      const active = k === specId;
      lines[k].forEach(line => {
        if (line) line.classList.toggle('active', active);
      });
    });
  }

  // Pre-activate default
  activateSpec('spec-mic');

  chips.forEach(chip => {
    chip.addEventListener('click', () => activateSpec(chip.dataset.spec));
    chip.addEventListener('mouseenter', () => activateSpec(chip.dataset.spec));
  });

  hotspots.forEach(spot => {
    spot.addEventListener('click', () => activateSpec(spot.dataset.spec));
    spot.addEventListener('mouseenter', () => activateSpec(spot.dataset.spec));
  });

  callouts.forEach(callout => {
    callout.addEventListener('click', () => activateSpec(callout.dataset.spec));
    callout.addEventListener('mouseenter', () => activateSpec(callout.dataset.spec));
  });

  // Action Button Card Toggle Interactions
  const wideColLeft = document.querySelector('.wide-col-left');
  const wideColRight = document.querySelector('.wide-col-right');
  const wideWatchImg = document.querySelector('.wide-center-watch-img');

  if (wideColLeft && wideWatchImg) {
    wideColLeft.addEventListener('mouseenter', () => {
      wideWatchImg.style.transform = 'scale(1.06) rotate(-2deg)';
    });
    wideColLeft.addEventListener('mouseleave', () => {
      wideWatchImg.style.transform = '';
    });
  }

  if (wideColRight && wideWatchImg) {
    wideColRight.addEventListener('mouseenter', () => {
      wideWatchImg.style.transform = 'scale(1.06) rotate(2deg)';
    });
    wideColRight.addEventListener('mouseleave', () => {
      wideWatchImg.style.transform = '';
    });
  }
}

