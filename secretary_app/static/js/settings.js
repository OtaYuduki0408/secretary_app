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
      displayAllSpeech: false,
      endWord: '命令完了',
    },
    ui: {
      backgroundColor: '#0f172a',
      panelColor: '#1e293b',
      panelSoftColor: '#243045',
      textColor: '#f8fafc',
      mutedColor: '#cbd5f5',
      accentColor: '#38bdf8',
      accentStrongColor: '#0ea5e9',
      borderColor: '#94a3b8',
      successColor: '#34d399',
      dangerColor: '#f87171',
      inputBgColor: '#0f172a',
      inputTextColor: '#f8fafc',
      inputBorderColor: '#94a3b8',
      buttonBgColor: '#38bdf8',
      buttonTextColor: '#0f172a',
      linkColor: '#38bdf8',
      shadowColor: '#0f172a',
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
      userThemes: [],
    },
  };

  const elements = {
    fontFamily: document.getElementById('font-family'),
    colorTemplate: document.getElementById('color-template'),
    themeSaveName: document.getElementById('theme-save-name'),
    themeSaveButton: document.getElementById('theme-save-button'),
    themeDeleteButton: document.getElementById('theme-delete-button'),
    accentColor: document.getElementById('accent-color'),
    mutedColor: document.getElementById('muted-color'),
    uiBgColor: document.getElementById('ui-bg-color'),
    uiPanelColor: document.getElementById('ui-panel-color'),
    uiPanelSoftColor: document.getElementById('ui-panel-soft-color'),
    uiTextColor: document.getElementById('ui-text-color'),
    uiMutedColor: document.getElementById('ui-muted-color'),
    uiAccentColor: document.getElementById('ui-accent-color'),
    uiAccentStrongColor: document.getElementById('ui-accent-strong-color'),
    uiBorderColor: document.getElementById('ui-border-color'),
    uiSuccessColor: document.getElementById('ui-success-color'),
    uiDangerColor: document.getElementById('ui-danger-color'),
    uiInputBgColor: document.getElementById('ui-input-bg-color'),
    uiInputTextColor: document.getElementById('ui-input-text-color'),
    uiInputBorderColor: document.getElementById('ui-input-border-color'),
    uiButtonBgColor: document.getElementById('ui-button-bg-color'),
    uiButtonTextColor: document.getElementById('ui-button-text-color'),
    uiLinkColor: document.getElementById('ui-link-color'),
    uiShadowColor: document.getElementById('ui-shadow-color'),
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
    displayAllSpeechToggle: document.getElementById('display-all-speech-toggle'),
    endWord: document.getElementById('end-word'),
  };

  const loadSettings = () => {
    try {
      const raw = localStorage.getItem('appSettings');
      if (!raw) return { ...defaultSettings };
      const stored = JSON.parse(raw);
      const mergedTheme = { ...defaultSettings.theme, ...(stored.theme || {}) };
      if (!Array.isArray(mergedTheme.userThemes)) {
        mergedTheme.userThemes = [];
      }
      return {
        general: { ...defaultSettings.general, ...(stored.general || {}) },
        main: { ...defaultSettings.main, ...(stored.main || {}) },
        ui: { ...defaultSettings.ui, ...(stored.ui || {}) },
        character: { ...defaultSettings.character, ...(stored.character || {}) },
        theme: mergedTheme,
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
    const root = document.documentElement;
    document.documentElement.style.setProperty('--app-font', settings.general.fontFamily || '');
    document.body.style.fontFamily = settings.general.fontFamily || '';
    const ui = settings.ui || {};
    if (ui.backgroundColor) {
      document.body.style.backgroundColor = ui.backgroundColor;
      document.body.style.backgroundImage = 'none';
    }
    if (ui.backgroundColor) root.style.setProperty('--app-bg', ui.backgroundColor);
    if (ui.panelColor) root.style.setProperty('--app-panel', ui.panelColor);
    if (ui.panelSoftColor) root.style.setProperty('--app-panel-soft', ui.panelSoftColor);
    if (ui.textColor) root.style.setProperty('--app-text', ui.textColor);
    if (ui.mutedColor) root.style.setProperty('--app-muted', ui.mutedColor);
    if (ui.accentColor) root.style.setProperty('--app-accent', ui.accentColor);
    if (ui.accentStrongColor) root.style.setProperty('--app-accent-strong', ui.accentStrongColor);
    if (ui.borderColor) root.style.setProperty('--app-border', ui.borderColor);
    if (ui.successColor) root.style.setProperty('--app-success', ui.successColor);
    if (ui.dangerColor) root.style.setProperty('--app-danger', ui.dangerColor);
    if (ui.inputBgColor) root.style.setProperty('--app-input-bg', ui.inputBgColor);
    if (ui.inputTextColor) root.style.setProperty('--app-input-text', ui.inputTextColor);
    if (ui.inputBorderColor) root.style.setProperty('--app-input-border', ui.inputBorderColor);
    if (ui.buttonBgColor) root.style.setProperty('--app-button-bg', ui.buttonBgColor);
    if (ui.buttonTextColor) root.style.setProperty('--app-button-text', ui.buttonTextColor);
    if (ui.linkColor) root.style.setProperty('--app-link', ui.linkColor);
    if (ui.shadowColor) root.style.setProperty('--app-shadow-color', ui.shadowColor);
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

  const standardTemplateOptions = [
    { key: 'theme01', label: '01: 霧夜ブルー' },
    { key: 'theme02', label: '02: 深海ネイビー' },
    { key: 'theme03', label: '03: 墨ブラック' },
    { key: 'theme04', label: '04: スチールグレー' },
    { key: 'theme05', label: '05: 夕焼けアンバー' },
    { key: 'theme06', label: '06: 焦がしオレンジ' },
    { key: 'theme07', label: '07: 苺ミルク' },
    { key: 'theme08', label: '08: 梅紫' },
    { key: 'theme09', label: '09: 夜桜パープル' },
    { key: 'theme10', label: '10: ライムグリーン' },
    { key: 'theme11', label: '11: 深緑フォレスト' },
    { key: 'theme12', label: '12: 抹茶' },
    { key: 'theme13', label: '13: 砂漠サンド' },
    { key: 'theme14', label: '14: コーヒーブラウン' },
    { key: 'theme15', label: '15: ミントソーダ' },
    { key: 'theme16', label: '16: アイスブルー' },
    { key: 'theme17', label: '17: サイバーシアン' },
    { key: 'theme18', label: '18: レモンイエロー' },
    { key: 'theme19', label: '19: ローズピンク' },
    { key: 'theme20', label: '20: ロイヤルブルー' },
    { key: 'theme21', label: '21: ベージュクリーム' },
    { key: 'theme22', label: '22: モノクロ（高コントラスト）' },
    { key: 'theme23', label: '23: ダークレッド' },
    { key: 'theme24', label: '24: ダークティール' },
  ];

  const rebuildTemplateOptions = () => {
    if (!elements.colorTemplate) return;
    const select = elements.colorTemplate;
    select.innerHTML = '';
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = '選択しない';
    select.appendChild(noneOption);

    const userThemes = settings.theme.userThemes || [];
    if (userThemes.length > 0) {
      const userGroup = document.createElement('optgroup');
      userGroup.label = 'ユーザーテーマ';
      userThemes.forEach((theme) => {
        const option = document.createElement('option');
        option.value = `user:${theme.id}`;
        option.textContent = theme.name;
        userGroup.appendChild(option);
      });
      select.appendChild(userGroup);
    }

    const standardGroup = document.createElement('optgroup');
    standardGroup.label = '標準テーマ';
    standardTemplateOptions.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.key;
      option.textContent = item.label;
      standardGroup.appendChild(option);
    });
    select.appendChild(standardGroup);

    if (settings.theme.template) {
      select.value = settings.theme.template;
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
  rebuildTemplateOptions();
  if (elements.accentColor) elements.accentColor.value = settings.theme.accentColor;
  if (elements.mutedColor) elements.mutedColor.value = settings.theme.mutedColor;
  if (elements.uiBgColor) elements.uiBgColor.value = settings.ui.backgroundColor;
  if (elements.uiPanelColor) elements.uiPanelColor.value = settings.ui.panelColor;
  if (elements.uiPanelSoftColor) elements.uiPanelSoftColor.value = settings.ui.panelSoftColor;
  if (elements.uiTextColor) elements.uiTextColor.value = settings.ui.textColor;
  if (elements.uiMutedColor) elements.uiMutedColor.value = settings.ui.mutedColor;
  if (elements.uiAccentColor) elements.uiAccentColor.value = settings.ui.accentColor;
  if (elements.uiAccentStrongColor) elements.uiAccentStrongColor.value = settings.ui.accentStrongColor;
  if (elements.uiBorderColor) elements.uiBorderColor.value = settings.ui.borderColor;
  if (elements.uiSuccessColor) elements.uiSuccessColor.value = settings.ui.successColor;
  if (elements.uiDangerColor) elements.uiDangerColor.value = settings.ui.dangerColor;
  if (elements.uiInputBgColor) elements.uiInputBgColor.value = settings.ui.inputBgColor;
  if (elements.uiInputTextColor) elements.uiInputTextColor.value = settings.ui.inputTextColor;
  if (elements.uiInputBorderColor) elements.uiInputBorderColor.value = settings.ui.inputBorderColor;
  if (elements.uiButtonBgColor) elements.uiButtonBgColor.value = settings.ui.buttonBgColor;
  if (elements.uiButtonTextColor) elements.uiButtonTextColor.value = settings.ui.buttonTextColor;
  if (elements.uiLinkColor) elements.uiLinkColor.value = settings.ui.linkColor;
  if (elements.uiShadowColor) elements.uiShadowColor.value = settings.ui.shadowColor;
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
          if (elements.displayAllSpeechToggle) elements.displayAllSpeechToggle.checked = settings.main.displayAllSpeech;
          if (elements.endWord) elements.endWord.value = settings.main.endWord || '';
          updateSizeLabel(settings.character.size);  
      const updateVoiceValue = (valueElement, value, unit = '') => {    if (!valueElement) return;
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

  const applyPalette = (palette) => {
    if (!palette) return;
    if (palette.theme) {
      settings.theme.accentColor = palette.theme.accentColor ?? settings.theme.accentColor;
      settings.theme.mutedColor = palette.theme.mutedColor ?? settings.theme.mutedColor;
    }
    if (palette.main) {
      settings.main = { ...settings.main, ...palette.main };
    }
    if (palette.ui) {
      settings.ui = { ...settings.ui, ...palette.ui };
    }
    if (elements.accentColor) elements.accentColor.value = settings.theme.accentColor;
    if (elements.mutedColor) elements.mutedColor.value = settings.theme.mutedColor;
    if (elements.mainBgColor) elements.mainBgColor.value = settings.main.backgroundColor;
    if (elements.stripeColor) elements.stripeColor.value = settings.main.stripeColor;
    if (elements.mainButtonColor) elements.mainButtonColor.value = settings.main.buttonColor;
    if (elements.micColor) elements.micColor.value = settings.main.micColor;
    if (elements.userBadgeBgColor) elements.userBadgeBgColor.value = settings.main.userBadgeBgColor;
    if (elements.logBgColor) elements.logBgColor.value = settings.main.logBgColor;
    if (elements.fabColor) elements.fabColor.value = settings.main.fabColor;
    if (elements.mainTextColor) elements.mainTextColor.value = settings.main.textColor;
    if (elements.uiBgColor) elements.uiBgColor.value = settings.ui.backgroundColor;
    if (elements.uiPanelColor) elements.uiPanelColor.value = settings.ui.panelColor;
    if (elements.uiPanelSoftColor) elements.uiPanelSoftColor.value = settings.ui.panelSoftColor;
    if (elements.uiTextColor) elements.uiTextColor.value = settings.ui.textColor;
    if (elements.uiMutedColor) elements.uiMutedColor.value = settings.ui.mutedColor;
    if (elements.uiAccentColor) elements.uiAccentColor.value = settings.ui.accentColor;
    if (elements.uiAccentStrongColor) elements.uiAccentStrongColor.value = settings.ui.accentStrongColor;
    if (elements.uiBorderColor) elements.uiBorderColor.value = settings.ui.borderColor;
    if (elements.uiSuccessColor) elements.uiSuccessColor.value = settings.ui.successColor;
    if (elements.uiDangerColor) elements.uiDangerColor.value = settings.ui.dangerColor;
    if (elements.uiInputBgColor) elements.uiInputBgColor.value = settings.ui.inputBgColor;
    if (elements.uiInputTextColor) elements.uiInputTextColor.value = settings.ui.inputTextColor;
    if (elements.uiInputBorderColor) elements.uiInputBorderColor.value = settings.ui.inputBorderColor;
    if (elements.uiButtonBgColor) elements.uiButtonBgColor.value = settings.ui.buttonBgColor;
    if (elements.uiButtonTextColor) elements.uiButtonTextColor.value = settings.ui.buttonTextColor;
    if (elements.uiLinkColor) elements.uiLinkColor.value = settings.ui.linkColor;
    if (elements.uiShadowColor) elements.uiShadowColor.value = settings.ui.shadowColor;
    saveSettings(settings);
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  };

  const buildCurrentPalette = () => ({
    theme: {
      accentColor: settings.theme.accentColor,
      mutedColor: settings.theme.mutedColor,
    },
    main: {
      backgroundColor: settings.main.backgroundColor,
      stripeColor: settings.main.stripeColor,
      buttonColor: settings.main.buttonColor,
      micColor: settings.main.micColor,
      userBadgeBgColor: settings.main.userBadgeBgColor,
      logBgColor: settings.main.logBgColor,
      fabColor: settings.main.fabColor,
      textColor: settings.main.textColor,
    },
    ui: {
      backgroundColor: settings.ui.backgroundColor,
      panelColor: settings.ui.panelColor,
      panelSoftColor: settings.ui.panelSoftColor,
      textColor: settings.ui.textColor,
      mutedColor: settings.ui.mutedColor,
      accentColor: settings.ui.accentColor,
      accentStrongColor: settings.ui.accentStrongColor,
      borderColor: settings.ui.borderColor,
      successColor: settings.ui.successColor,
      dangerColor: settings.ui.dangerColor,
      inputBgColor: settings.ui.inputBgColor,
      inputTextColor: settings.ui.inputTextColor,
      inputBorderColor: settings.ui.inputBorderColor,
      buttonBgColor: settings.ui.buttonBgColor,
      buttonTextColor: settings.ui.buttonTextColor,
      linkColor: settings.ui.linkColor,
      shadowColor: settings.ui.shadowColor,
    },
  });

  const applyThemeTemplate = (templateKey) => {
    if (templateKey && templateKey.startsWith('user:')) {
      const themeId = templateKey.replace('user:', '');
      const userTheme = (settings.theme.userThemes || []).find((item) => item.id === themeId);
      if (userTheme) {
        applyPalette(userTheme.palette);
      }
      return;
    }
    const templates = {
      theme01: {
        accentColor: '#6ea8ff',
        mutedColor: '#b5c4d6',
        backgroundColor: '#1c2a3a',
        stripeColor: '#2a3c52',
        buttonColor: '#6ea8ff',
        micColor: '#243444',
        userBadgeBgColor: '#223345',
        logBgColor: '#223345',
        fabColor: '#6ea8ff',
        textColor: '#e6eef8',
        uiBackgroundColor: '#1c2a3a',
        uiPanelColor: '#223345',
        uiPanelSoftColor: '#2a3c52',
        uiTextColor: '#e6eef8',
        uiMutedColor: '#b5c4d6',
        uiAccentColor: '#6ea8ff',
        uiAccentStrongColor: '#6ea8ff',
        uiBorderColor: '#2a3c52',
        uiSuccessColor: '#6ea8ff',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#223345',
        uiInputTextColor: '#e6eef8',
        uiInputBorderColor: '#2a3c52',
        uiButtonBgColor: '#6ea8ff',
        uiButtonTextColor: '#1c2a3a',
        uiLinkColor: '#6ea8ff',
        uiShadowColor: '#0c1420',
      },
      theme02: {
        accentColor: '#4f7fff',
        mutedColor: '#9fb3cc',
        backgroundColor: '#0b1220',
        stripeColor: '#162234',
        buttonColor: '#4f7fff',
        micColor: '#111a28',
        userBadgeBgColor: '#121c2a',
        logBgColor: '#121c2a',
        fabColor: '#4f7fff',
        textColor: '#d7e4f6',
        uiBackgroundColor: '#0b1220',
        uiPanelColor: '#121c2a',
        uiPanelSoftColor: '#162234',
        uiTextColor: '#d7e4f6',
        uiMutedColor: '#9fb3cc',
        uiAccentColor: '#4f7fff',
        uiAccentStrongColor: '#4f7fff',
        uiBorderColor: '#162234',
        uiSuccessColor: '#4f7fff',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#121c2a',
        uiInputTextColor: '#d7e4f6',
        uiInputBorderColor: '#162234',
        uiButtonBgColor: '#4f7fff',
        uiButtonTextColor: '#0b1220',
        uiLinkColor: '#4f7fff',
        uiShadowColor: '#05080e',
      },
      theme03: {
        accentColor: '#7a7a7a',
        mutedColor: '#b0b0b0',
        backgroundColor: '#0b0b0b',
        stripeColor: '#1a1a1a',
        buttonColor: '#7a7a7a',
        micColor: '#141414',
        userBadgeBgColor: '#121212',
        logBgColor: '#121212',
        fabColor: '#7a7a7a',
        textColor: '#f0f0f0',
        uiBackgroundColor: '#0b0b0b',
        uiPanelColor: '#121212',
        uiPanelSoftColor: '#1a1a1a',
        uiTextColor: '#f0f0f0',
        uiMutedColor: '#b0b0b0',
        uiAccentColor: '#7a7a7a',
        uiAccentStrongColor: '#7a7a7a',
        uiBorderColor: '#1a1a1a',
        uiSuccessColor: '#7a7a7a',
        uiDangerColor: '#b85f5f',
        uiInputBgColor: '#121212',
        uiInputTextColor: '#f0f0f0',
        uiInputBorderColor: '#1a1a1a',
        uiButtonBgColor: '#7a7a7a',
        uiButtonTextColor: '#0b0b0b',
        uiLinkColor: '#7a7a7a',
        uiShadowColor: '#000000',
      },
      theme04: {
        accentColor: '#7b8a9b',
        mutedColor: '#c3ccd6',
        backgroundColor: '#2b2f36',
        stripeColor: '#3a414b',
        buttonColor: '#7b8a9b',
        micColor: '#343b44',
        userBadgeBgColor: '#303741',
        logBgColor: '#303741',
        fabColor: '#7b8a9b',
        textColor: '#eef1f5',
        uiBackgroundColor: '#2b2f36',
        uiPanelColor: '#303741',
        uiPanelSoftColor: '#3a414b',
        uiTextColor: '#eef1f5',
        uiMutedColor: '#c3ccd6',
        uiAccentColor: '#7b8a9b',
        uiAccentStrongColor: '#7b8a9b',
        uiBorderColor: '#3a414b',
        uiSuccessColor: '#7b8a9b',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#303741',
        uiInputTextColor: '#eef1f5',
        uiInputBorderColor: '#3a414b',
        uiButtonBgColor: '#7b8a9b',
        uiButtonTextColor: '#2b2f36',
        uiLinkColor: '#7b8a9b',
        uiShadowColor: '#1b1f24',
      },
      theme05: {
        accentColor: '#f59e0b',
        mutedColor: '#c8a77c',
        backgroundColor: '#fff2dd',
        stripeColor: '#f5d9b2',
        buttonColor: '#f59e0b',
        micColor: '#f0ddc0',
        userBadgeBgColor: '#f7e6cf',
        logBgColor: '#f7e6cf',
        fabColor: '#f59e0b',
        textColor: '#6a3f12',
        uiBackgroundColor: '#fff2dd',
        uiPanelColor: '#f7e6cf',
        uiPanelSoftColor: '#f5d9b2',
        uiTextColor: '#6a3f12',
        uiMutedColor: '#c8a77c',
        uiAccentColor: '#f59e0b',
        uiAccentStrongColor: '#f59e0b',
        uiBorderColor: '#f5d9b2',
        uiSuccessColor: '#f59e0b',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#f7e6cf',
        uiInputTextColor: '#6a3f12',
        uiInputBorderColor: '#f5d9b2',
        uiButtonBgColor: '#f59e0b',
        uiButtonTextColor: '#6a3f12',
        uiLinkColor: '#f59e0b',
        uiShadowColor: '#caa06b',
      },
      theme06: {
        accentColor: '#e08a3c',
        mutedColor: '#c9b19a',
        backgroundColor: '#2a1a12',
        stripeColor: '#3b2418',
        buttonColor: '#e08a3c',
        micColor: '#342116',
        userBadgeBgColor: '#2f1d15',
        logBgColor: '#2f1d15',
        fabColor: '#e08a3c',
        textColor: '#f3d8c1',
        uiBackgroundColor: '#2a1a12',
        uiPanelColor: '#2f1d15',
        uiPanelSoftColor: '#3b2418',
        uiTextColor: '#f3d8c1',
        uiMutedColor: '#c9b19a',
        uiAccentColor: '#e08a3c',
        uiAccentStrongColor: '#e08a3c',
        uiBorderColor: '#3b2418',
        uiSuccessColor: '#e08a3c',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#2f1d15',
        uiInputTextColor: '#f3d8c1',
        uiInputBorderColor: '#3b2418',
        uiButtonBgColor: '#e08a3c',
        uiButtonTextColor: '#2a1a12',
        uiLinkColor: '#e08a3c',
        uiShadowColor: '#120b08',
      },
      theme07: {
        accentColor: '#ff7aa2',
        mutedColor: '#cfa0b2',
        backgroundColor: '#fff1f5',
        stripeColor: '#ffd6e3',
        buttonColor: '#ff7aa2',
        micColor: '#ffe1ea',
        userBadgeBgColor: '#ffe8ef',
        logBgColor: '#ffe8ef',
        fabColor: '#ff7aa2',
        textColor: '#6e2b3f',
        uiBackgroundColor: '#fff1f5',
        uiPanelColor: '#ffe8ef',
        uiPanelSoftColor: '#ffd6e3',
        uiTextColor: '#6e2b3f',
        uiMutedColor: '#cfa0b2',
        uiAccentColor: '#ff7aa2',
        uiAccentStrongColor: '#ff7aa2',
        uiBorderColor: '#ffd6e3',
        uiSuccessColor: '#ff7aa2',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#ffe8ef',
        uiInputTextColor: '#6e2b3f',
        uiInputBorderColor: '#ffd6e3',
        uiButtonBgColor: '#ff7aa2',
        uiButtonTextColor: '#6e2b3f',
        uiLinkColor: '#ff7aa2',
        uiShadowColor: '#d8a7b8',
      },
      theme08: {
        accentColor: '#8a6bd6',
        mutedColor: '#b7a6d4',
        backgroundColor: '#f4ecfb',
        stripeColor: '#e6d7f6',
        buttonColor: '#8a6bd6',
        micColor: '#e9ddf6',
        userBadgeBgColor: '#efe6f8',
        logBgColor: '#efe6f8',
        fabColor: '#8a6bd6',
        textColor: '#3f2a66',
        uiBackgroundColor: '#f4ecfb',
        uiPanelColor: '#efe6f8',
        uiPanelSoftColor: '#e6d7f6',
        uiTextColor: '#3f2a66',
        uiMutedColor: '#b7a6d4',
        uiAccentColor: '#8a6bd6',
        uiAccentStrongColor: '#8a6bd6',
        uiBorderColor: '#e6d7f6',
        uiSuccessColor: '#8a6bd6',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#efe6f8',
        uiInputTextColor: '#3f2a66',
        uiInputBorderColor: '#e6d7f6',
        uiButtonBgColor: '#8a6bd6',
        uiButtonTextColor: '#3f2a66',
        uiLinkColor: '#8a6bd6',
        uiShadowColor: '#c4b0de',
      },
      theme09: {
        accentColor: '#c46aa5',
        mutedColor: '#c5a1b6',
        backgroundColor: '#201226',
        stripeColor: '#311b3b',
        buttonColor: '#c46aa5',
        micColor: '#2a162f',
        userBadgeBgColor: '#26172c',
        logBgColor: '#26172c',
        fabColor: '#c46aa5',
        textColor: '#f3d3e7',
        uiBackgroundColor: '#201226',
        uiPanelColor: '#26172c',
        uiPanelSoftColor: '#311b3b',
        uiTextColor: '#f3d3e7',
        uiMutedColor: '#c5a1b6',
        uiAccentColor: '#c46aa5',
        uiAccentStrongColor: '#c46aa5',
        uiBorderColor: '#311b3b',
        uiSuccessColor: '#c46aa5',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#26172c',
        uiInputTextColor: '#f3d3e7',
        uiInputBorderColor: '#311b3b',
        uiButtonBgColor: '#c46aa5',
        uiButtonTextColor: '#201226',
        uiLinkColor: '#c46aa5',
        uiShadowColor: '#120913',
      },
      theme10: {
        accentColor: '#8cd93c',
        mutedColor: '#9dbc86',
        backgroundColor: '#f2ffe6',
        stripeColor: '#dff5c4',
        buttonColor: '#8cd93c',
        micColor: '#e2f3cf',
        userBadgeBgColor: '#e9f7dc',
        logBgColor: '#e9f7dc',
        fabColor: '#8cd93c',
        textColor: '#2f5a2a',
        uiBackgroundColor: '#f2ffe6',
        uiPanelColor: '#e9f7dc',
        uiPanelSoftColor: '#dff5c4',
        uiTextColor: '#2f5a2a',
        uiMutedColor: '#9dbc86',
        uiAccentColor: '#8cd93c',
        uiAccentStrongColor: '#8cd93c',
        uiBorderColor: '#dff5c4',
        uiSuccessColor: '#8cd93c',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#e9f7dc',
        uiInputTextColor: '#2f5a2a',
        uiInputBorderColor: '#dff5c4',
        uiButtonBgColor: '#8cd93c',
        uiButtonTextColor: '#2f5a2a',
        uiLinkColor: '#8cd93c',
        uiShadowColor: '#c1d6ac',
      },
      theme11: {
        accentColor: '#3f8f4f',
        mutedColor: '#8fb1a0',
        backgroundColor: '#0f1f17',
        stripeColor: '#1b2b20',
        buttonColor: '#3f8f4f',
        micColor: '#15261c',
        userBadgeBgColor: '#13221a',
        logBgColor: '#13221a',
        fabColor: '#3f8f4f',
        textColor: '#cfead9',
        uiBackgroundColor: '#0f1f17',
        uiPanelColor: '#13221a',
        uiPanelSoftColor: '#1b2b20',
        uiTextColor: '#cfead9',
        uiMutedColor: '#8fb1a0',
        uiAccentColor: '#3f8f4f',
        uiAccentStrongColor: '#3f8f4f',
        uiBorderColor: '#1b2b20',
        uiSuccessColor: '#3f8f4f',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#13221a',
        uiInputTextColor: '#cfead9',
        uiInputBorderColor: '#1b2b20',
        uiButtonBgColor: '#3f8f4f',
        uiButtonTextColor: '#0f1f17',
        uiLinkColor: '#3f8f4f',
        uiShadowColor: '#08110d',
      },
      theme12: {
        accentColor: '#7fbf62',
        mutedColor: '#a1b99a',
        backgroundColor: '#eef6e9',
        stripeColor: '#d9ead1',
        buttonColor: '#7fbf62',
        micColor: '#dfe9d9',
        userBadgeBgColor: '#e7f1e1',
        logBgColor: '#e7f1e1',
        fabColor: '#7fbf62',
        textColor: '#35522a',
        uiBackgroundColor: '#eef6e9',
        uiPanelColor: '#e7f1e1',
        uiPanelSoftColor: '#d9ead1',
        uiTextColor: '#35522a',
        uiMutedColor: '#a1b99a',
        uiAccentColor: '#7fbf62',
        uiAccentStrongColor: '#7fbf62',
        uiBorderColor: '#d9ead1',
        uiSuccessColor: '#7fbf62',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#e7f1e1',
        uiInputTextColor: '#35522a',
        uiInputBorderColor: '#d9ead1',
        uiButtonBgColor: '#7fbf62',
        uiButtonTextColor: '#35522a',
        uiLinkColor: '#7fbf62',
        uiShadowColor: '#c7d3c0',
      },
      theme13: {
        accentColor: '#d7a87a',
        mutedColor: '#bfa58f',
        backgroundColor: '#f7efe3',
        stripeColor: '#ead8c1',
        buttonColor: '#d7a87a',
        micColor: '#e8d8c4',
        userBadgeBgColor: '#f0e2d1',
        logBgColor: '#f0e2d1',
        fabColor: '#d7a87a',
        textColor: '#5b3c20',
        uiBackgroundColor: '#f7efe3',
        uiPanelColor: '#f0e2d1',
        uiPanelSoftColor: '#ead8c1',
        uiTextColor: '#5b3c20',
        uiMutedColor: '#bfa58f',
        uiAccentColor: '#d7a87a',
        uiAccentStrongColor: '#d7a87a',
        uiBorderColor: '#ead8c1',
        uiSuccessColor: '#d7a87a',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#f0e2d1',
        uiInputTextColor: '#5b3c20',
        uiInputBorderColor: '#ead8c1',
        uiButtonBgColor: '#d7a87a',
        uiButtonTextColor: '#5b3c20',
        uiLinkColor: '#d7a87a',
        uiShadowColor: '#c9b49a',
      },
      theme14: {
        accentColor: '#b07a4a',
        mutedColor: '#bfa58f',
        backgroundColor: '#2b1b14',
        stripeColor: '#3b2418',
        buttonColor: '#b07a4a',
        micColor: '#342116',
        userBadgeBgColor: '#2f1d15',
        logBgColor: '#2f1d15',
        fabColor: '#b07a4a',
        textColor: '#f0d9c8',
        uiBackgroundColor: '#2b1b14',
        uiPanelColor: '#2f1d15',
        uiPanelSoftColor: '#3b2418',
        uiTextColor: '#f0d9c8',
        uiMutedColor: '#bfa58f',
        uiAccentColor: '#b07a4a',
        uiAccentStrongColor: '#b07a4a',
        uiBorderColor: '#3b2418',
        uiSuccessColor: '#b07a4a',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#2f1d15',
        uiInputTextColor: '#f0d9c8',
        uiInputBorderColor: '#3b2418',
        uiButtonBgColor: '#b07a4a',
        uiButtonTextColor: '#2b1b14',
        uiLinkColor: '#b07a4a',
        uiShadowColor: '#140c08',
      },
      theme15: {
        accentColor: '#2cb6a2',
        mutedColor: '#8fbdb2',
        backgroundColor: '#e8fff7',
        stripeColor: '#c8f3e6',
        buttonColor: '#2cb6a2',
        micColor: '#d9f4ea',
        userBadgeBgColor: '#e3f7f0',
        logBgColor: '#e3f7f0',
        fabColor: '#2cb6a2',
        textColor: '#1f5a48',
        uiBackgroundColor: '#e8fff7',
        uiPanelColor: '#e3f7f0',
        uiPanelSoftColor: '#c8f3e6',
        uiTextColor: '#1f5a48',
        uiMutedColor: '#8fbdb2',
        uiAccentColor: '#2cb6a2',
        uiAccentStrongColor: '#2cb6a2',
        uiBorderColor: '#c8f3e6',
        uiSuccessColor: '#2cb6a2',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#e3f7f0',
        uiInputTextColor: '#1f5a48',
        uiInputBorderColor: '#c8f3e6',
        uiButtonBgColor: '#2cb6a2',
        uiButtonTextColor: '#1f5a48',
        uiLinkColor: '#2cb6a2',
        uiShadowColor: '#b4ded2',
      },
      theme16: {
        accentColor: '#6bb6ff',
        mutedColor: '#9bb7cf',
        backgroundColor: '#edf6ff',
        stripeColor: '#d6e9ff',
        buttonColor: '#6bb6ff',
        micColor: '#dbeaff',
        userBadgeBgColor: '#e4f0ff',
        logBgColor: '#e4f0ff',
        fabColor: '#6bb6ff',
        textColor: '#1f4a63',
        uiBackgroundColor: '#edf6ff',
        uiPanelColor: '#e4f0ff',
        uiPanelSoftColor: '#d6e9ff',
        uiTextColor: '#1f4a63',
        uiMutedColor: '#9bb7cf',
        uiAccentColor: '#6bb6ff',
        uiAccentStrongColor: '#6bb6ff',
        uiBorderColor: '#d6e9ff',
        uiSuccessColor: '#6bb6ff',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#e4f0ff',
        uiInputTextColor: '#1f4a63',
        uiInputBorderColor: '#d6e9ff',
        uiButtonBgColor: '#6bb6ff',
        uiButtonTextColor: '#1f4a63',
        uiLinkColor: '#6bb6ff',
        uiShadowColor: '#b9cbe3',
      },
      theme17: {
        accentColor: '#00c2ff',
        mutedColor: '#8fb7c6',
        backgroundColor: '#0c1418',
        stripeColor: '#132027',
        buttonColor: '#00c2ff',
        micColor: '#101a20',
        userBadgeBgColor: '#101c22',
        logBgColor: '#101c22',
        fabColor: '#00c2ff',
        textColor: '#d3f4ff',
        uiBackgroundColor: '#0c1418',
        uiPanelColor: '#101c22',
        uiPanelSoftColor: '#132027',
        uiTextColor: '#d3f4ff',
        uiMutedColor: '#8fb7c6',
        uiAccentColor: '#00c2ff',
        uiAccentStrongColor: '#00c2ff',
        uiBorderColor: '#132027',
        uiSuccessColor: '#00c2ff',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#101c22',
        uiInputTextColor: '#d3f4ff',
        uiInputBorderColor: '#132027',
        uiButtonBgColor: '#00c2ff',
        uiButtonTextColor: '#0c1418',
        uiLinkColor: '#00c2ff',
        uiShadowColor: '#05080a',
      },
      theme18: {
        accentColor: '#f2c84b',
        mutedColor: '#bda870',
        backgroundColor: '#fffbe6',
        stripeColor: '#f7efc2',
        buttonColor: '#f2c84b',
        micColor: '#f4efcf',
        userBadgeBgColor: '#f8f3d8',
        logBgColor: '#f8f3d8',
        fabColor: '#f2c84b',
        textColor: '#6b4d0f',
        uiBackgroundColor: '#fffbe6',
        uiPanelColor: '#f8f3d8',
        uiPanelSoftColor: '#f7efc2',
        uiTextColor: '#6b4d0f',
        uiMutedColor: '#bda870',
        uiAccentColor: '#f2c84b',
        uiAccentStrongColor: '#f2c84b',
        uiBorderColor: '#f7efc2',
        uiSuccessColor: '#f2c84b',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#f8f3d8',
        uiInputTextColor: '#6b4d0f',
        uiInputBorderColor: '#f7efc2',
        uiButtonBgColor: '#f2c84b',
        uiButtonTextColor: '#6b4d0f',
        uiLinkColor: '#f2c84b',
        uiShadowColor: '#d7c59a',
      },
      theme19: {
        accentColor: '#d85b6a',
        mutedColor: '#caa0ad',
        backgroundColor: '#ffe9f0',
        stripeColor: '#ffd0dc',
        buttonColor: '#d85b6a',
        micColor: '#f3d6de',
        userBadgeBgColor: '#f7dfe5',
        logBgColor: '#f7dfe5',
        fabColor: '#d85b6a',
        textColor: '#6e2b3f',
        uiBackgroundColor: '#ffe9f0',
        uiPanelColor: '#f7dfe5',
        uiPanelSoftColor: '#ffd0dc',
        uiTextColor: '#6e2b3f',
        uiMutedColor: '#caa0ad',
        uiAccentColor: '#d85b6a',
        uiAccentStrongColor: '#d85b6a',
        uiBorderColor: '#ffd0dc',
        uiSuccessColor: '#d85b6a',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#f7dfe5',
        uiInputTextColor: '#6e2b3f',
        uiInputBorderColor: '#ffd0dc',
        uiButtonBgColor: '#d85b6a',
        uiButtonTextColor: '#6e2b3f',
        uiLinkColor: '#d85b6a',
        uiShadowColor: '#c79aa5',
      },
      theme20: {
        accentColor: '#3b6bff',
        mutedColor: '#9fb3d1',
        backgroundColor: '#10203a',
        stripeColor: '#1a2e55',
        buttonColor: '#3b6bff',
        micColor: '#152746',
        userBadgeBgColor: '#13233e',
        logBgColor: '#13233e',
        fabColor: '#3b6bff',
        textColor: '#d6e4ff',
        uiBackgroundColor: '#10203a',
        uiPanelColor: '#13233e',
        uiPanelSoftColor: '#1a2e55',
        uiTextColor: '#d6e4ff',
        uiMutedColor: '#9fb3d1',
        uiAccentColor: '#3b6bff',
        uiAccentStrongColor: '#3b6bff',
        uiBorderColor: '#1a2e55',
        uiSuccessColor: '#3b6bff',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#13233e',
        uiInputTextColor: '#d6e4ff',
        uiInputBorderColor: '#1a2e55',
        uiButtonBgColor: '#3b6bff',
        uiButtonTextColor: '#10203a',
        uiLinkColor: '#3b6bff',
        uiShadowColor: '#08121f',
      },
      theme21: {
        accentColor: '#d5a36c',
        mutedColor: '#c2a98a',
        backgroundColor: '#fff7ea',
        stripeColor: '#f1e1c8',
        buttonColor: '#d5a36c',
        micColor: '#efe1cc',
        userBadgeBgColor: '#f5e8d6',
        logBgColor: '#f5e8d6',
        fabColor: '#d5a36c',
        textColor: '#5b3c20',
        uiBackgroundColor: '#fff7ea',
        uiPanelColor: '#f5e8d6',
        uiPanelSoftColor: '#f1e1c8',
        uiTextColor: '#5b3c20',
        uiMutedColor: '#c2a98a',
        uiAccentColor: '#d5a36c',
        uiAccentStrongColor: '#d5a36c',
        uiBorderColor: '#f1e1c8',
        uiSuccessColor: '#d5a36c',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#f5e8d6',
        uiInputTextColor: '#5b3c20',
        uiInputBorderColor: '#f1e1c8',
        uiButtonBgColor: '#d5a36c',
        uiButtonTextColor: '#5b3c20',
        uiLinkColor: '#d5a36c',
        uiShadowColor: '#cdb28f',
      },
      theme22: {
        accentColor: '#e5e5e5',
        mutedColor: '#a3a3a3',
        backgroundColor: '#0f0f10',
        stripeColor: '#262626',
        buttonColor: '#f5f5f5',
        micColor: '#1a1a1a',
        userBadgeBgColor: '#141414',
        logBgColor: '#141414',
        fabColor: '#f5f5f5',
        textColor: '#f5f5f5',
        uiBackgroundColor: '#0f0f10',
        uiPanelColor: '#141414',
        uiPanelSoftColor: '#262626',
        uiTextColor: '#f5f5f5',
        uiMutedColor: '#a3a3a3',
        uiAccentColor: '#e5e5e5',
        uiAccentStrongColor: '#e5e5e5',
        uiBorderColor: '#262626',
        uiSuccessColor: '#e5e5e5',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#141414',
        uiInputTextColor: '#f5f5f5',
        uiInputBorderColor: '#262626',
        uiButtonBgColor: '#f5f5f5',
        uiButtonTextColor: '#0f0f10',
        uiLinkColor: '#e5e5e5',
        uiShadowColor: '#000000',
      },
      theme23: {
        accentColor: '#c3424d',
        mutedColor: '#c59aa3',
        backgroundColor: '#2a1115',
        stripeColor: '#3b1a20',
        buttonColor: '#c3424d',
        micColor: '#34171b',
        userBadgeBgColor: '#2f1418',
        logBgColor: '#2f1418',
        fabColor: '#c3424d',
        textColor: '#f2c8cf',
        uiBackgroundColor: '#2a1115',
        uiPanelColor: '#2f1418',
        uiPanelSoftColor: '#3b1a20',
        uiTextColor: '#f2c8cf',
        uiMutedColor: '#c59aa3',
        uiAccentColor: '#c3424d',
        uiAccentStrongColor: '#c3424d',
        uiBorderColor: '#3b1a20',
        uiSuccessColor: '#c3424d',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#2f1418',
        uiInputTextColor: '#f2c8cf',
        uiInputBorderColor: '#3b1a20',
        uiButtonBgColor: '#c3424d',
        uiButtonTextColor: '#2a1115',
        uiLinkColor: '#c3424d',
        uiShadowColor: '#14080a',
      },
      theme24: {
        accentColor: '#2cb6a2',
        mutedColor: '#8fb7ad',
        backgroundColor: '#0f2021',
        stripeColor: '#193032',
        buttonColor: '#2cb6a2',
        micColor: '#142a2b',
        userBadgeBgColor: '#132728',
        logBgColor: '#132728',
        fabColor: '#2cb6a2',
        textColor: '#c9ece7',
        uiBackgroundColor: '#0f2021',
        uiPanelColor: '#132728',
        uiPanelSoftColor: '#193032',
        uiTextColor: '#c9ece7',
        uiMutedColor: '#8fb7ad',
        uiAccentColor: '#2cb6a2',
        uiAccentStrongColor: '#2cb6a2',
        uiBorderColor: '#193032',
        uiSuccessColor: '#2cb6a2',
        uiDangerColor: '#d16464',
        uiInputBgColor: '#132728',
        uiInputTextColor: '#c9ece7',
        uiInputBorderColor: '#193032',
        uiButtonBgColor: '#2cb6a2',
        uiButtonTextColor: '#0f2021',
        uiLinkColor: '#2cb6a2',
        uiShadowColor: '#071112',
      },
    };
    const selected = templates[templateKey];
    if (!selected) return;
    const palette = {
      theme: {
        accentColor: selected.accentColor,
        mutedColor: selected.mutedColor,
      },
      main: {
        backgroundColor: selected.backgroundColor,
        stripeColor: selected.stripeColor,
        buttonColor: selected.buttonColor,
        micColor: selected.micColor,
        userBadgeBgColor: selected.userBadgeBgColor,
        logBgColor: selected.logBgColor,
        fabColor: selected.fabColor,
        textColor: selected.textColor,
      },
      ui: {
        backgroundColor: selected.uiBackgroundColor ?? selected.backgroundColor,
        panelColor: selected.uiPanelColor ?? selected.backgroundColor,
        panelSoftColor: selected.uiPanelSoftColor ?? selected.backgroundColor,
        textColor: selected.uiTextColor ?? selected.textColor,
        mutedColor: selected.uiMutedColor ?? selected.mutedColor,
        accentColor: selected.uiAccentColor ?? selected.accentColor,
        accentStrongColor: selected.uiAccentStrongColor ?? selected.accentColor,
        borderColor: selected.uiBorderColor ?? selected.mutedColor,
        successColor: selected.uiSuccessColor ?? settings.ui.successColor,
        dangerColor: selected.uiDangerColor ?? settings.ui.dangerColor,
        inputBgColor: selected.uiInputBgColor ?? selected.backgroundColor,
        inputTextColor: selected.uiInputTextColor ?? selected.textColor,
        inputBorderColor: selected.uiInputBorderColor ?? selected.mutedColor,
        buttonBgColor: selected.uiButtonBgColor ?? selected.accentColor,
        buttonTextColor: selected.uiButtonTextColor ?? selected.textColor,
        linkColor: selected.uiLinkColor ?? selected.accentColor,
        shadowColor: selected.uiShadowColor ?? settings.ui.shadowColor,
      },
    };
    applyPalette(palette);
  };

  elements.colorTemplate?.addEventListener('change', (event) => {
    settings.theme.template = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyThemeTemplate(event.target.value);
  });

  elements.themeSaveButton?.addEventListener('click', () => {
    const name = elements.themeSaveName?.value.trim();
    if (!name) {
      window.alert('ユーザーテーマ名を入力してください。');
      return;
    }
    const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}`;
    const palette = buildCurrentPalette();
    settings.theme.userThemes = settings.theme.userThemes || [];
    settings.theme.userThemes.push({ id, name, palette });
    settings.theme.template = `user:${id}`;
    saveSettings(settings);
    scheduleSaveToServer();
    rebuildTemplateOptions();
    if (elements.colorTemplate) elements.colorTemplate.value = settings.theme.template;
    if (elements.themeSaveName) elements.themeSaveName.value = '';
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.themeDeleteButton?.addEventListener('click', () => {
    const selected = settings.theme.template || '';
    if (!selected.startsWith('user:')) {
      window.alert('削除できるユーザーテーマが選択されていません。');
      return;
    }
    const id = selected.replace('user:', '');
    settings.theme.userThemes = (settings.theme.userThemes || []).filter((item) => item.id !== id);
    settings.theme.template = '';
    saveSettings(settings);
    scheduleSaveToServer();
    rebuildTemplateOptions();
    if (elements.colorTemplate) elements.colorTemplate.value = '';
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
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

  elements.uiBgColor?.addEventListener('change', (event) => {
    settings.ui.backgroundColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiPanelColor?.addEventListener('change', (event) => {
    settings.ui.panelColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiPanelSoftColor?.addEventListener('change', (event) => {
    settings.ui.panelSoftColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiTextColor?.addEventListener('change', (event) => {
    settings.ui.textColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiMutedColor?.addEventListener('change', (event) => {
    settings.ui.mutedColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiAccentColor?.addEventListener('change', (event) => {
    settings.ui.accentColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiAccentStrongColor?.addEventListener('change', (event) => {
    settings.ui.accentStrongColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiBorderColor?.addEventListener('change', (event) => {
    settings.ui.borderColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiSuccessColor?.addEventListener('change', (event) => {
    settings.ui.successColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiDangerColor?.addEventListener('change', (event) => {
    settings.ui.dangerColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiInputBgColor?.addEventListener('change', (event) => {
    settings.ui.inputBgColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiInputTextColor?.addEventListener('change', (event) => {
    settings.ui.inputTextColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiInputBorderColor?.addEventListener('change', (event) => {
    settings.ui.inputBorderColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiButtonBgColor?.addEventListener('change', (event) => {
    settings.ui.buttonBgColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiButtonTextColor?.addEventListener('change', (event) => {
    settings.ui.buttonTextColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiLinkColor?.addEventListener('change', (event) => {
    settings.ui.linkColor = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    applyToPage(settings);
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.uiShadowColor?.addEventListener('change', (event) => {
    settings.ui.shadowColor = event.target.value;
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

  elements.displayAllSpeechToggle?.addEventListener('change', (event) => {
    settings.main.displayAllSpeech = event.target.checked;
    saveSettings(settings);
    scheduleSaveToServer();
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  elements.endWord?.addEventListener('input', (event) => {
    settings.main.endWord = event.target.value;
    saveSettings(settings);
    scheduleSaveToServer();
    document.dispatchEvent(new CustomEvent('app-settings:updated'));
  });

  const applySettingsFromServer = (serverSettings) => {
    if (!serverSettings || typeof serverSettings !== 'object') return;
    applyingRemote = true;
    settings = {
      general: { ...defaultSettings.general, ...(serverSettings.general || {}) },
      main: { ...defaultSettings.main, ...(serverSettings.main || {}) },
      ui: { ...defaultSettings.ui, ...(serverSettings.ui || {}) },
      character: { ...defaultSettings.character, ...(serverSettings.character || {}) },
      theme: { ...defaultSettings.theme, ...(serverSettings.theme || {}) },
    };
    if (!Array.isArray(settings.theme.userThemes)) {
      settings.theme.userThemes = [];
    }
    if (elements.fontFamily) elements.fontFamily.value = settings.general.fontFamily;
    rebuildTemplateOptions();
    if (elements.accentColor) elements.accentColor.value = settings.theme.accentColor;
    if (elements.mutedColor) elements.mutedColor.value = settings.theme.mutedColor;
    if (elements.uiBgColor) elements.uiBgColor.value = settings.ui.backgroundColor;
    if (elements.uiPanelColor) elements.uiPanelColor.value = settings.ui.panelColor;
    if (elements.uiPanelSoftColor) elements.uiPanelSoftColor.value = settings.ui.panelSoftColor;
    if (elements.uiTextColor) elements.uiTextColor.value = settings.ui.textColor;
    if (elements.uiMutedColor) elements.uiMutedColor.value = settings.ui.mutedColor;
    if (elements.uiAccentColor) elements.uiAccentColor.value = settings.ui.accentColor;
    if (elements.uiAccentStrongColor) elements.uiAccentStrongColor.value = settings.ui.accentStrongColor;
    if (elements.uiBorderColor) elements.uiBorderColor.value = settings.ui.borderColor;
    if (elements.uiSuccessColor) elements.uiSuccessColor.value = settings.ui.successColor;
    if (elements.uiDangerColor) elements.uiDangerColor.value = settings.ui.dangerColor;
    if (elements.uiInputBgColor) elements.uiInputBgColor.value = settings.ui.inputBgColor;
    if (elements.uiInputTextColor) elements.uiInputTextColor.value = settings.ui.inputTextColor;
    if (elements.uiInputBorderColor) elements.uiInputBorderColor.value = settings.ui.inputBorderColor;
    if (elements.uiButtonBgColor) elements.uiButtonBgColor.value = settings.ui.buttonBgColor;
    if (elements.uiButtonTextColor) elements.uiButtonTextColor.value = settings.ui.buttonTextColor;
    if (elements.uiLinkColor) elements.uiLinkColor.value = settings.ui.linkColor;
    if (elements.uiShadowColor) elements.uiShadowColor.value = settings.ui.shadowColor;
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
