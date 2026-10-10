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
  initLiveSimulator();
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

/* ==========================================================================
   Interactive Live Simulation Lab Engine
   Multi-device switcher, 4 scenario state-machines, haptic cues & telemetry
   ========================================================================== */
function initLiveSimulator() {
  const orbitFrame = document.getElementById('orbit-chassis-frame');
  const appleFrame = document.getElementById('apple-watch-chassis-frame');
  const orbitScreen = document.getElementById('orbit-screen-surface');
  const appleScreen = document.getElementById('apple-screen-surface');
  const amberRing = document.getElementById('orbit-amber-ring');
  const crescentKey = document.getElementById('orbit-hardware-crescent-key');
  const digitalCrown = document.getElementById('apple-digital-crown');
  const sideButton = document.getElementById('apple-side-button');

  const btnOrbit = document.getElementById('sim-device-orbit-btn');
  const btnApple = document.getElementById('sim-device-apple-btn');
  const tabT5 = document.getElementById('sim-tab-t5');
  const tabFocus = document.getElementById('sim-tab-focus');
  const tabDistracted = document.getElementById('sim-tab-distracted');
  const tabSafety = document.getElementById('sim-tab-safety');
  const scenarioTabs = [tabT5, tabFocus, tabDistracted, tabSafety].filter(Boolean);

  const activeClientLabel = document.getElementById('hud-active-client');
  const modeLabel = document.getElementById('sim-active-mode-label');
  const instructionLabel = document.getElementById('sim-instruction-text');
  const streamConsole = document.getElementById('hud-event-log-stream');
  const clearStreamBtn = document.getElementById('terminal-clear-btn');

  // Peripheral status pills
  const pillFireTV = document.getElementById('status-pill-firetv');
  const pillSlack = document.getElementById('status-pill-slack');
  const pillSafety = document.getElementById('status-pill-safety');

  if (!orbitFrame || !orbitScreen) return;

  // Simulator State
  let currentDevice = 'orbit'; // 'orbit' | 'apple-watch'
  let currentScenario = 't5';  // 't5' | 'focus' | 'distracted' | 'safety'

  // Focus Timer Variables
  let focusSeconds = 1492; // 24m 52s
  let focusInterval = null;
  let isFocusRunning = false;
  let deepWorkPoints = 12;

  // Safety Timer Variables
  let safetySeconds = 30;
  let safetyInterval = null;
  let safetyEscalated = false;

  // Distraction Undo state
  let distractionPending = false;

  // Audio cue helper
  function triggerHaptic(type = 'click') {
    if (typeof playSubtlePulse === 'function') {
      if (type === 'click') playSubtlePulse([520]);
      else if (type === 'ack') playSubtlePulse([440, 880]);
      else if (type === 'focus') playSubtlePulse([330, 495, 660]);
      else if (type === 'alert') playSubtlePulse([220, 220, 220]);
    }
  }

  // Telemetry Wire Logger
  function logTelemetry(type, msg, payload = null) {
    if (!streamConsole) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    let badgeClass = 'event';
    if (type === 'RELAY') badgeClass = 'relay';
    else if (type === 'POLICY') badgeClass = 'policy';
    else if (type === 'WARN') badgeClass = 'warn';

    let jsonSnippet = '';
    if (payload) {
      jsonSnippet = ' ' + JSON.stringify(payload);
    }

    entry.innerHTML = `
      <span class="log-time">${timeStr}</span>
      <span class="log-badge ${badgeClass}">${type}</span>
      <span class="log-body">${msg}${jsonSnippet}</span>
    `;

    streamConsole.appendChild(entry);
    streamConsole.scrollTop = streamConsole.scrollHeight;
  }

  if (clearStreamBtn) {
    clearStreamBtn.addEventListener('click', () => {
      if (streamConsole) streamConsole.innerHTML = '';
      logTelemetry('EVENT', 'Telemetry wire log reset by user');
    });
  }

  // Peripheral Management
  function setPeripherals(state) {
    if (!pillFireTV || !pillSlack || !pillSafety) return;

    if (state === 'focus') {
      pillFireTV.className = 'periph-status-pill paused';
      pillFireTV.textContent = 'PAUSED (DND Muted)';
      pillSlack.className = 'periph-status-pill dnd';
      pillSlack.textContent = 'DND (:hourglass: In Focus)';
      pillSafety.className = 'periph-status-pill standby';
      pillSafety.textContent = 'MONITORING (Normal)';
    } else if (state === 'safety_escalated') {
      pillSafety.className = 'periph-status-pill escalated';
      pillSafety.textContent = 'ALERT: ESCALATED TO CONTACTS';
    } else {
      pillFireTV.className = 'periph-status-pill standby';
      pillFireTV.textContent = 'STANDBY (Playback Normal)';
      pillSlack.className = 'periph-status-pill standby';
      pillSlack.textContent = 'AVAILABLE (No DND)';
      pillSafety.className = 'periph-status-pill standby';
      pillSafety.textContent = 'MONITORING (Normal)';
    }
  }

  // Device Switching
  function switchDevice(device) {
    currentDevice = device;
    const isOrbit = device === 'orbit';

    btnOrbit?.classList.toggle('active', isOrbit);
    btnOrbit?.setAttribute('aria-checked', isOrbit ? 'true' : 'false');
    btnApple?.classList.toggle('active', !isOrbit);
    btnApple?.setAttribute('aria-checked', !isOrbit ? 'true' : 'false');

    if (orbitFrame && appleFrame) {
      orbitFrame.style.display = isOrbit ? 'flex' : 'none';
      appleFrame.style.display = isOrbit ? 'none' : 'flex';
    }

    if (activeClientLabel) {
      activeClientLabel.textContent = isOrbit ? 'Orbit nRF5340 (BLE 5.3)' : 'Apple Watch Series 9 (watchOS 10)';
      activeClientLabel.style.color = isOrbit ? '#fbbf24' : '#818cf8';
    }

    if (modeLabel) {
      modeLabel.textContent = isOrbit 
        ? 'Mode: AURA Orbit Hardware (Transflective MIP Display + Amber Ring)'
        : 'Mode: Apple Watch Companion (watchOS 10 SwiftUI + WCSession)';
    }

    triggerHaptic('click');
    logTelemetry('RELAY', `Device client changed to ${device}`, {
      client: isOrbit ? 'orbit_nrf5340' : 'apple_watch_series9',
      transport: isOrbit ? 'BLE_GATT_0xFE40' : 'WatchConnectivity_WCSession',
      policy_required: true
    });

    renderCurrentScenario();
  }

  btnOrbit?.addEventListener('click', () => switchDevice('orbit'));
  btnApple?.addEventListener('click', () => switchDevice('apple-watch'));

  // Quick Switch Buttons in Bento Cards
  document.querySelectorAll('[data-target-sim-device]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetDevice = e.currentTarget.getAttribute('data-target-sim-device');
      const simSection = document.getElementById('interactive-sim-lab');
      if (simSection) {
        simSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => switchDevice(targetDevice), 350);
    });
  });

  // Scenario Switching
  function switchScenario(scenario) {
    currentScenario = scenario;

    scenarioTabs.forEach(tab => {
      const isActive = tab.dataset.scenario === scenario;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Reset safety timer if leaving safety
    if (scenario !== 'safety' && safetyInterval) {
      clearInterval(safetyInterval);
      safetyInterval = null;
    }

    triggerHaptic('click');
    renderCurrentScenario();
  }

  tabT5?.addEventListener('click', () => switchScenario('t5'));
  tabFocus?.addEventListener('click', () => switchScenario('focus'));
  tabDistracted?.addEventListener('click', () => switchScenario('distracted'));
  tabSafety?.addEventListener('click', () => switchScenario('safety'));

  // Render Screen Content
  function renderCurrentScenario() {
    const targetSurface = currentDevice === 'orbit' ? orbitScreen : appleScreen;
    if (!targetSurface) return;

    if (currentScenario === 't5') {
      renderT5Screen(targetSurface);
    } else if (currentScenario === 'focus') {
      renderFocusScreen(targetSurface);
    } else if (currentScenario === 'distracted') {
      renderDistractedScreen(targetSurface);
    } else if (currentScenario === 'safety') {
      renderSafetyScreen(targetSurface);
    }
  }

  /* ------------------------------------------------------------------------
     1. SCENARIO: T-5 MEETING PREP
     ------------------------------------------------------------------------ */
  function renderT5Screen(surface) {
    if (amberRing) amberRing.querySelector('.amber-led-core').style.boxShadow = '0 0 14px #f59e0b';
    setPeripherals('normal');

    if (instructionLabel) {
      instructionLabel.innerHTML = 'Click <strong>Mark as Reviewed</strong> on the screen or press the crescent key / crown to acknowledge readiness.';
    }

    surface.innerHTML = `
      <div class="sim-screen-card" id="screen-t5-inner">
        <div class="screen-top-meta">
          <span class="screen-kicker-tag">T-5 Intelligence</span>
          <span class="screen-starts-pill">Starts in 5m</span>
        </div>
        <div class="screen-title-text">Sprint Alignment / AWS Bedrock Sync</div>
        <div class="screen-info-block">
          <div class="info-block-label">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Last Decision
          </div>
          <div class="info-block-val">Ship authenticated BLE relay before customer production rollout</div>
        </div>
        <div class="screen-questions-container">
          <div class="question-item">
            <span class="q-index-badge">1</span>
            <span>Fallback latency budget if DynamoDB throttles?</span>
          </div>
          <div class="question-item">
            <span class="q-index-badge">2</span>
            <span>Gate microphone recording purely at hardware level?</span>
          </div>
          <div class="question-item">
            <span class="q-index-badge">3</span>
            <span>Who approves emergency contact escalation?</span>
          </div>
        </div>
        <button type="button" class="screen-action-btn-primary" id="btn-t5-ack">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Mark as Reviewed</span>
        </button>
      </div>
    `;

    const ackBtn = surface.querySelector('#btn-t5-ack');
    ackBtn?.addEventListener('click', acknowledgeT5);

    logTelemetry('EVENT', 'T-5 Meeting Prep card rendered', {
      meeting: 'Sprint Alignment / AWS Bedrock Sync',
      startsInMinutes: 5,
      questionsCount: 3,
      model: 'anthropic.claude-3-5-sonnet'
    });
  }

  function acknowledgeT5() {
    triggerHaptic('ack');
    const surface = currentDevice === 'orbit' ? orbitScreen : appleScreen;
    const card = surface?.querySelector('#screen-t5-inner');
    if (card) {
      const btn = card.querySelector('#btn-t5-ack');
      if (btn) {
        btn.outerHTML = `
          <div class="ack-confirmed-banner">
            ✓ Acknowledged · Ready for Sprint (Tactile Cue Emitted)
          </div>
        `;
      }
    }
    logTelemetry('RELAY', 'T-5 Briefing acknowledged by user', {
      status: 'ACKNOWLEDGED',
      device: currentDevice,
      haptic_profile: 'DRV2605_DOUBLE_TAP'
    });
  }

  /* ------------------------------------------------------------------------
     2. SCENARIO: START FOCUS (DEEP WORK & AMBIENT DEFENSE)
     ------------------------------------------------------------------------ */
  function renderFocusScreen(surface) {
    setPeripherals('focus');
    isFocusRunning = true;

    if (amberRing) {
      amberRing.querySelector('.amber-led-core').style.boxShadow = '0 0 24px #fbbf24, 0 0 40px #f59e0b';
    }

    if (instructionLabel) {
      instructionLabel.innerHTML = 'Focus active: Notice <strong>Amazon Fire TV paused</strong> and <strong>Slack muted</strong> on the HUD. Click <strong>Report Distraction</strong> to test policy gate.';
    }

    function formatTime(s) {
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    }

    surface.innerHTML = `
      <div class="sim-screen-card">
        <div class="focus-active-center">
          <div class="focus-kicker-badge">
            <span class="eco-dot amber"></span>
            Deep Work Sprint Active
          </div>
          <div class="focus-timer-clock" id="sim-focus-countdown">${formatTime(focusSeconds)}</div>
          <div class="focus-timer-sub">remaining in protected block</div>
          <div class="focus-points-pill" id="sim-focus-points">+${deepWorkPoints} Deep Work Bank</div>
        </div>

        <div class="focus-connected-shield-box">
          ⚡ <strong>Peripheral Defense Interception:</strong><br>
          Fire TV playback paused · Slack DND active
        </div>

        <div class="focus-btn-strip">
          <button type="button" class="btn-distracted-trigger" id="btn-focus-distracted">
            I'm Distracted
          </button>
          <button type="button" class="btn-end-focus" id="btn-focus-end">
            End Focus
          </button>
        </div>
      </div>
    `;

    // Start timer interval
    if (focusInterval) clearInterval(focusInterval);
    focusInterval = setInterval(() => {
      if (focusSeconds > 0) {
        focusSeconds--;
        const clockEl = surface.querySelector('#sim-focus-countdown');
        if (clockEl) clockEl.textContent = formatTime(focusSeconds);
      }
    }, 1000);

    surface.querySelector('#btn-focus-distracted')?.addEventListener('click', () => {
      switchScenario('distracted');
    });

    surface.querySelector('#btn-focus-end')?.addEventListener('click', () => {
      clearInterval(focusInterval);
      focusInterval = null;
      setPeripherals('normal');
      switchScenario('t5');
      logTelemetry('EVENT', 'Focus session ended early by user', {
        remainingSeconds: focusSeconds,
        deepWorkPointsEarned: deepWorkPoints
      });
    });

    logTelemetry('POLICY', 'Focus Guardian engaged: ambient defense deployed', {
      sessionDurationMin: 25,
      firetv_pause: 'EXECUTED_REVERSIBLE',
      slack_dnd: 'ACTIVE_UNTIL_11:30',
      policy_required: true
    });
  }

  /* ------------------------------------------------------------------------
     3. SCENARIO: I'M DISTRACTED & 1-TAP REVERSIBLE UNDO
     ------------------------------------------------------------------------ */
  function renderDistractedScreen(surface) {
    setPeripherals('normal');

    if (instructionLabel) {
      instructionLabel.innerHTML = 'Distraction reported: Test <strong>1-Tap Intervention</strong> and verify the <strong>Undo Button</strong> reverses state deterministically.';
    }

    surface.innerHTML = `
      <div class="sim-screen-card" id="distracted-screen-card">
        <div class="distracted-header-warning">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Focus Check-In
        </div>

        <div class="distracted-policy-box">
          <div class="policy-source-tag">Bedrock Policy Suggestion</div>
          <div class="policy-suggestion-text" id="policy-suggestion-body">
            You reported distraction. Suggested intervention: Pause media, silence tabs, and take a 2-min mindful reset.
          </div>
        </div>

        <div class="distraction-actions-col" id="distraction-actions-container">
          <button type="button" class="btn-apply-intervention" id="btn-apply-intervention">
            Yes, Apply Intervention (1-Tap)
          </button>
          <button type="button" class="btn-end-focus" id="btn-dismiss-distraction">
            Dismiss &amp; Continue
          </button>
        </div>
      </div>
    `;

    const applyBtn = surface.querySelector('#btn-apply-intervention');
    const dismissBtn = surface.querySelector('#btn-dismiss-distraction');
    const actionsContainer = surface.querySelector('#distraction-actions-container');

    applyBtn?.addEventListener('click', () => {
      triggerHaptic('ack');
      distractionPending = true;

      if (actionsContainer) {
        actionsContainer.innerHTML = `
          <button type="button" class="btn-undo-intervention" id="btn-undo-intervention">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            <span>↩️ Undo Intervention (1-Tap)</span>
          </button>
          <div class="undo-feedback-msg">
            ✓ Intervention active. Undo available anytime.
          </div>
        `;

        actionsContainer.querySelector('#btn-undo-intervention')?.addEventListener('click', () => {
          triggerHaptic('click');
          distractionPending = false;
          actionsContainer.innerHTML = `
            <div class="undo-feedback-msg" style="border-color:#38bdf8; color:#7dd3fc; background:rgba(56,189,248,0.15);">
              ✓ Intervention undone! Returned to flow state.
            </div>
            <button type="button" class="btn-end-focus" style="margin-top:8px;" id="btn-return-focus">Return to Focus</button>
          `;
          actionsContainer.querySelector('#btn-return-focus')?.addEventListener('click', () => {
            switchScenario('focus');
          });

          logTelemetry('POLICY', 'Intervention REVERTED via 1-tap Undo', {
            undo_successful: true,
            reversible_audit: 'RECORDED_IN_DYNAMODB',
            policy_required: true
          });
        });
      }

      logTelemetry('POLICY', 'Distraction intervention applied by user', {
        action: 'PAUSE_MEDIA_2MIN_BREATH',
        reversible: true,
        undo_token: 'undo_' + Math.random().toString(36).substring(7)
      });
    });

    dismissBtn?.addEventListener('click', () => {
      switchScenario('focus');
    });

    logTelemetry('EVENT', 'Distraction check-in dialog initiated', {
      context: 'User pressed crescent key / distraction button'
    });
  }

  /* ------------------------------------------------------------------------
     4. SCENARIO: SAFETY CHECK-IN (30S TIMEOUT & ESCALATION)
     ------------------------------------------------------------------------ */
  function renderSafetyScreen(surface) {
    safetySeconds = 30;
    safetyEscalated = false;
    triggerHaptic('alert');

    if (instructionLabel) {
      instructionLabel.innerHTML = 'Safety check-in: <strong>30-second countdown active</strong>. Tap <strong>I\'m OK</strong> to confirm safety or let it expire / tap <strong>Notify Contacts</strong> to simulate emergency escalation.';
    }

    surface.innerHTML = `
      <div class="safety-screen-wrapper" id="safety-screen-card">
        <div class="safety-alert-title">
          <span class="eco-dot amber"></span>
          Are you okay?
        </div>
        <div class="safety-disclaimer-pill">
          Not medical advice. Not emergency detection. Solo work check-in.
        </div>

        <div class="safety-progress-bar-wrap">
          <div class="safety-progress-bar-fill" id="safety-progress-bar" style="width: 100%;"></div>
        </div>

        <div class="safety-timer-readout">
          <span>Check-in response window</span>
          <span class="safety-timer-digits" id="safety-digits-text">30s</span>
        </div>

        <div class="safety-actions-grid" id="safety-actions-box">
          <button type="button" class="btn-safety-ok" id="btn-safety-ok">
            I'm OK
          </button>
          <button type="button" class="btn-safety-escalate" id="btn-safety-escalate">
            Notify Contacts (Emergency Relay)
          </button>
        </div>
      </div>
    `;

    const barEl = surface.querySelector('#safety-progress-bar');
    const digitsEl = surface.querySelector('#safety-digits-text');
    const okBtn = surface.querySelector('#btn-safety-ok');
    const escalateBtn = surface.querySelector('#btn-safety-escalate');
    const actionsBox = surface.querySelector('#safety-actions-box');

    // Run 30s countdown
    if (safetyInterval) clearInterval(safetyInterval);
    safetyInterval = setInterval(() => {
      if (safetySeconds > 0) {
        safetySeconds--;
        if (digitsEl) {
          digitsEl.textContent = `${safetySeconds}s`;
          if (safetySeconds <= 10) {
            digitsEl.classList.add('danger');
            barEl?.classList.add('danger');
          }
        }
        if (barEl) {
          barEl.style.width = `${(safetySeconds / 30) * 100}%`;
        }
      } else {
        // Timed out -> Escalation
        clearInterval(safetyInterval);
        safetyInterval = null;
        triggerSafetyEscalation('TIMEOUT_30S_EXPIRED');
      }
    }, 1000);

    okBtn?.addEventListener('click', () => {
      clearInterval(safetyInterval);
      safetyInterval = null;
      triggerHaptic('ack');
      setPeripherals('normal');

      if (actionsBox) {
        actionsBox.innerHTML = `
          <div class="ack-confirmed-banner">
            ✓ Check-in resolved: Safety confirmed.
          </div>
          <button type="button" class="btn-end-focus" style="margin-top:6px;" id="btn-safety-done">Return to Overview</button>
        `;
        actionsBox.querySelector('#btn-safety-done')?.addEventListener('click', () => {
          switchScenario('t5');
        });
      }

      logTelemetry('RELAY', 'Safety check-in RESOLVED: User clicked I\'m OK', {
        status: 'RESOLVED_HEALTHY',
        responseTimeSec: 30 - safetySeconds,
        escalation: 'CANCELLED'
      });
    });

    escalateBtn?.addEventListener('click', () => {
      clearInterval(safetyInterval);
      safetyInterval = null;
      triggerSafetyEscalation('USER_MANUAL_DISPATCH');
    });

    function triggerSafetyEscalation(reason) {
      safetyEscalated = true;
      triggerHaptic('alert');
      setPeripherals('safety_escalated');

      if (actionsBox) {
        actionsBox.innerHTML = `
          <div class="safety-escalated-banner">
            ⚠️ <strong>Emergency Contacts Dispatched</strong><br>
            SMS alert &amp; AWS SNS push sent to pre-approved contacts via Mobile Bridge.<br>
            <span style="font-size:0.6rem; opacity:0.8;">Reason: ${reason}</span>
          </div>
          <button type="button" class="btn-end-focus" style="margin-top:8px;" id="btn-reset-safety">Reset Simulator</button>
        `;
        actionsBox.querySelector('#btn-reset-safety')?.addEventListener('click', () => {
          setPeripherals('normal');
          switchScenario('t5');
        });
      }

      logTelemetry('WARN', 'SAFETY GUARDIAN ESCALATED', {
        reason: reason,
        recipients: ['Aditya Shinde (Emergency Contact #1)', 'Core Response Relay'],
        channel: 'AWS_SNS_SMS_AND_APNS',
        mobile_bridge: 'RELAY_SUCCESS_200_OK'
      });
    }

    logTelemetry('WARN', 'Safety check-in initiated (HealthKit / IMU event)', {
      trigger: 'INACTIVITY_OR_SHOCK_DETECTED',
      countdownSeconds: 30,
      opt_in: true
    });
  }

  // Physical Button Listeners (Tactile Crescent Key & Apple Digital Crown)
  crescentKey?.addEventListener('click', () => {
    triggerHaptic('click');
    if (currentScenario === 't5') {
      acknowledgeT5();
    } else if (currentScenario === 'focus') {
      switchScenario('distracted');
    } else if (currentScenario === 'distracted') {
      const applyBtn = orbitScreen?.querySelector('#btn-apply-intervention');
      if (applyBtn) applyBtn.click();
      else switchScenario('focus');
    } else if (currentScenario === 'safety') {
      const okBtn = orbitScreen?.querySelector('#btn-safety-ok');
      if (okBtn) okBtn.click();
    }
  });

  digitalCrown?.addEventListener('click', () => {
    triggerHaptic('click');
    // Cycle scenarios on Apple Watch Digital Crown press
    const order = ['t5', 'focus', 'distracted', 'safety'];
    const nextIdx = (order.indexOf(currentScenario) + 1) % order.length;
    switchScenario(order[nextIdx]);
  });

  sideButton?.addEventListener('click', () => {
    triggerHaptic('click');
    if (currentScenario === 'distracted') {
      const undoBtn = appleScreen?.querySelector('#btn-undo-intervention');
      if (undoBtn) undoBtn.click();
    } else if (currentScenario === 'safety') {
      const okBtn = appleScreen?.querySelector('#btn-safety-ok');
      if (okBtn) okBtn.click();
    }
  });

  // Initial Boot
  logTelemetry('RELAY', 'AURA Multi-Device Simulation Lab Online', {
    clients: ['orbit_wearable_nrf5340', 'apple_watch_watchos10', 'mobile_bridge_expo'],
    status: 'AUTHENTICATED_BLE_READY',
    backend: 'AWS_BEDROCK_CLAUDE_3_5'
  });

  renderCurrentScenario();
}

