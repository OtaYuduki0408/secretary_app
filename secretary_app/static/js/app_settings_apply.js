(() => {
  const hexToRgb = (hex) => {
    if (!hex || typeof hex !== 'string') return null;
    const raw = hex.replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  };

  const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h: h * 360, s, l };
  };

  const setRgbVar = (root, name, hex) => {
    const color = hexToRgb(hex);
    if (!color) {
      root.style.removeProperty(name);
      return null;
    }
    root.style.setProperty(name, `${color.r}, ${color.g}, ${color.b}`);
    return color;
  };

  const buildColorFilter = (hex) => {
    const baseColor = { r: 177, g: 214, b: 86 };
    const baseHsl = rgbToHsl(baseColor.r, baseColor.g, baseColor.b);
    const target = hexToRgb(hex);
    if (!target) return 'none';
    const targetHsl = rgbToHsl(target.r, target.g, target.b);
    const hueRotate = targetHsl.h - baseHsl.h;
    const saturate = baseHsl.s > 0 ? targetHsl.s / baseHsl.s : 1;
    const brightness = baseHsl.l > 0 ? targetHsl.l / baseHsl.l : 1;
    return `hue-rotate(${hueRotate.toFixed(1)}deg) saturate(${saturate.toFixed(2)}) brightness(${brightness.toFixed(2)})`;
  };

  const applySettings = () => {
    const root = document.documentElement;
    const body = document.body;
    if (!body || !root) return;
    const isMainSpecial = Boolean(document.querySelector('.parallax') || document.getElementById('plx-back'));

    let settings = null;
    try {
      const raw = localStorage.getItem('appSettings');
      settings = raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('設定の読み込みに失敗しました。', e);
    }

    const general = settings?.general || {};
    const main = settings?.main || {};
    const ui = settings?.ui || {};
    const theme = settings?.theme || {};
    const character = settings?.character || {};

    if (general.fontFamily) {
      root.style.setProperty('--app-font', general.fontFamily);
      body.style.fontFamily = general.fontFamily;
    } else {
      root.style.removeProperty('--app-font');
      body.style.removeProperty('font-family');
    }

    const accentBase = ui.accentColor || theme.accentColor;
    if (accentBase) {
      root.style.setProperty('--accent', accentBase);
      root.style.setProperty('--accent-strong', ui.accentStrongColor || theme.accentColor || accentBase);
      root.style.setProperty('--ring', accentBase);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-strong');
      root.style.removeProperty('--ring');
    }

    const mutedBase = ui.mutedColor || theme.mutedColor;
    if (mutedBase) {
      root.style.setProperty('--muted', mutedBase);
    } else {
      root.style.removeProperty('--muted');
    }

    if (ui.backgroundColor) root.style.setProperty('--app-bg', ui.backgroundColor);
    if (ui.panelColor) root.style.setProperty('--app-panel', ui.panelColor);
    if (ui.panelSoftColor) root.style.setProperty('--app-panel-soft', ui.panelSoftColor);
    if (ui.panelColor) root.style.setProperty('--panel', ui.panelColor);
    if (ui.panelSoftColor) root.style.setProperty('--panel-2', ui.panelSoftColor);
    if (ui.textColor) {
      root.style.setProperty('--app-text', ui.textColor);
      if (!isMainSpecial) root.style.setProperty('--text', ui.textColor);
    }
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

    const accentRgb = setRgbVar(root, '--app-accent-rgb', ui.accentColor);
    setRgbVar(root, '--app-accent-strong-rgb', ui.accentStrongColor);
    setRgbVar(root, '--app-success-rgb', ui.successColor);
    setRgbVar(root, '--app-danger-rgb', ui.dangerColor);
    setRgbVar(root, '--app-border-rgb', ui.borderColor);
    setRgbVar(root, '--app-text-rgb', ui.textColor);
    setRgbVar(root, '--app-muted-rgb', ui.mutedColor);

    if (ui.shadowColor) {
      const shadowRgb = hexToRgb(ui.shadowColor);
      if (shadowRgb) {
        root.style.setProperty('--app-shadow', `0 20px 45px rgba(${shadowRgb.r}, ${shadowRgb.g}, ${shadowRgb.b}, 0.35)`);
      }
    }

    if (main.backgroundColor) {
      root.style.setProperty('--main-bg-color', main.backgroundColor);
    } else {
      root.style.removeProperty('--main-bg-color');
    }

    if (main.backgroundColor && isMainSpecial) {
      const color = hexToRgb(main.backgroundColor);
      if (color) {
        const base = `rgb(${color.r}, ${color.g}, ${color.b})`;
        root.style.setProperty('--bg-1', base);
        root.style.setProperty('--bg-2', base);
        root.style.setProperty('--wallpaper', `linear-gradient(180deg, ${base} 0%, ${base} 100%)`);
        root.style.setProperty('--wallpaper-darken', 'rgba(0,0,0,0)');
      }

      body.style.backgroundColor = body.style.backgroundColor || 'transparent';
      root.style.backgroundColor = root.style.backgroundColor || 'transparent';
      body.style.removeProperty('background-image');
      root.style.removeProperty('background-image');
      body.style.removeProperty('background-repeat');
      root.style.removeProperty('background-repeat');
      body.style.removeProperty('background-attachment');
      root.style.removeProperty('background-attachment');
      body.style.removeProperty('background-size');
      root.style.removeProperty('background-size');
    }
    if (!main.backgroundColor || !isMainSpecial) {
      root.style.removeProperty('--bg-1');
      root.style.removeProperty('--bg-2');
      root.style.removeProperty('--wallpaper');
      root.style.removeProperty('--wallpaper-darken');
    }

    if (!isMainSpecial && ui.backgroundColor) {
      root.style.backgroundColor = ui.backgroundColor;
      body.style.backgroundColor = ui.backgroundColor;
      root.style.backgroundImage = 'none';
      body.style.backgroundImage = 'none';
      root.style.backgroundRepeat = 'no-repeat';
      body.style.backgroundRepeat = 'no-repeat';
      root.style.backgroundAttachment = 'fixed';
      body.style.backgroundAttachment = 'fixed';
      root.style.backgroundSize = 'cover';
      body.style.backgroundSize = 'cover';
    }


    if (main.stripeColor) {
      root.style.setProperty('--stripe-color', main.stripeColor);
    } else {
      root.style.removeProperty('--stripe-color');
    }
    if (main.buttonColor) {
      root.style.setProperty('--main-btn-color', main.buttonColor);
      root.style.setProperty('--main-fab-bg', main.buttonColor);
    } else {
      root.style.removeProperty('--main-btn-color');
      root.style.removeProperty('--main-fab-bg');
    }
    if (main.micColor) {
      root.style.setProperty('--main-mic-surface', main.micColor);
      root.style.setProperty('--main-mic-glow', main.micColor);
    } else {
      root.style.removeProperty('--main-mic-surface');
      root.style.removeProperty('--main-mic-glow');
    }
    if (main.userBadgeBgColor) {
      root.style.setProperty('--main-user-badge-bg', main.userBadgeBgColor);
    } else {
      root.style.removeProperty('--main-user-badge-bg');
    }
    if (main.logBgColor) {
      root.style.setProperty('--main-log-bg', main.logBgColor);
    } else {
      root.style.removeProperty('--main-log-bg');
    }
    if (main.fabColor) {
      root.style.setProperty('--main-fab-bg', main.fabColor);
    } else if (!main.buttonColor) {
      root.style.removeProperty('--main-fab-bg');
    }
    if (main.textColor) {
      root.style.setProperty('--main-text-color', main.textColor);
      root.style.setProperty('--main-btn-text', main.textColor);
      root.style.setProperty('--main-icon-color', main.textColor);
      if (isMainSpecial) {
        root.style.setProperty('--text', main.textColor);
      }
    } else {
      root.style.removeProperty('--main-text-color');
      root.style.removeProperty('--main-btn-text');
      root.style.removeProperty('--main-icon-color');
      if (isMainSpecial) {
        root.style.removeProperty('--text');
      }
    }

    if (ui.backgroundColor) {
      root.style.setProperty('--co-bg', ui.backgroundColor);
      root.style.setProperty('--co-gradient', `linear-gradient(140deg, ${ui.backgroundColor} 0%, ${ui.backgroundColor} 100%)`);
    }
    if (ui.panelColor) {
      root.style.setProperty('--co-card-bg', ui.panelColor);
    }
    if (ui.borderColor) {
      const border = hexToRgb(ui.borderColor);
      if (border) {
        root.style.setProperty('--co-border', `rgba(${border.r}, ${border.g}, ${border.b}, 0.18)`);
        root.style.setProperty('--co-border-strong', `rgba(${border.r}, ${border.g}, ${border.b}, 0.35)`);
      }
    }
    if (ui.textColor) root.style.setProperty('--co-text', ui.textColor);
    if (ui.mutedColor) root.style.setProperty('--co-muted', ui.mutedColor);
    if (ui.accentColor) root.style.setProperty('--co-accent', ui.accentColor);
    if (ui.accentStrongColor) root.style.setProperty('--co-accent-strong', ui.accentStrongColor);
    if (ui.dangerColor) root.style.setProperty('--co-danger', ui.dangerColor);
    if (ui.shadowColor) {
      const coShadow = hexToRgb(ui.shadowColor);
      if (coShadow) {
        root.style.setProperty('--co-shadow', `0 25px 50px -12px rgba(${coShadow.r}, ${coShadow.g}, ${coShadow.b}, 0.25)`);
      }
    }

    // キャラクター設定
    if (character.size) {
      root.style.setProperty('--character-size', `${character.size}px`);
    } else {
      root.style.removeProperty('--character-size');
    }
    if (character.color) {
      root.style.setProperty('--character-filter', buildColorFilter(character.color));
    } else {
      root.style.removeProperty('--character-filter');
    }
    const characterEl = document.getElementById('character-buddy');
    if (characterEl) {
      const enabled = character.enabled !== false;
      characterEl.style.display = enabled ? 'block' : 'none';
    }

    root.style.minHeight = '100%';
    root.style.height = '100%';
    body.style.minHeight = '100%';
  };

  const fetchSettingsFromServer = async () => {
    try {
      const res = await fetch('/api/user_settings');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.settings) {
        localStorage.setItem('appSettings', JSON.stringify(data.settings));
        document.dispatchEvent(new CustomEvent('app-settings:updated'));
      }
    } catch (e) {
      // ログイン前などで失敗するため静かに無視する
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySettings);
  } else {
    applySettings();
  }

  fetchSettingsFromServer();
  window.addEventListener('storage', applySettings);
  document.addEventListener('app-settings:updated', applySettings);
})();
