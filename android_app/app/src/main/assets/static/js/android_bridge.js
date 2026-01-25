(() => {
  if (!window.AndroidSync || window.__androidFetchPatched) return;
  window.__androidFetchPatched = true;

  const originalFetch = window.fetch.bind(window);

  async function handleAndroidFetch(url, init = {}) {
    const method = (init.method || "GET").toUpperCase();
    const body = init.body || null;
    try {
      const raw = window.AndroidSync.request(method, url, body);
      const parsed = raw ? JSON.parse(raw) : { status: 500, body: { error: "empty_response" } };
      const status = parsed.status || 200;
      const bodyObj = parsed.body ?? {};
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => bodyObj,
        text: async () => JSON.stringify(bodyObj),
      };
    } catch (e) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: String(e) }),
        text: async () => String(e),
      };
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.startsWith("/api") || url.startsWith("/order/api") || url.startsWith("/web_api")) {
      return handleAndroidFetch(url, init);
    }
    return originalFetch(input, init);
  };
})();
