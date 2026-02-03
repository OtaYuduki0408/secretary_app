function checkOverlayState() {
  const overlay = document.getElementById('read-aloud-overlay');
  
  if (!overlay) {
    console.log("エラー: #read-aloud-overlay 要素が見つかりません。");
    return;
  }

  console.log("オーバーレイ要素:", overlay);

  const hasVisibleClass = overlay.classList.contains('visible');
  console.log(`'visible'クラスの有無: ${hasVisibleClass}`);

  if (hasVisibleClass) {
    const styles = window.getComputedStyle(overlay);
    console.log("適用されている計算済みスタイル:");
    console.log(`  - display: ${styles.display}`);
    console.log(`  - opacity: ${styles.opacity}`);
    console.log(`  - visibility: ${styles.visibility}`);
    console.log(`  - z-index: ${styles.zIndex}`);
  } else {
    console.log("'.visible'クラスが付与されていないため、計算済みスタイルはチェックしません。");
  }
}

checkOverlayState();
