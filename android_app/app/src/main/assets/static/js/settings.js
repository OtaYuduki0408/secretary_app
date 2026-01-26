(() => {
  const defaultSettings = {
    general: {
      fontFamily: '',
    },
    main: {
      backgroundColor: '#0b1f38',
      voiceName: '',
      toneResponse: '友達ロボット風',
      toneError: '',
      voiceRate: 1.4,
      voicePitch: 1.2,
      voiceVolume: 1,
      voiceTestText: '僕はサイレントメイト君だよ',
      stripeColor: '#7aa8ff',
      buttonColor: '#7aa8ff',
      wakeWords: 'サイレントメイト,サイレントメイト君,さいれんとめいと,silentmate,ボイスメイト',
      inputConfirmEnabled: true,
      inputConfirmTemplate: 'だね、ちょっと待ってね！',
    },
    character: {
      enabled: false,
      size: 220,
      color: '#B1D656',
    },
    theme: {
      accentColor: '#7aa8ff',
      mutedColor: '#cdd6df',
      template: '',
    },
  };

  const elements = {
    fontFamily: document.getElementById('font-family'),
    colorTemplate: document.getElementById('color-template'),
    accentColor: document.getElementById('accent-color'),
    mutedColor: document.getElementById('muted-color'),
    mainBgColor: document.getElementById('main-bg-color'),
    wakeWord: document.getElementById('wake-word'),
    stripeColor: document.getElementById('stripe-color'),
    mainButtonColor: document.getElementById('main-button-color'),
    inputConfirmEnabled: document.getElementById('input-confirm-enabled'),
    inputConfirmTemplate: document.getElementById('input-confirm-template'),
    toneResponse: document.getElementById('tone-response'),
    toneError: document.getElementById('tone-error'),
    voiceSelect: document.getElementById('voice-select'),
    voiceRate: document.getElementById('voice-rate'),
    voiceRateValue: document.getElementById('voice-rate-value'),
    voicePitch: document.getElementById('voice-pitch'),
    voicePitchValue: document.getElementById('voice-pitch-value'),
    voiceVolume: document.getElementById('voice-volume'),
    voiceVolumeValue: document.getElementById('voice-volume-value'),
    voiceTestText: document.getElementById('voice-test-text'),
    voiceTestButton: document.getElementById('voice-test-button'),
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
        theme: { ...defaultSettings.theme, ...(stored.theme || {}) },
      };
    } catch (e) {
      console.warn('設定の読み込みに失敗しました。', e);
      return { ...defaultSettings };
    }
  };

  const saveSettings = (settings) => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
  };

  const debounce = (fn, wait = 600) => {
    let timerId;
    return (...args) => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => fn(...args), wait);
    };
  };

  const applyToPage = (settings) => {
    document.documentElement.style.setProperty('--app-font', settings.general.fontFamily || '');
    document.body.style.fontFamily = settings.general.fontFamily || '';
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

  const previewVoice = (voiceName, textOverride) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (synth.speaking) {
      synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(textOverride || 'この声でよろしいですか？');
    if (voiceName) {
      const voices = synth.getVoices();
      const selectedVoice = voices.find((voice) => voice.name === voiceName);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    utterance.rate = settings.main.voiceRate ?? 1;
    utterance.pitch = settings.main.voicePitch ?? 1;
    utterance.volume = settings.main.voiceVolume ?? 1;
    synth.speak(utterance);
  };

  let settings = loadSettings();
  let applyingRemote = false;

  const saveToServer = async () => {
    if (applyingRemote) return;
    try {
      if (window.AndroidSync?.request) {
          await window.AndroidSync.request('PUT', '/api/user_settings', { settings });
      }
    } catch (e) {
      console.warn('設定の保存に失敗しました。', e);
    }
  };

  const scheduleSaveToServer = debounce(saveToServer, 800);

  if (elements.fontFamily) elements.fontFamily.value = settings.general.fontFamily;
  if (elements.colorTemplate) elements.colorTemplate.value = settings.theme.template || '';
  if (elements.accentColor) elements.accentColor.value = settings.theme.accentColor;
  if (elements.mutedColor) elements.mutedColor.value = settings.theme.mutedColor;
  if (elements.mainBgColor) elements.mainBgColor.value = settings.main.backgroundColor;
  if (elements.wakeWord) elements.wakeWord.value = settings.main.wakeWords || 'サイレントメイト,サイレントメイト君,さいれんとめいと,silentmate,ボイスメイト';
  if (elements.stripeColor) elements.stripeColor.value = settings.main.stripeColor || '#7aa8ff';
  if (elements.mainButtonColor) elements.mainButtonColor.value = settings.main.buttonColor || '#7aa8ff';
  if (elements.inputConfirmEnabled) elements.inputConfirmEnabled.checked = settings.main.inputConfirmEnabled !== false;
  if (elements.inputConfirmTemplate) elements.inputConfirmTemplate.value = settings.main.inputConfirmTemplate || 'だね、ちょっと待ってね！';
  if (elements.toneResponse) elements.toneResponse.value = settings.main.toneResponse || '友達ロボット風';
  if (elements.toneError) elements.toneError.value = settings.main.toneError || '';
  if (elements.voiceSelect) elements.voiceSelect.value = settings.main.voiceName || 'Google 日本語 (ja-JP)';
  if (elements.voiceRate) elements.voiceRate.value = settings.main.voiceRate ?? 1.2;
  if (elements.voicePitch) elements.voicePitch.value = settings.main.voicePitch ?? 1.1;
  if (elements.voiceVolume) elements.voiceVolume.value = settings.main.voiceVolume ?? 1;
  if (elements.voiceTestText) elements.voiceTestText.value = settings.main.voiceTestText || '僕はサイレントメイト君だよ';
  if (elements.characterEnabled) elements.characterEnabled.checked = settings.character.enabled !== false;
  if (elements.characterSize) elements.characterSize.value = settings.character.size;
  if (elements.characterColor) elements.characterColor.value = settings.character.color;
  updateSizeLabel(settings.character.size);
  const updateVoiceValue = (valueElement, value, unit = '') => {
    if (!valueElement) return;
    valueElement.textContent = `${value}${unit}`;
  };
  updateVoiceValue(elements.voiceRateValue, settings.main.voiceRate ?? 1.2);
  updateVoiceValue(elements.voicePitchValue, settings.main.voicePitch ?? 1.1);
  updateVoiceValue(elements.voiceVolumeValue, settings.main.voiceVolume ?? 1);
  applyToPage(settings);

  populateVoices(settings);
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => populateVoices(loadSettings());
  }

  const applyThemeTemplate = (templateKey) => {
    const templates = {
      midnight: {
        accentColor: '#7aa8ff',
        mutedColor: '#cdd6df',
        backgroundColor: '#0b1f38',
        stripeColor: '#5b8cff',
        buttonColor: '#7aa8ff',
      },
      sunset: {
        accentColor: '#fb923c',
        mutedColor: '#f3e2d3',
        backgroundColor: '#2a1409',
        stripeColor: '#f59e0b',
        buttonColor: '#fb923c',
      },
      forest: {
        accentColor: '#34d399',
        mutedColor: '#d1e5dc',
        backgroundColor: '#0e1f17',
        stripeColor: '#10b981',
        buttonColor: '#34d399',
      },
      mono: {
        accentColor: '#94a3b8',
        mutedColor: '#cbd5e1',
        backgroundColor: '#111827',
        stripeColor: '#64748b',
        buttonColor: '#94a3b8',
      },
      neon: {
        accentColor: '#38bdf8',
        mutedColor: '#bae6fd',
        backgroundColor: '#05101a',
        stripeColor: '#22d3ee',
        buttonColor: '#38bdf8',
      },
    };
    const selected = templates[templateKey];
    if (!selected) return;
    settings.theme.accentColor = selected.accentColor;
    settings.theme.mutedColor = selected.mutedColor;
    settings.main.backgroundColor = selected.backgroundColor;
    settings.main.stripeColor = selected.stripeColor;
    settings.main.buttonColor = selected.buttonColor;
    if (elements.accentColor) elements.accentColor.value = selected.accentColor;
    if (elements.mutedColor) elements.mutedColor.value = selected.mutedColor;
    if (elements.mainBgColor) elements.mainBgColor.value = selected.backgroundColor;
    if (elements.stripeColor) elements.stripeColor.value = selected.stripeColor;
    if (elements.mainButtonColor) elements.mainButtonColor.value = selected.buttonColor;
    saveSettings(settings);
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  };

  elements.colorTemplate?.addEventListener('change', (event) => {
    settings.theme.template = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyThemeTemplate(event.target.value);
  });

  elements.fontFamily?.addEventListener('change', (event) => {
    settings.general.fontFamily = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.mainBgColor?.addEventListener('change', (event) => {
    settings.main.backgroundColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.wakeWord?.addEventListener('input', (event) => {
    settings.main.wakeWords = event.target.value;
    saveSettings(settings);
    window.AndroidSync?.setWakeWords(event.target.value);
    scheduleSaveToServer();
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.accentColor?.addEventListener('change', (event) => {
    settings.theme.accentColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.mutedColor?.addEventListener('change', (event) => {
    settings.theme.mutedColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.stripeColor?.addEventListener('change', (event) => {
    settings.main.stripeColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.mainButtonColor?.addEventListener('change', (event) => {
    settings.main.buttonColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.inputConfirmEnabled?.addEventListener('change', (event) => {
    settings.main.inputConfirmEnabled = event.target.checked;
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.inputConfirmTemplate?.addEventListener('input', (event) => {
    settings.main.inputConfirmTemplate = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.toneResponse?.addEventListener('input', (event) => {
    settings.main.toneResponse = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.toneError?.addEventListener('input', (event) => {
    settings.main.toneError = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.voiceSelect?.addEventListener('change', (event) => {
    settings.main.voiceName = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    previewVoice(settings.main.voiceName);
  });

  elements.voiceRate?.addEventListener('input', (event) => {
    settings.main.voiceRate = Number(event.target.value || 1);
    updateVoiceValue(elements.voiceRateValue, settings.main.voiceRate);
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.voicePitch?.addEventListener('input', (event) => {
    settings.main.voicePitch = Number(event.target.value || 1);
    updateVoiceValue(elements.voicePitchValue, settings.main.voicePitch);
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.voiceVolume?.addEventListener('input', (event) => {
    settings.main.voiceVolume = Number(event.target.value || 1);
    updateVoiceValue(elements.voiceVolumeValue, settings.main.voiceVolume);
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.voiceTestText?.addEventListener('input', (event) => {
    settings.main.voiceTestText = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.voiceTestButton?.addEventListener('click', () => {
    const text = settings.main.voiceTestText || 'この声でよろしいでしょうか？';
    previewVoice(settings.main.voiceName, text);
  });

  elements.characterEnabled?.addEventListener('change', (event) => {
    settings.character.enabled = event.target.checked;
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.characterSize?.addEventListener('input', (event) => {
    settings.character.size = Number(event.target.value || 220);
    updateSizeLabel(settings.character.size);
    saveSettings(settings);
    scheduleSaveToServer();
  });

  elements.characterColor?.addEventListener('change', (event) => {
    settings.character.color = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
  });

  const applySettingsFromServer = (serverSettings) => {
    if (!serverSettings || typeof serverSettings !== 'object') return;
    applyingRemote = true;
    settings = {
      general: { ...defaultSettings.general, ...(serverSettings.general || {}) },
      main: { ...defaultSettings.main, ...(serverSettings.main || {}) },
      character: { ...defaultSettings.character, ...(serverSettings.character || {}) },
      theme: { ...defaultSettings.theme, ...(serverSettings.theme || {}) },
    };
    if (elements.fontFamily) elements.fontFamily.value = settings.general.fontFamily;
    if (elements.colorTemplate) elements.colorTemplate.value = settings.theme.template || '';
    if (elements.accentColor) elements.accentColor.value = settings.theme.accentColor;
    if (elements.mutedColor) elements.mutedColor.value = settings.theme.mutedColor;
    if (elements.mainBgColor) elements.mainBgColor.value = settings.main.backgroundColor;
    if (elements.wakeWord) elements.wakeWord.value = settings.main.wakeWords || '';
    if (elements.stripeColor) elements.stripeColor.value = settings.main.stripeColor || '#7aa8ff';
    if (elements.mainButtonColor) elements.mainButtonColor.value = settings.main.buttonColor || '#7aa8ff';
    if (elements.inputConfirmEnabled) elements.inputConfirmEnabled.checked = settings.main.inputConfirmEnabled !== false;
    if (elements.inputConfirmTemplate) elements.inputConfirmTemplate.value = settings.main.inputConfirmTemplate || 'だね、ちょっと待ってね！';
    if (elements.toneResponse) elements.toneResponse.value = settings.main.toneResponse || '友達ロボット風';
    if (elements.toneError) elements.toneError.value = settings.main.toneError || '';
    if (elements.voiceSelect) elements.voiceSelect.value = settings.main.voiceName || 'Google 日本語 (ja-JP)';
    if (elements.voiceRate) elements.voiceRate.value = settings.main.voiceRate ?? 1.2;
    if (elements.voicePitch) elements.voicePitch.value = settings.main.voicePitch ?? 1.1;
    if (elements.voiceVolume) elements.voiceVolume.value = settings.main.voiceVolume ?? 1;
    if (elements.voiceTestText) elements.voiceTestText.value = settings.main.voiceTestText || '僕はサイレントメイト君だよ';
    if (elements.characterEnabled) elements.characterEnabled.checked = settings.character.enabled !== false;
    if (elements.characterSize) elements.characterSize.value = settings.character.size;
    if (elements.characterColor) elements.characterColor.value = settings.character.color;
    updateSizeLabel(settings.character.size);
    updateVoiceValue(elements.voiceRateValue, settings.main.voiceRate ?? 1.2);
    updateVoiceValue(elements.voicePitchValue, settings.main.voicePitch ?? 1.1);
    updateVoiceValue(elements.voiceVolumeValue, settings.main.voiceVolume ?? 1);
    saveSettings(settings);
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
    applyingRemote = false;
  };

  const fetchSettingsFromServer = async () => {
    try {
        if (window.AndroidSync?.request) {
            const data = await window.AndroidSync.request('GET', '/api/user_settings');
            applySettingsFromServer(data.settings);
        }
    } catch (e) {
      console.warn('設定の取得に失敗しました。', e);
    }
  };

  fetchSettingsFromServer();
})();
