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
    } else {
      root.style.removeProperty('--app-font');
    }

    if (main.backgroundColor) {
      body.style.backgroundColor = main.backgroundColor;
      body.style.backgroundImage = 'none';
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySettings);
  } else {
    applySettings();
  }

  window.addEventListener('storage', applySettings);
})();
