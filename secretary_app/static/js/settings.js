(() => {
  const defaultSettings = {
    general: {
      fontFamily: '',
    },
    main: {
      backgroundColor: '#0b1f38',
      voiceName: 'Google 日本語 (ja-JP)',
      toneResponse: '友達ロボット風',
      toneError: '',
      voiceRate: 1.2,
      voicePitch: 1.1,
      voiceVolume: 1,
      voiceTestText: '僕はサイレントメイト君だよ',
      stripeColor: '#7aa8ff',
      buttonColor: '#7aa8ff',
      micColor: '#2a3440',
      userBadgeBgColor: '#f1f5f9',
      logBgColor: '#ffffff',
      fabColor: '#7aa8ff',
      textColor: '#0f1720',
      wakeWords: 'サイレントメイト,サイレントメイト君,さいれんとめいと,silentmate,ボイスメイト',
      inputConfirmEnabled: true,
      inputConfirmTemplate: 'だね、ちょっと待ってね！',
    },
    character: {
      enabled: true,
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
    micColor: document.getElementById('mic-color'),
    userBadgeBgColor: document.getElementById('user-badge-bg-color'),
    logBgColor: document.getElementById('log-bg-color'),
    fabColor: document.getElementById('fab-color'),
    mainTextColor: document.getElementById('main-text-color'),
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
    elements.voiceSelect.innerHTML = '<option value="">既定を使用</option>';
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

  const previewVoice = (settings, voiceName, textOverride) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (synth.speaking) {
      synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(
      textOverride || 'この声でよろしいでしょうか？'
    );
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
      await fetch('/api/user_settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
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
  if (elements.wakeWord) elements.wakeWord.value = settings.main.wakeWords || '';
  if (elements.stripeColor) elements.stripeColor.value = settings.main.stripeColor || '#7aa8ff';
  if (elements.mainButtonColor) elements.mainButtonColor.value = settings.main.buttonColor || '#7aa8ff';
  if (elements.micColor) elements.micColor.value = settings.main.micColor || '#2a3440';
  if (elements.userBadgeBgColor) elements.userBadgeBgColor.value = settings.main.userBadgeBgColor || '#f1f5f9';
  if (elements.logBgColor) elements.logBgColor.value = settings.main.logBgColor || '#ffffff';
  if (elements.fabColor) elements.fabColor.value = settings.main.fabColor || '#7aa8ff';
  if (elements.mainTextColor) elements.mainTextColor.value = settings.main.textColor || '#0f1720';
  if (elements.inputConfirmEnabled) elements.inputConfirmEnabled.checked = settings.main.inputConfirmEnabled !== false;
  if (elements.inputConfirmTemplate) {
    elements.inputConfirmTemplate.value = settings.main.inputConfirmTemplate || 'だね、ちょっと待ってね！';
  }
  if (elements.toneResponse) elements.toneResponse.value = settings.main.toneResponse || '';
  if (elements.toneError) elements.toneError.value = settings.main.toneError || '';
  if (elements.voiceSelect) elements.voiceSelect.value = settings.main.voiceName || '';
  if (elements.voiceRate) elements.voiceRate.value = settings.main.voiceRate ?? 1.2;
  if (elements.voicePitch) elements.voicePitch.value = settings.main.voicePitch ?? 1.1;
  if (elements.voiceVolume) elements.voiceVolume.value = settings.main.voiceVolume ?? 1;
  if (elements.voiceTestText) {
    elements.voiceTestText.value = settings.main.voiceTestText || '僕はサイレントメイト君だよ';
  }
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
      theme01: {
        accentColor: '#6ea8ff',
        mutedColor: '#a8c2dd',
        backgroundColor: '#e8f1fb',
        stripeColor: '#d6e6f7',
        buttonColor: '#6ea8ff',
        micColor: '#cfe0f0',
        userBadgeBgColor: '#dfeaf7',
        logBgColor: '#dfeaf7',
        fabColor: '#6ea8ff',
        textColor: '#274b6d',
      },
      theme02: {
        accentColor: '#6b8cff',
        mutedColor: '#b7c7e6',
        backgroundColor: '#eef3ff',
        stripeColor: '#dbe4ff',
        buttonColor: '#6b8cff',
        micColor: '#d7e1f5',
        userBadgeBgColor: '#e3e9f7',
        logBgColor: '#e3e9f7',
        fabColor: '#6b8cff',
        textColor: '#2a3d66',
      },
      theme03: {
        accentColor: '#d99b5f',
        mutedColor: '#d7c3ae',
        backgroundColor: '#f6efe6',
        stripeColor: '#efe2d2',
        buttonColor: '#d99b5f',
        micColor: '#eadccf',
        userBadgeBgColor: '#f0e6db',
        logBgColor: '#f0e6db',
        fabColor: '#d99b5f',
        textColor: '#5b3c20',
      },
      theme04: {
        accentColor: '#f08a2b',
        mutedColor: '#e5c6a6',
        backgroundColor: '#fff0e0',
        stripeColor: '#ffe0c2',
        buttonColor: '#f08a2b',
        micColor: '#f3d6bc',
        userBadgeBgColor: '#f7e2cf',
        logBgColor: '#f7e2cf',
        fabColor: '#f08a2b',
        textColor: '#6a3a12',
      },
      theme05: {
        accentColor: '#ff7aa2',
        mutedColor: '#e5b6c7',
        backgroundColor: '#ffeef2',
        stripeColor: '#ffd9e3',
        buttonColor: '#ff7aa2',
        micColor: '#f6d1dd',
        userBadgeBgColor: '#fae0e8',
        logBgColor: '#fae0e8',
        fabColor: '#ff7aa2',
        textColor: '#6e2b3f',
      },
      theme06: {
        accentColor: '#36b88a',
        mutedColor: '#b4dccb',
        backgroundColor: '#e8f7f1',
        stripeColor: '#d2efe3',
        buttonColor: '#36b88a',
        micColor: '#cfe7dc',
        userBadgeBgColor: '#dff1ea',
        logBgColor: '#dff1ea',
        fabColor: '#36b88a',
        textColor: '#1f5a48',
      },
      theme07: {
        accentColor: '#5aa94f',
        mutedColor: '#c0d8b8',
        backgroundColor: '#edf7e9',
        stripeColor: '#d9f0d2',
        buttonColor: '#5aa94f',
        micColor: '#d7ead1',
        userBadgeBgColor: '#e6f2e0',
        logBgColor: '#e6f2e0',
        fabColor: '#5aa94f',
        textColor: '#2f5a2a',
      },
      theme08: {
        accentColor: '#8a6bd6',
        mutedColor: '#c8b9e6',
        backgroundColor: '#f2edfb',
        stripeColor: '#e2d8f6',
        buttonColor: '#8a6bd6',
        micColor: '#e1d6f2',
        userBadgeBgColor: '#ece5f8',
        logBgColor: '#ece5f8',
        fabColor: '#8a6bd6',
        textColor: '#3f2a66',
      },
      theme09: {
        accentColor: '#3aa0a8',
        mutedColor: '#b7d4d7',
        backgroundColor: '#e7f4f5',
        stripeColor: '#cfe8ea',
        buttonColor: '#3aa0a8',
        micColor: '#cfe2e4',
        userBadgeBgColor: '#dff0f2',
        logBgColor: '#dff0f2',
        fabColor: '#3aa0a8',
        textColor: '#1f4f55',
      },
      theme10: {
        accentColor: '#e0a81f',
        mutedColor: '#d7c79f',
        backgroundColor: '#fff7db',
        stripeColor: '#f8e9b8',
        buttonColor: '#e0a81f',
        micColor: '#f0e0bf',
        userBadgeBgColor: '#f7edcf',
        logBgColor: '#f7edcf',
        fabColor: '#e0a81f',
        textColor: '#6b4d0f',
      },
      theme11: {
        accentColor: '#7b8a9b',
        mutedColor: '#b8c2cc',
        backgroundColor: '#f2f4f6',
        stripeColor: '#e2e6ea',
        buttonColor: '#7b8a9b',
        micColor: '#e0e5ea',
        userBadgeBgColor: '#e9edf1',
        logBgColor: '#e9edf1',
        fabColor: '#7b8a9b',
        textColor: '#2f3b46',
      },
      theme12: {
        accentColor: '#4aa6d8',
        mutedColor: '#b7d5e8',
        backgroundColor: '#e9f7ff',
        stripeColor: '#d3eeff',
        buttonColor: '#4aa6d8',
        micColor: '#d4e8f4',
        userBadgeBgColor: '#e3f2fb',
        logBgColor: '#e3f2fb',
        fabColor: '#4aa6d8',
        textColor: '#1f4a63',
      },
      theme13: {
        accentColor: '#5f8bff',
        mutedColor: '#7a90b3',
        backgroundColor: '#121c2b',
        stripeColor: '#1b2a40',
        buttonColor: '#5f8bff',
        micColor: '#1a2a3d',
        userBadgeBgColor: '#162235',
        logBgColor: '#162235',
        fabColor: '#5f8bff',
        textColor: '#c7d6f2',
      },
      theme14: {
        accentColor: '#7a6bff',
        mutedColor: '#8f88c2',
        backgroundColor: '#151629',
        stripeColor: '#1f2140',
        buttonColor: '#7a6bff',
        micColor: '#1d1f3a',
        userBadgeBgColor: '#181a32',
        logBgColor: '#181a32',
        fabColor: '#7a6bff',
        textColor: '#d2cff5',
      },
      theme15: {
        accentColor: '#2cb6a2',
        mutedColor: '#6a9f97',
        backgroundColor: '#0f2021',
        stripeColor: '#193032',
        buttonColor: '#2cb6a2',
        micColor: '#163133',
        userBadgeBgColor: '#122a2c',
        logBgColor: '#122a2c',
        fabColor: '#2cb6a2',
        textColor: '#c9ece7',
      },
      theme16: {
        accentColor: '#49b37d',
        mutedColor: '#6e9c86',
        backgroundColor: '#121f17',
        stripeColor: '#1b2b20',
        buttonColor: '#49b37d',
        micColor: '#1a2b20',
        userBadgeBgColor: '#152219',
        logBgColor: '#152219',
        fabColor: '#49b37d',
        textColor: '#cdebdc',
      },
      theme17: {
        accentColor: '#a3b35a',
        mutedColor: '#7f8762',
        backgroundColor: '#1a1e14',
        stripeColor: '#2a3021',
        buttonColor: '#a3b35a',
        micColor: '#262c1d',
        userBadgeBgColor: '#1f2318',
        logBgColor: '#1f2318',
        fabColor: '#a3b35a',
        textColor: '#e4ead0',
      },
      theme18: {
        accentColor: '#e08a3c',
        mutedColor: '#9f7a5a',
        backgroundColor: '#2a1a12',
        stripeColor: '#3b2418',
        buttonColor: '#e08a3c',
        micColor: '#3a2419',
        userBadgeBgColor: '#2f1d15',
        logBgColor: '#2f1d15',
        fabColor: '#e08a3c',
        textColor: '#f3d8c1',
      },
      theme19: {
        accentColor: '#d85b6a',
        mutedColor: '#9a6c75',
        backgroundColor: '#2a1115',
        stripeColor: '#3b1a20',
        buttonColor: '#d85b6a',
        micColor: '#3a1c22',
        userBadgeBgColor: '#2f151a',
        logBgColor: '#2f151a',
        fabColor: '#d85b6a',
        textColor: '#f2c8cf',
      },
      theme20: {
        accentColor: '#c46aa5',
        mutedColor: '#8f6a7d',
        backgroundColor: '#25121d',
        stripeColor: '#351a29',
        buttonColor: '#c46aa5',
        micColor: '#341d2a',
        userBadgeBgColor: '#2a1622',
        logBgColor: '#2a1622',
        fabColor: '#c46aa5',
        textColor: '#f0cde1',
      },
      theme21: {
        accentColor: '#9b6bd6',
        mutedColor: '#8a6aa5',
        backgroundColor: '#1e1428',
        stripeColor: '#2a1c38',
        buttonColor: '#9b6bd6',
        micColor: '#2a1c38',
        userBadgeBgColor: '#24192f',
        logBgColor: '#24192f',
        fabColor: '#9b6bd6',
        textColor: '#e7d7f5',
      },
      theme22: {
        accentColor: '#2f8fb8',
        mutedColor: '#6f8fa3',
        backgroundColor: '#0f1c26',
        stripeColor: '#182a36',
        buttonColor: '#2f8fb8',
        micColor: '#182a36',
        userBadgeBgColor: '#12212c',
        logBgColor: '#12212c',
        fabColor: '#2f8fb8',
        textColor: '#cbe2f0',
      },
      theme23: {
        accentColor: '#b07a4a',
        mutedColor: '#8f7058',
        backgroundColor: '#20160f',
        stripeColor: '#2e2118',
        buttonColor: '#b07a4a',
        micColor: '#2e2118',
        userBadgeBgColor: '#261b13',
        logBgColor: '#261b13',
        fabColor: '#b07a4a',
        textColor: '#f0d9c8',
      },
      theme24: {
        accentColor: '#7f8ea3',
        mutedColor: '#7b8696',
        backgroundColor: '#171a1f',
        stripeColor: '#232833',
        buttonColor: '#7f8ea3',
        micColor: '#232833',
        userBadgeBgColor: '#1b1f26',
        logBgColor: '#1b1f26',
        fabColor: '#7f8ea3',
        textColor: '#d6dde7',
      },
    };
    const selected = templates[templateKey];
    if (!selected) return;
    settings.theme.accentColor = selected.accentColor;
    settings.theme.mutedColor = selected.mutedColor;
    settings.main.backgroundColor = selected.backgroundColor;
    settings.main.stripeColor = selected.stripeColor;
    settings.main.buttonColor = selected.buttonColor;
    settings.main.micColor = selected.micColor || selected.accentColor;
    settings.main.userBadgeBgColor = selected.userBadgeBgColor || '#f1f5f9';
    settings.main.logBgColor = selected.logBgColor || '#ffffff';
    settings.main.fabColor = selected.fabColor || selected.accentColor;
    settings.main.textColor = selected.textColor || '#0f1720';
    if (elements.accentColor) elements.accentColor.value = selected.accentColor;
    if (elements.mutedColor) elements.mutedColor.value = selected.mutedColor;
    if (elements.mainBgColor) elements.mainBgColor.value = selected.backgroundColor;
    if (elements.stripeColor) elements.stripeColor.value = selected.stripeColor;
    if (elements.mainButtonColor) elements.mainButtonColor.value = selected.buttonColor;
    if (elements.micColor) elements.micColor.value = selected.micColor || selected.accentColor;
    if (elements.userBadgeBgColor) elements.userBadgeBgColor.value = selected.userBadgeBgColor || '#f1f5f9';
    if (elements.logBgColor) elements.logBgColor.value = selected.logBgColor || '#ffffff';
    if (elements.fabColor) elements.fabColor.value = selected.fabColor || selected.accentColor;
    if (elements.mainTextColor) elements.mainTextColor.value = selected.textColor || '#0f1720';
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

  elements.micColor?.addEventListener('change', (event) => {
    settings.main.micColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.userBadgeBgColor?.addEventListener('change', (event) => {
    settings.main.userBadgeBgColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.logBgColor?.addEventListener('change', (event) => {
    settings.main.logBgColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.fabColor?.addEventListener('change', (event) => {
    settings.main.fabColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.mainTextColor?.addEventListener('change', (event) => {
    settings.main.textColor = event.target.value;
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
    previewVoice(settings, settings.main.voiceName);
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
    previewVoice(settings, settings.main.voiceName, text);
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
    if (elements.micColor) elements.micColor.value = settings.main.micColor || '#2a3440';
    if (elements.userBadgeBgColor) elements.userBadgeBgColor.value = settings.main.userBadgeBgColor || '#f1f5f9';
    if (elements.logBgColor) elements.logBgColor.value = settings.main.logBgColor || '#ffffff';
    if (elements.fabColor) elements.fabColor.value = settings.main.fabColor || '#7aa8ff';
    if (elements.mainTextColor) elements.mainTextColor.value = settings.main.textColor || '#0f1720';
    if (elements.inputConfirmEnabled) elements.inputConfirmEnabled.checked = settings.main.inputConfirmEnabled !== false;
    if (elements.inputConfirmTemplate) {
      elements.inputConfirmTemplate.value = settings.main.inputConfirmTemplate || 'だね、ちょっと待ってね！';
    }
    if (elements.toneResponse) elements.toneResponse.value = settings.main.toneResponse || '';
    if (elements.toneError) elements.toneError.value = settings.main.toneError || '';
    if (elements.voiceSelect) elements.voiceSelect.value = settings.main.voiceName || '';
    if (elements.voiceRate) elements.voiceRate.value = settings.main.voiceRate ?? 1.2;
    if (elements.voicePitch) elements.voicePitch.value = settings.main.voicePitch ?? 1.1;
    if (elements.voiceVolume) elements.voiceVolume.value = settings.main.voiceVolume ?? 1;
    if (elements.voiceTestText) {
      elements.voiceTestText.value = settings.main.voiceTestText || '僕はサイレントメイト君だよ';
    }
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
      const res = await fetch('/api/user_settings');
      if (!res.ok) return;
      const data = await res.json();
      applySettingsFromServer(data.settings);
    } catch (e) {
      console.warn('設定の取得に失敗しました。', e);
    }
  };

  fetchSettingsFromServer();
})();
