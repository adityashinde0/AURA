/**
 * Project AURA — Landing Page Interactive Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // 0. Theme Switcher (Light / Dark)
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeLabel = document.getElementById('theme-toggle-label');

  function updateThemeUI(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aura-color-theme', theme);
    if (themeLabel) {
      themeLabel.textContent = theme === 'light' ? 'Dark' : 'Light';
    }
  }

  const currentTheme = localStorage.getItem('aura-color-theme') || 'dark';
  updateThemeUI(currentTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = activeTheme === 'light' ? 'dark' : 'light';
      updateThemeUI(newTheme);
    });
  }

  // 1. Yellow Bento Card Tab Switcher
  const tabItems = document.querySelectorAll('.yellow-tab-item');
  const focusTitle = document.getElementById('yellow-focus-title');
  const focusDesc = document.getElementById('yellow-focus-desc');

  const yellowTabContent = [
    {
      title: "Aura turns moments into focus",
      desc: "Bee remembers what you forgot. AURA anticipates what you're about to forget, and stops the world from distracting your deep work flow."
    },
    {
      title: "Aura prepares you before the moment",
      desc: "Most meeting tools help after the meeting is over. AURA pre-briefs you at T-5 with synthesized context, tone calibration, and 3 high-impact questions to ask."
    },
    {
      title: "Aura is ready when you need it",
      desc: "Need to silence distractions? Have a question about your focus trends? Want to leave a quick thought for later? Talk to AURA through the wearable companion, web control plane, or Apple Watch."
    }
  ];

  function selectYellowTab(index) {
    if (!yellowTabContent[index]) return;
    tabItems.forEach((t, i) => {
      const isSelected = i === index;
      t.classList.toggle('active', isSelected);
      t.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    if (focusTitle && focusDesc) {
      focusTitle.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
      focusDesc.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
      focusTitle.style.opacity = '0';
      focusTitle.style.transform = 'translateY(4px)';
      focusDesc.style.opacity = '0';
      focusDesc.style.transform = 'translateY(4px)';

      setTimeout(() => {
        focusTitle.textContent = yellowTabContent[index].title;
        focusDesc.textContent = yellowTabContent[index].desc;
        focusTitle.style.opacity = '1';
        focusTitle.style.transform = 'translateY(0)';
        focusDesc.style.opacity = '1';
        focusDesc.style.transform = 'translateY(0)';
      }, 150);
    }
  }

  tabItems.forEach((tab, index) => {
    tab.addEventListener('click', () => selectYellowTab(index));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectYellowTab(index);
      }
    });
  });

  // 2. Interactive To-Dos / Focus Actions
  const todoItems = document.querySelectorAll('.todo-main-row');
  todoItems.forEach(row => {
    row.addEventListener('click', () => {
      const checkbox = row.querySelector('.todo-checkbox');
      const label = row.querySelector('.todo-label');
      
      if (checkbox && label) {
        checkbox.classList.toggle('checked');
        label.classList.toggle('completed');
      }
    });
  });

  // 3. Interactive Chat Suggestions
  const suggestionPills = document.querySelectorAll('.suggestion-pill');
  const chatBubbleUser = document.querySelector('.bubble-dark-user');
  const chatAiResponse = document.getElementById('chat-ai-response-text');

  const responses = {
    "What were yesterday's architecture decisions?": {
      user: "Show decisions from yesterday's AWS architecture sync",
      ai: "3 key decisions: 1) Bedrock Claude 3.5 Sonnet request token cap set to 1,000. 2) DynamoDB single-table TTL set to 30 days. 3) Alexa Fire TV pause adapter verified with reversible undo."
    },
    "Prepare me for the 10:00 AM platform review": {
      user: "Prepare me for the 10:00 AM AWS platform review",
      ai: "Synthesized T-5 brief ready. Tone calibrated to constructive technical review. Prepared 3 questions on client-side minimization, capability adapter fallback, and SQS DLQ retry policies."
    },
    "Check my Deep Work Bank & focus stats": {
      user: "Show my Deep Work Bank focus score for this week",
      ai: "You guarded 18 deep work blocks (450 total minutes) this week. Deep Work Bank balance: +36 points earned. This data is strictly private and never exposed to employers."
    }
  };

  suggestionPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const text = pill.textContent.trim();
      if (responses[text]) {
        if (chatBubbleUser) {
          chatBubbleUser.textContent = `"${responses[text].user}"`;
        }
        if (chatAiResponse) {
          chatAiResponse.textContent = responses[text].ai;
        }
      }
    });
  });
});
