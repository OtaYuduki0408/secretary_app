// -----------------------------------------------------------------------------
// Parallax_and_Theme_rotation.js
// 機能: 背景のパララックス効果＋テーマの自動切り替え＋複数トリガー対応
// -----------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ Parallax_and_Theme_rotation.js loaded");

  // ==============================
  // 設定値
  // ==============================
  const themes = [
    { name: "default", bgColor: "#1e1e1e", textColor: "#fff" },
    { name: "light", bgColor: "#f4f4f4", textColor: "#222" },
    { name: "ocean", bgColor: "#004d73", textColor: "#e0f7fa" },
    { name: "sunset", bgColor: "#ff7043", textColor: "#fff3e0" }
  ];

  let currentThemeIndex = 0;

  // ==============================
  // パララックス効果の処理
  // ==============================
  window.addEventListener("scroll", () => {
    const scrollY = window.scrollY;
    const parallaxElements = document.querySelectorAll(".parallax");

    parallaxElements.forEach((el, index) => {
      const speed = parseFloat(el.getAttribute("data-speed")) || 0.3;
      el.style.transform = `translateY(${scrollY * speed}px)`;
    });
  });

  // ==============================
  // テーマ切り替え処理
  // ==============================
  function applyTheme(theme) {
    document.body.style.backgroundColor = theme.bgColor;
    document.body.style.color = theme.textColor;
    document.body.setAttribute("data-theme", theme.name);

    // ログ
    console.log(`🎨 Theme changed to: ${theme.name}`);
  }

  function nextTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    applyTheme(themes[currentThemeIndex]);
  }

  // ==============================
  // 複数トリガー登録対応
  // ==============================
  const triggers = document.querySelectorAll(".theme-trigger, .rotate-trigger");
  if (triggers.length > 0) {
    triggers.forEach(trigger => {
      trigger.addEventListener("click", (e) => {
        e.preventDefault();
        nextTheme();
      });
    });
    console.log(`🟢 ${triggers.length} 個のテーマトリガーが登録されました。`);
  } else {
    console.warn("⚠️ テーマトリガーが見つかりませんでした。");
  }

  // ==============================
  // 時間帯による自動テーマ切り替え
  // ==============================
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 18) {
    applyTheme(themes[1]); // light
  } else {
    applyTheme(themes[0]); // dark
  }

  // ==============================
  // 音声トリガーや外部イベント用の受け取り
  // ==============================
  window.addEventListener("customThemeRotate", () => {
    console.log("🌀 外部トリガーによるテーマ切り替えを検知");
    nextTheme();
  });

  // ==============================
  // 特殊効果（任意）
  // ==============================
  const bg = document.querySelector(".background-gradient");
  if (bg) {
    window.addEventListener("mousemove", (e) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      bg.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, #ff8a65, #4a148c)`;
    });
  }

});
