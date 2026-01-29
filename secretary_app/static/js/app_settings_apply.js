(() => {
  const hexToRgb = (hex) => {
    if (!hex || typeof hex !== 'string') return null;
    const raw = hex.replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
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

    if (main.stripeColor) {
      root.style.setProperty('--stripe-color', main.stripeColor);
    }
    if (main.buttonColor) {
      root.style.setProperty('--main-btn-color', main.buttonColor);
    }

    if (main.backgroundColor) {
      const color = hexToRgb(main.backgroundColor);
      if (color) {
        const clamp = (value) => Math.min(255, Math.max(0, Math.round(value)));
        const scale = (value, factor) => clamp(value * factor);
        const dark = `rgb(${scale(color.r, 0.55)}, ${scale(color.g, 0.55)}, ${scale(color.b, 0.55)})`;
        const mid = `rgb(${scale(color.r, 0.78)}, ${scale(color.g, 0.78)}, ${scale(color.b, 0.78)})`;
        const glow1 = `rgba(${color.r}, ${color.g}, ${color.b}, 0.18)`;
        const glow2 = `rgba(${color.r}, ${color.g}, ${color.b}, 0.12)`;
        root.style.setProperty('--bg-1', dark);
        root.style.setProperty('--bg-2', mid);
        root.style.setProperty('--wallpaper', `radial-gradient(circle at 18% 22%, ${glow1}, transparent 45%), radial-gradient(circle at 70% 10%, ${glow2}, transparent 55%), linear-gradient(180deg, ${mid} 0%, ${dark} 100%)`);
        root.style.setProperty('--wallpaper-darken', 'rgba(6,12,32,.18)');
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
