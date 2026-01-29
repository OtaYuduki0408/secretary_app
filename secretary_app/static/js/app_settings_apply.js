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
    const theme = settings?.theme || {};
    const character = settings?.character || {};

    if (general.fontFamily) {
      root.style.setProperty('--app-font', general.fontFamily);
      body.style.fontFamily = general.fontFamily;
    } else {
      root.style.removeProperty('--app-font');
      body.style.removeProperty('font-family');
    }

    if (theme.accentColor) {
      root.style.setProperty('--accent', theme.accentColor);
      root.style.setProperty('--accent-strong', theme.accentColor);
      root.style.setProperty('--ring', theme.accentColor);
      root.style.setProperty('--co-accent', theme.accentColor);
      root.style.setProperty('--co-accent-strong', theme.accentColor);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-strong');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--co-accent');
      root.style.removeProperty('--co-accent-strong');
    }

    if (theme.mutedColor) {
      root.style.setProperty('--muted', theme.mutedColor);
      root.style.setProperty('--co-muted', theme.mutedColor);
    } else {
      root.style.removeProperty('--muted');
      root.style.removeProperty('--co-muted');
    }

    if (main.backgroundColor) {
      const color = hexToRgb(main.backgroundColor);
      if (color) {
        const base = `rgb(${color.r}, ${color.g}, ${color.b})`;
        const glow1 = `rgba(${color.r}, ${color.g}, ${color.b}, 0.18)`;
        const glow2 = `rgba(${color.r}, ${color.g}, ${color.b}, 0.12)`;
        root.style.setProperty('--bg-1', base);
        root.style.setProperty('--bg-2', base);
        root.style.setProperty('--wallpaper', `radial-gradient(circle at 18% 22%, ${glow1}, transparent 45%), radial-gradient(circle at 70% 10%, ${glow2}, transparent 55%), linear-gradient(180deg, ${base} 0%, ${base} 100%)`);
        root.style.setProperty('--wallpaper-darken', 'rgba(0,0,0,0)');
      }

      if (!isMainSpecial) {
        root.style.backgroundColor = main.backgroundColor;
        body.style.backgroundColor = main.backgroundColor;
        root.style.backgroundImage = 'none';
        body.style.backgroundImage = 'none';
        root.style.backgroundRepeat = 'no-repeat';
        body.style.backgroundRepeat = 'no-repeat';
        root.style.backgroundAttachment = 'fixed';
        body.style.backgroundAttachment = 'fixed';
        root.style.backgroundSize = 'cover';
        body.style.backgroundSize = 'cover';
      } else {
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

      root.style.setProperty('--co-bg', main.backgroundColor);
      root.style.setProperty('--co-gradient', `linear-gradient(140deg, ${main.backgroundColor} 0%, ${main.backgroundColor} 100%)`);
      root.style.setProperty('--co-card-bg', 'rgba(17, 24, 39, 0.7)');
    }
    if (!main.backgroundColor) {
      root.style.removeProperty('background-color');
      body.style.removeProperty('background-color');
      body.style.removeProperty('background-image');
      root.style.removeProperty('background-image');
      root.style.removeProperty('background-repeat');
      body.style.removeProperty('background-repeat');
      root.style.removeProperty('background-attachment');
      body.style.removeProperty('background-attachment');
      root.style.removeProperty('background-size');
      body.style.removeProperty('background-size');
      root.style.removeProperty('--bg-1');
      root.style.removeProperty('--bg-2');
      root.style.removeProperty('--wallpaper');
      root.style.removeProperty('--wallpaper-darken');
      root.style.removeProperty('--co-bg');
      root.style.removeProperty('--co-gradient');
      root.style.removeProperty('--co-card-bg');
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
      root.style.setProperty('--text', main.textColor);
    } else {
      root.style.removeProperty('--main-text-color');
      root.style.removeProperty('--text');
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
      const alreadyFetched = sessionStorage.getItem('appSettingsFetched');
      if (alreadyFetched) return;
      const res = await fetch('/api/user_settings');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.settings) {
        localStorage.setItem('appSettings', JSON.stringify(data.settings));
        document.dispatchEvent(new CustomEvent('app-settings:updated'));
      }
      sessionStorage.setItem('appSettingsFetched', 'true');
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
