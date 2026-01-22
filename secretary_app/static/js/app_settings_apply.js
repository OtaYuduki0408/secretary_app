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

    if (general.fontFamily) {
      root.style.setProperty('--app-font', general.fontFamily);
      body.style.fontFamily = general.fontFamily;
    } else {
      root.style.removeProperty('--app-font');
      body.style.removeProperty('font-family');
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
})();
