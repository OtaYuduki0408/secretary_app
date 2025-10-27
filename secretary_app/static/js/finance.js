document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("finance-data");
  const incomeData = JSON.parse(container.dataset.income || "[]");
  const expenseData = JSON.parse(container.dataset.expense || "[]");

  // -------------------------
  // サマリー計算
  // -------------------------
  const totalIncome = incomeData.reduce((sum, d) => sum + d.amount, 0);
  const totalExpense = expenseData.reduce((sum, d) => sum + d.amount, 0);

  document.getElementById("current-balance").textContent =
    `${(totalIncome - totalExpense).toLocaleString()} 円`;
  document.getElementById("monthly-expense").textContent =
    `${totalExpense.toLocaleString()} 円`;

  // -------------------------
  // 棒グラフ描画関数
  // -------------------------
  function drawBarChart(canvasId, data, colorStart, colorEnd, title) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (data.length === 0) {
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#666";
      ctx.fillText("データなし", width / 2 - 30, height / 2);
      return;
    }

    const labels = data.map(d => d.month);
    const values = data.map(d => d.amount);
    const maxVal = Math.max(...values);
    const yTicks = 5;
    const padding = 50;
    const chartHeight = height - padding * 2;
    const chartWidth = width - padding * 2;
    const barWidth = chartWidth / values.length * 0.6;
    const barGap = chartWidth / values.length * 0.4;

    // タイトル
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(title, width / 2, 25);

    // Y軸グリッド線とラベル
    ctx.strokeStyle = "#ddd";
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= yTicks; i++) {
      const y = padding + (chartHeight / yTicks) * i;
      const value = Math.round(maxVal - (maxVal / yTicks) * i);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding + 10, y);
      ctx.stroke();
      ctx.fillText(value.toLocaleString(), padding - 10, y + 4);
    }

    // 棒グラフ描画
    values.forEach((v, i) => {
      const x = padding + i * (barWidth + barGap);
      const barHeight = (v / maxVal) * chartHeight;

      const grad = ctx.createLinearGradient(0, height - padding - barHeight, 0, height - padding);
      grad.addColorStop(0, colorStart);
      grad.addColorStop(1, colorEnd);

      ctx.fillStyle = grad;
      ctx.fillRect(x, height - padding - barHeight, barWidth, barHeight);

      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.strokeRect(x, height - padding - barHeight, barWidth, barHeight);

      // 金額ラベル
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "12px sans-serif";
      ctx.fillText(v.toLocaleString(), x + barWidth / 2, height - padding - barHeight - 10);

      // 月ラベル
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(labels[i], x + barWidth / 2, height - padding + 20);
    });
  }

  drawBarChart("incomeChart", incomeData, "#a8e6cf", "#56c596", "収入");
  drawBarChart("expenseChart", expenseData, "#ffaaa5", "#ff8c94", "支出");
});
