(() => {
  const applySettings = () => {
    const root = document.documentElement;
    const body = document.body;
    if (!body || !root) return;

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
      root.style.removeProperty('--co-bg');
      root.style.removeProperty('--co-gradient');
      root.style.removeProperty('--co-card-bg');
    }

    root.style.minHeight = '100%';
    root.style.height = '100%';
    body.style.minHeight = '100%';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySettings);
  } else {
    applySettings();
  }

  window.addEventListener('storage', applySettings);
  document.addEventListener('app-settings:updated', applySettings);
})();
