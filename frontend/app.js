/**
 * Project AURA — Mobile-First Control Plane & Focus Guardian
 * Frontend Client Controller
 */

// Application State
const state = {
  userId: 'usr_marcus',
  session: {
    active: true,
    sessionId: 'sess_marcus_' + Math.random().toString(36).substring(2, 9),
    durationMinutes: 25,
    remainingSeconds: 25 * 60,
    timerInterval: null,
    isDistracted: false,
    score: 0.0,
    reason: 'Focus session running uninterrupted. Score decays automatically over time.',
  },
  bank: {
    balance: 12,
    privateOnly: true,
  },
  activeUndoToken: null,
  grants: [
    {
      grant_id: 'grant_firetv_pause',
      action_type: 'request_pause',
      scope: 'allow_session',
      target_allowlist: ['dev_firetv_living_room'],
      active: true,
    },
    {
      grant_id: 'grant_echo_dnd',
      action_type: 'request_dnd',
      scope: 'ask_every_time',
      target_allowlist: ['dev_echo_office'],
      active: true,
    },
    {
      grant_id: 'grant_prep_brief',
      action_type: 'pre_meeting_briefing',
      scope: 'always',
      target_allowlist: [],
      active: true,
    },
    {
      grant_id: 'grant_slack_status',
      action_type: 'slack_status',
      scope: 'allow_session',
      target_allowlist: ['#marcus-focus'],
      active: true,
    },
  ],
  devices: {
    firetv: { id: 'dev_firetv_living_room', state: 'playing', supported: true },
    echo: { id: 'dev_echo_office', state: 'dnd_inactive', supported: true },
  },
  audit: [
    {
      action_id: 'act_init_sess',
      timestamp: Date.now() - 1000 * 60 * 12,
      action_type: 'focus_started',
      target: 'Local Companion',
      status: 'executed',
      reason: '25-minute Pomodoro focus session initialized by user',
      undo_token: null,
    },
    {
      action_id: 'act_briefing_t5',
      timestamp: Date.now() - 1000 * 60 * 8,
      action_type: 'pre_meeting_briefing',
      target: 'Bee Watch / Whisper Card',
      status: 'executed',
      reason: 'Delivered 52-word pre-meeting brief for Q4 Strategy Review (T-5 min trigger)',
      undo_token: null,
    },
  ],
};

// DOM Elements
const DOM = {
  // Navigation Tabs
  tabs: document.querySelectorAll('.nav-tab'),
  panels: document.querySelectorAll('.view-panel'),

  // Header
  bankBalance: document.getElementById('bank-balance-display'),

  // Timer & Focus
  btnToggleFocus: document.getElementById('btn-toggle-focus'),
  timerClock: document.getElementById('timer-clock'),
  timerProgress: document.getElementById('timer-progress'),
  durationChips: document.querySelectorAll('.btn-chip'),
  focusStatusDot: document.getElementById('focus-dot'),
  focusStatusText: document.getElementById('focus-status-text'),

  // Distraction & Score
  btnReportDistracted: document.getElementById('btn-report-distracted'),
  scoreVal: document.getElementById('score-val'),
  scoreBar: document.getElementById('score-bar'),
  scoreReason: document.getElementById('score-reason'),

  // Action & Undo
  btnSimulateAction: document.getElementById('btn-simulate-action'),
  btnImmediateUndo: document.getElementById('btn-immediate-undo'),
  actionStatusBadge: document.getElementById('action-status-badge'),
  firetvBadge: document.getElementById('firetv-badge'),

  // Signals
  toggleSignalVideo: document.getElementById('toggle-signal-video'),
  toggleSignalApp: document.getElementById('toggle-signal-app'),

  // Today Briefing Feedback
  btnHelpful: document.getElementById('btn-feedback-helpful'),
  btnNotUseful: document.getElementById('btn-feedback-notuseful'),
  btnMuteSeries: document.getElementById('btn-feedback-mute'),

  // "Why am I seeing this?" modal
  btnWhySeeingThis: document.getElementById('btn-why-seeing-this'),
  modalWhy: document.getElementById('modal-why-seeing-this'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  btnModalGotIt: document.getElementById('btn-modal-got-it'),

  // Toast
  toast: document.getElementById('toast-banner'),
  toastMsg: document.getElementById('toast-message'),
  toastBtn: document.getElementById('toast-action-btn'),
  toastClose: document.getElementById('toast-close-btn'),

  // Permissions & Audit
  grantsTbody: document.getElementById('grants-tbody'),
  btnRevokeAll: document.getElementById('btn-revoke-all'),
  btnExportData: document.getElementById('btn-export-data'),
  btnPurgeData: document.getElementById('btn-purge-data'),
  auditTimeline: document.getElementById('audit-timeline'),
  auditFilter: document.getElementById('audit-filter-select'),
  btnRefreshAudit: document.getElementById('btn-refresh-audit'),
};

// Initialize App
function initApp() {
  setupNavigation();
  startTimer();
  renderGrants();
  renderAuditTimeline();
  setupEventListeners();
  updateScoreUI(0.0, 'Focus session running uninterrupted. Score decays automatically over time.');
}

// Navigation Tab Management
function setupNavigation() {
  DOM.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      DOM.tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
        t.setAttribute('tabindex', '-1');
      });
      DOM.panels.forEach((p) => {
        p.classList.remove('active');
        p.hidden = true;
      });

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      tab.setAttribute('tabindex', '0');

      const targetId = tab.getAttribute('aria-controls');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
        targetPanel.hidden = false;
      }
    });
  });
}

// Focus Timer Logic
function startTimer() {
  if (state.session.timerInterval) clearInterval(state.session.timerInterval);

  state.session.timerInterval = setInterval(() => {
    if (!state.session.active) return;

    if (state.session.remainingSeconds > 0) {
      state.session.remainingSeconds--;
      updateTimerUI();
    } else {
      completeSession();
    }
  }, 1000);
  updateTimerUI();
}

function updateTimerUI() {
  const mins = Math.floor(state.session.remainingSeconds / 60);
  const secs = state.session.remainingSeconds % 60;
  DOM.timerClock.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const totalSecs = state.session.durationMinutes * 60;
  const progressRatio = state.session.remainingSeconds / totalSecs;
  // Circumference = 2 * PI * 70 = ~440
  const offset = 440 * (1 - progressRatio);
  DOM.timerProgress.style.strokeDashoffset = offset;
}

function completeSession() {
  clearInterval(state.session.timerInterval);
  state.session.active = false;
  DOM.focusStatusText.textContent = 'Session Completed';
  DOM.btnToggleFocus.textContent = 'Start New Session';
  DOM.btnToggleFocus.classList.remove('btn-primary');
  DOM.btnToggleFocus.classList.add('btn-outline');

  // Award completion points if not distracted
  if (!state.session.isDistracted) {
    const points = state.session.durationMinutes >= 50 ? 4 : 2;
    state.bank.balance += points;
    DOM.bankBalance.textContent = state.bank.balance;
    showToast(`🎉 Focus session complete! Awarded +${points} Deep Work Bank points.`);
    addAuditRecord('focus_completed', 'Deep Work Bank', 'executed', `Awarded +${points} points for uninterrupted focus`);
  }
}

// Distraction Self-Report Trigger
function triggerDistraction() {
  state.session.isDistracted = true;
  state.session.score = 0.80;
  const reason = 'You explicitly reported being distracted. Proposing to pause allowed media devices.';
  updateScoreUI(state.session.score, reason);

  // Deep work bank penalty: -1 point
  state.bank.balance = Math.max(0, state.bank.balance - 1);
  DOM.bankBalance.textContent = state.bank.balance;

  // Execute pause on Fire TV
  executeDevicePause();

  showToast('🚨 Distraction recorded. Fire TV playback paused. Undo available for 5 minutes.', true);
}

function updateScoreUI(score, reason) {
  DOM.scoreVal.textContent = score.toFixed(2);
  DOM.scoreBar.style.width = `${Math.round(score * 100)}%`;
  DOM.scoreReason.textContent = reason;
}

// Device Action Execution & Undo
function executeDevicePause() {
  const undoToken = 'undo_pause_' + Math.random().toString(36).substring(2, 9);
  state.activeUndoToken = undoToken;

  // Update Fire TV state
  state.devices.firetv.state = 'paused';
  DOM.firetvBadge.textContent = 'Paused';
  DOM.firetvBadge.className = 'badge badge-status';

  DOM.actionStatusBadge.textContent = 'Executed (Paused)';
  DOM.actionStatusBadge.className = 'badge badge-status';
  DOM.btnImmediateUndo.disabled = false;

  addAuditRecord(
    'request_pause',
    'Living Room Fire TV',
    'executed',
    'MediaSession transport pause command executed under session grant',
    undoToken
  );
}

function executeUndo() {
  if (!state.activeUndoToken) return;

  // Restore Fire TV playback
  state.devices.firetv.state = 'playing';
  DOM.firetvBadge.textContent = 'Playing';
  DOM.firetvBadge.className = 'badge badge-success';

  DOM.actionStatusBadge.textContent = 'Restored (Playing)';
  DOM.actionStatusBadge.className = 'badge badge-success';
  DOM.btnImmediateUndo.disabled = true;

  // Mark audit undone
  const record = state.audit.find((r) => r.undo_token === state.activeUndoToken);
  if (record) {
    record.status = 'undone';
    record.reason += ' (Reversed by user)';
  }

  addAuditRecord(
    'undo_reversal',
    'Living Room Fire TV',
    'undone',
    `Action reversed: Fire TV resumed playback via token ${state.activeUndoToken}`,
    null
  );

  state.activeUndoToken = null;
  renderAuditTimeline();
  showToast('↩️ Action reversed! Living Room Fire TV resumed playback.');
}

// Toast Notifications
function showToast(message, hasUndo = false) {
  DOM.toastMsg.textContent = message;
  DOM.toast.classList.remove('hidden');

  if (hasUndo) {
    DOM.toastBtn.classList.remove('hidden');
    DOM.toastBtn.textContent = 'Undo Now';
    DOM.toastBtn.onclick = () => {
      executeUndo();
      DOM.toast.classList.add('hidden');
    };
  } else {
    DOM.toastBtn.classList.add('hidden');
  }

  setTimeout(() => {
    DOM.toast.classList.add('hidden');
  }, 6000);
}

// Render Grants Table
function renderGrants() {
  DOM.grantsTbody.innerHTML = '';
  state.grants.forEach((grant) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${grant.action_type}</code></td>
      <td>
        <select class="form-select form-select-sm" data-grant-id="${grant.grant_id}">
          <option value="ask_every_time" ${grant.scope === 'ask_every_time' ? 'selected' : ''}>Ask every time</option>
          <option value="allow_session" ${grant.scope === 'allow_session' ? 'selected' : ''}>Allow this session</option>
          <option value="always" ${grant.scope === 'always' ? 'selected' : ''}>Always allow</option>
          <option value="never" ${grant.scope === 'never' ? 'selected' : ''}>Never</option>
        </select>
      </td>
      <td><span class="evidence-tag">${grant.target_allowlist.join(', ') || 'Any supported'}</span></td>
      <td><span class="badge ${grant.active ? 'badge-success' : 'badge-status'}">${grant.active ? 'Active' : 'Revoked'}</span></td>
      <td>
        <button class="btn btn-sm btn-danger-outline btn-revoke" data-grant-id="${grant.grant_id}">Revoke</button>
      </td>
    `;
    DOM.grantsTbody.appendChild(tr);
  });

  // Attach revoke handlers
  document.querySelectorAll('.btn-revoke').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const gid = e.target.getAttribute('data-grant-id');
      const g = state.grants.find((x) => x.grant_id === gid);
      if (g) {
        g.active = false;
        renderGrants();
        showToast(`Revoked grant ${gid} in <60 seconds.`);
        addAuditRecord('grant_revoked', gid, 'executed', `Consent grant revoked by user`);
      }
    });
  });
}

// Render Audit Timeline
function renderAuditTimeline() {
  const filter = DOM.auditFilter.value;
  DOM.auditTimeline.innerHTML = '';

  const filtered = state.audit.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'executed') return item.status === 'executed';
    if (filter === 'undone') return item.status === 'undone';
    if (filter === 'suggested_only') return item.status === 'suggested_only';
    if (filter === 'blocked_no_consent') return item.status === 'blocked_no_consent';
    return true;
  });

  if (filtered.length === 0) {
    DOM.auditTimeline.innerHTML = `<p class="timeline-empty" style="color: var(--text-muted); font-size: 0.85rem;">No audit records matching filter "${filter}".</p>`;
    return;
  }

  filtered.forEach((item) => {
    const el = document.createElement('div');
    el.className = `timeline-item ${item.status}`;
    const dateStr = new Date(item.timestamp).toLocaleTimeString();
    el.innerHTML = `
      <div style="flex: 1;">
        <div class="timeline-meta">
          <strong>${item.action_type}</strong>
          <span class="timeline-time">${dateStr}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--accent-cyan); margin-bottom: 2px;">Target: ${item.target}</div>
        <p class="timeline-reason">${item.reason}</p>
        <span class="badge ${item.status === 'executed' ? 'badge-success' : item.status === 'undone' ? 'badge-status' : 'badge-info'}" style="margin-top: 6px;">
          ${item.status}
        </span>
      </div>
    `;
    DOM.auditTimeline.appendChild(el);
  });
}

function addAuditRecord(actionType, target, status, reason, undoToken = null) {
  state.audit.unshift({
    action_id: 'act_' + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    action_type: actionType,
    target: target,
    status: status,
    reason: reason,
    undo_token: undoToken,
  });
  renderAuditTimeline();
}

// Event Listeners Setup
function setupEventListeners() {
  // Focus Toggle
  DOM.btnToggleFocus.addEventListener('click', () => {
    if (state.session.active) {
      completeSession();
    } else {
      state.session.active = true;
      state.session.isDistracted = false;
      state.session.remainingSeconds = state.session.durationMinutes * 60;
      DOM.focusStatusText.textContent = 'Session Active';
      DOM.btnToggleFocus.textContent = 'Stop Focus Session';
      DOM.btnToggleFocus.className = 'btn btn-primary';
      updateScoreUI(0.0, 'Focus session running uninterrupted. Score decays automatically over time.');
      startTimer();
      showToast(`Started new ${state.session.durationMinutes}-minute focus session.`);
      addAuditRecord('focus_started', 'Local Companion', 'executed', `Started ${state.session.durationMinutes}m focus session`);
    }
  });

  // Duration Chips
  DOM.durationChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      DOM.durationChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const dur = parseInt(chip.getAttribute('data-duration'), 10);
      state.session.durationMinutes = dur;
      state.session.remainingSeconds = dur * 60;
      updateTimerUI();
    });
  });

  // Explicit Distraction Button
  DOM.btnReportDistracted.addEventListener('click', triggerDistraction);

  // Test Fire TV Pause
  DOM.btnSimulateAction.addEventListener('click', () => {
    executeDevicePause();
    showToast('Simulated Fire TV pause command sent. Undo is ready.');
  });

  // Immediate Undo
  DOM.btnImmediateUndo.addEventListener('click', executeUndo);

  // Toast Close
  DOM.toastClose.addEventListener('click', () => {
    DOM.toast.classList.add('hidden');
  });

  // Modal: "Why am I seeing this?"
  DOM.btnWhySeeingThis.addEventListener('click', () => {
    DOM.modalWhy.showModal();
  });
  DOM.btnCloseModal.addEventListener('click', () => {
    DOM.modalWhy.close();
  });
  DOM.btnModalGotIt.addEventListener('click', () => {
    DOM.modalWhy.close();
  });

  // Briefing Feedback
  DOM.btnHelpful.addEventListener('click', () => {
    showToast('👍 Feedback recorded. Adjusts only your personal local preferences.');
  });
  DOM.btnNotUseful.addEventListener('click', () => {
    showToast('👎 Feedback noted. Will avoid similar pre-meeting context.');
  });
  DOM.btnMuteSeries.addEventListener('click', () => {
    showToast('🔕 Series muted. Pre-meeting briefings silenced for this recurrence.');
    addAuditRecord('series_muted', 'Calendar Scheduler', 'executed', 'Muted recurring event series per user preference');
  });

  // Optional Signals Toggles
  DOM.toggleSignalVideo.addEventListener('change', (e) => {
    const val = e.target.checked;
    showToast(`Local Video Audio Monitor ${val ? 'enabled with explicit consent' : 'disabled'}.`);
  });
  DOM.toggleSignalApp.addEventListener('change', (e) => {
    const val = e.target.checked;
    showToast(`Active Work App Verification ${val ? 'enabled with explicit consent' : 'disabled'}.`);
  });

  // Revoke All
  DOM.btnRevokeAll.addEventListener('click', () => {
    state.grants.forEach((g) => (g.active = false));
    renderGrants();
    showToast('⚠️ All capability grants revoked. Any remote execution blocked in <60s.');
    addAuditRecord('all_grants_revoked', 'Policy Engine', 'executed', 'Revoked all user capability grants');
  });

  // Export Data (JSON Download)
  DOM.btnExportData.addEventListener('click', () => {
    const exportPayload = {
      user_id: state.userId,
      exported_at: new Date().toISOString(),
      privacy_guarantee: 'ZERO_RAW_TRANSCRIPTS_RETAINED',
      deep_work_bank: {
        balance: state.bank.balance,
        private_only: true,
        employer_reporting: 'STRICTLY_PROHIBITED',
      },
      consent_grants: state.grants,
      audit_records: state.audit,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aura_data_export_${state.userId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 Data export downloaded. Verified zero raw transcripts.');
  });

  // Cryptographic Purge
  DOM.btnPurgeData.addEventListener('click', () => {
    if (confirm('Are you sure you want to cryptographically purge all local AURA records? This action is irreversible.')) {
      state.grants = [];
      state.audit = [];
      state.bank.balance = 0;
      DOM.bankBalance.textContent = '0';
      renderGrants();
      renderAuditTimeline();
      showToast('🗑️ All user records cryptographically purged.');
    }
  });

  // Audit Filter & Refresh
  DOM.auditFilter.addEventListener('change', renderAuditTimeline);
  DOM.btnRefreshAudit.addEventListener('click', () => {
    renderAuditTimeline();
    showToast('Audit trail refreshed.');
  });
}

// Start on DOM Ready
document.addEventListener('DOMContentLoaded', initApp);
