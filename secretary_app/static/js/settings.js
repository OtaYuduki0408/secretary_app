(() => {
  const defaultSettings = {
    general: {
      fontFamily: '',
    },
    main: {
      backgroundColor: '#0b1f38',
      voiceName: '',
      tone: '',
    },
    character: {
      enabled: true,
      size: 220,
      color: '#B1D656',
    },
  };

  const elements = {
    fontFamily: document.getElementById('font-family'),
    mainBgColor: document.getElementById('main-bg-color'),
    toneSetting: document.getElementById('tone-setting'),
    voiceSelect: document.getElementById('voice-select'),
    characterEnabled: document.getElementById('character-enabled'),
    characterSize: document.getElementById('character-size'),
    characterSizeValue: document.getElementById('character-size-value'),
    characterColor: document.getElementById('character-color'),
  };

  const loadSettings = () => {
    try {
      const raw = localStorage.getItem('appSettings');
      if (!raw) return { ...defaultSettings };
      const stored = JSON.parse(raw);
      return {
        general: { ...defaultSettings.general, ...(stored.general || {}) },
        main: { ...defaultSettings.main, ...(stored.main || {}) },
        character: { ...defaultSettings.character, ...(stored.character || {}) },
      };
    } catch (e) {
      console.warn('設定の読み込みに失敗しました。', e);
      return { ...defaultSettings };
    }
  };

  const saveSettings = (settings) => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
  };

  const applyToPage = (settings) => {
    document.documentElement.style.setProperty('--app-font', settings.general.fontFamily || '');
    if (settings.main.backgroundColor) {
      document.body.style.backgroundColor = settings.main.backgroundColor;
      document.body.style.backgroundImage = 'none';
    }
  };

  const updateSizeLabel = (value) => {
    if (elements.characterSizeValue) {
      elements.characterSizeValue.textContent = `${value}px`;
    }
  };

  const populateVoices = (settings) => {
    if (!elements.voiceSelect) return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    const voices = synth.getVoices();
    elements.voiceSelect.innerHTML = '<option value="">自動（既定）</option>';
    voices.forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      elements.voiceSelect.appendChild(option);
    });
    if (settings.main.voiceName) {
      elements.voiceSelect.value = settings.main.voiceName;
    }
  };

  const previewVoice = (voiceName) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (synth.speaking) {
      synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance('この声でよろしいですか？');
    if (voiceName) {
      const voices = synth.getVoices();
      const selectedVoice = voices.find((voice) => voice.name === voiceName);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    synth.speak(utterance);
  };

  const settings = loadSettings();

  if (elements.fontFamily) elements.fontFamily.value = settings.general.fontFamily;
  if (elements.mainBgColor) elements.mainBgColor.value = settings.main.backgroundColor;
  if (elements.toneSetting) elements.toneSetting.value = settings.main.tone || '';
  if (elements.voiceSelect) elements.voiceSelect.value = settings.main.voiceName;
  if (elements.characterEnabled) elements.characterEnabled.checked = settings.character.enabled !== false;
  if (elements.characterSize) elements.characterSize.value = settings.character.size;
  if (elements.characterColor) elements.characterColor.value = settings.character.color;
  updateSizeLabel(settings.character.size);
  applyToPage(settings);

  populateVoices(settings);
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => populateVoices(loadSettings());
  }

  elements.fontFamily?.addEventListener('change', (event) => {
    settings.general.fontFamily = event.target.value;
    saveSettings(settings);
    applyToPage(settings);
  });

  elements.mainBgColor?.addEventListener('change', (event) => {
    settings.main.backgroundColor = event.target.value;
    saveSettings(settings);
    applyToPage(settings);
  });

  elements.toneSetting?.addEventListener('input', (event) => {
    settings.main.tone = event.target.value;
    saveSettings(settings);
  });

  elements.voiceSelect?.addEventListener('change', (event) => {
    settings.main.voiceName = event.target.value;
    saveSettings(settings);
    previewVoice(settings.main.voiceName);
  });

  elements.characterEnabled?.addEventListener('change', (event) => {
    settings.character.enabled = event.target.checked;
    saveSettings(settings);
  });

  elements.characterSize?.addEventListener('input', (event) => {
    settings.character.size = Number(event.target.value || 220);
    updateSizeLabel(settings.character.size);
    saveSettings(settings);
  });

  elements.characterColor?.addEventListener('change', (event) => {
    settings.character.color = event.target.value;
    saveSettings(settings);
  });
})();
