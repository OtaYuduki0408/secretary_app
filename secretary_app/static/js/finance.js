document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("finance-data");
   
    // ----------------------------------------------------
    // 【データ取得】HTMLから全レコードを読み込む
    // ----------------------------------------------------
    const rawFinanceRecords = JSON.parse(container.dataset.allRecords || "[]");
   
    // -------------------------
    // 操作要素の取得
    // -------------------------
    const financeTableBody = document.querySelector("#financeTable tbody");
    const searchInput = document.getElementById("searchInput");
    const sortSelect = document.getElementById("sortSelect");
    const filterCategory = document.getElementById("filterCategory");
    const filterType = document.getElementById("filterType");
 
    // -------------------------
    // カテゴリオプションの動的更新
    // -------------------------
    const allCategories = [...new Set(rawFinanceRecords.map(r => r.category))].filter(c => c);
 
    // HTMLに静的に定義されている「すべてのカテゴリ」以外をクリアし、動的カテゴリを追加
    // ※ HTMLに「すべてのカテゴリ」が<option value="all">として定義されている前提
    filterCategory.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());
 
    allCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        filterCategory.appendChild(option);
    });
   
    // -------------------------
    // テーブル描画関数 (変更なし)
    // -------------------------
    function renderTable(data) {
        financeTableBody.innerHTML = "";
        if (data.length === 0) {
            financeTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 10px;">該当するデータがありません。</td></tr>';
            return;
        }
 
        data.forEach(record => {
            const row = financeTableBody.insertRow();
            row.insertCell().textContent = record.date;
           
            // タイプ列を追加し、色付けする
            const typeCell = row.insertCell();
            const typeText = record.type === 'income' ? '収入' : '支出';
            typeCell.textContent = typeText;
            typeCell.style.color = record.type === 'income' ? '#00bcd4' : '#e74c3c'; // CSSに合わせて色を変更
 
            row.insertCell().textContent = record.category;
            row.insertCell().textContent = record.description;
           
            const amountCell = row.insertCell();
            amountCell.textContent = `${record.amount.toLocaleString()} 円`;
            amountCell.classList.add('fd-amount-cell');
        });
    }
 
    /**
     * 現在の検索、フィルタ、ソート設定を適用してテーブルを更新し、グラフを再描画する
     */
    function applyFiltersAndSort() {
        let currentData = [...rawFinanceRecords];
 
        // 1a. タイプ (収入/支出) による絞り込み
        const selectedType = document.querySelector('input[name="typeFilter"]:checked').value;
        if (selectedType !== "all") {
            currentData = currentData.filter(record => record.type === selectedType);
        }
       
        // 1b. カテゴリ (複数選択) による絞り込み
        const selectedOptions = Array.from(filterCategory.selectedOptions).map(option => option.value);
       
        // 「すべてのカテゴリ」が選択されている、または何も選択されていない場合
        if (selectedOptions.includes("all") || selectedOptions.length === 0) {
            // 何もフィルタしない
        } else {
            // 選択されたカテゴリでフィルタ
            currentData = currentData.filter(record => selectedOptions.includes(record.category));
        }
 
        // 1c. 検索ワードによる絞り込み
        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            currentData = currentData.filter(record =>
                record.description.toLowerCase().includes(searchTerm) ||
                record.date.includes(searchTerm)
            );
        }
 
        // 2. ソート
        let sortedData = [...currentData];
        const sortKey = sortSelect.value;
        sortedData.sort((a, b) => {
            if (sortKey === "date") {
                return new Date(b.date) - new Date(a.date);
            } else if (sortKey === "amount") {
                return b.amount - a.amount;
            }
            return 0;
        });
 
        // 3. テーブルを描画
        renderTable(sortedData);
       
        // 4. 絞り込み後のデータでグラフを更新
        updateCharts(sortedData);
    }
   
    // -------------------------
    // グラフ更新・描画関数 (グラフが表示されない問題の解決)
    // -------------------------
    function updateCharts(records) {
        const currentIncomeRecords = records.filter(r => r.type === 'income');
        const currentExpenseRecords = records.filter(r => r.type === 'expense');
 
        const calculateStats = (data) => {
            const statsMap = data.reduce((acc, record) => {
                const month = record.date.substring(0, 7);
                acc[month] = (acc[month] || 0) + record.amount;
                return acc;
            }, {});
 
            return Object.keys(statsMap)
                .sort()
                .map(month => ({
                    month: month.substring(5), // '01', '02'など
                    amount: statsMap[month]
                }));
        };
 
        const incomeData = calculateStats(currentIncomeRecords);
        const expenseData = calculateStats(currentExpenseRecords);
 
        drawBarChart("incomeChart", incomeData, "#00bcd4", "#4dd0e1", "収入 (絞り込み結果)"); // シアン系
        drawBarChart("expenseChart", expenseData, "#ff7043", "#ffccbc", "支出 (絞り込み結果)"); // オレンジ系
    }
   
    // ★ グラフ描画のコアロジックを完全に追加 ★
    function drawBarChart(canvasId, data, colorStart, colorEnd, title) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
       
        // データがない場合の表示
        if (data.length === 0) {
            ctx.font = "20px sans-serif";
            ctx.fillStyle = "#e0e0e0";
            ctx.textAlign = "center";
            ctx.fillText("データなし", width / 2, height / 2);
            return;
        }
 
        const labels = data.map(d => d.month);
        const values = data.map(d => d.amount);
        const maxVal = Math.max(...values) || 1;
        const yTicks = 5;
        const padding = 40;
        const chartHeight = height - padding * 2;
        const chartWidth = width - padding * 2;
        const barWidth = chartWidth / values.length * 0.6;
        const barGap = chartWidth / values.length * 0.4;
       
        // Y軸目盛の単位 (例: 1000, 1万)
        const formatYValue = (val) => {
             if (val >= 100000) return `${Math.round(val / 10000)}万`;
             if (val >= 1000) return `${Math.round(val / 1000)}k`;
             return val.toLocaleString();
        };
 
        // タイトル
        ctx.font = "bold 16px sans-serif";
        ctx.fillStyle = "#e0e0e0";
        ctx.textAlign = "center";
        ctx.fillText(title, width / 2, 20);
 
        // Y軸グリッド線とラベル
        ctx.strokeStyle = "#444";
        ctx.fillStyle = "#e0e0e0";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "right";
        for (let i = 0; i <= yTicks; i++) {
            const y = padding + (chartHeight / yTicks) * i;
            const value = Math.round(maxVal - (maxVal / yTicks) * i);
           
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
           
            ctx.fillText(formatYValue(value), padding - 5, y + 4);
        }
 
        // X軸 (基準線)
        ctx.beginPath();
        ctx.strokeStyle = "#e0e0e0";
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
 
        // 棒グラフ描画
        values.forEach((v, i) => {
            const x = padding + i * (barWidth + barGap) + barGap / 2;
            const barHeight = (v / maxVal) * chartHeight;
 
            // グラデーション設定
            const grad = ctx.createLinearGradient(0, height - padding - barHeight, 0, height - padding);
            grad.addColorStop(0, colorStart);
            grad.addColorStop(1, colorEnd);
 
            ctx.fillStyle = grad;
            ctx.fillRect(x, height - padding - barHeight, barWidth, barHeight);
 
            // 金額ラベル (棒の上)
            ctx.fillStyle = "#e0e0e0";
            ctx.textAlign = "center";
            ctx.font = "10px sans-serif";
            if (barHeight > 15) { // 棒が高ければ上部に表示
                ctx.fillText(formatYValue(v), x + barWidth / 2, height - padding - barHeight - 5);
            } else { // 低ければ棒の中に表示
                ctx.fillText(formatYValue(v), x + barWidth / 2, height - padding - 5);
            }
           
 
            // 月ラベル (X軸の下)
            ctx.fillStyle = "#b0b0b0";
            ctx.textAlign = "center";
            ctx.fillText(labels[i], x + barWidth / 2, height - padding + 15);
        });
    }
 
 
    // -------------------------
    // サマリー計算と目標設定機能
    // -------------------------
    const totalIncome = rawFinanceRecords.filter(r => r.type === 'income').reduce((sum, d) => sum + d.amount, 0);
    const totalExpense = rawFinanceRecords.filter(r => r.type === 'expense').reduce((sum, d) => sum + d.amount, 0);
   
    // 最新月の特定 (データの日付から動的に計算するのが理想)
    const latestDate = rawFinanceRecords.reduce((maxDate, record) => {
        return record.date > maxDate ? record.date : maxDate;
    }, '0000-00-00');
    const latestMonth = latestDate.substring(0, 7);
   
    const monthlyExpense = rawFinanceRecords
        .filter(r => r.type === 'expense' && r.date.startsWith(latestMonth))
        .reduce((sum, d) => sum + d.amount, 0);
 
    // HTML要素の更新
    document.getElementById("current-balance").textContent = `${(totalIncome - totalExpense).toLocaleString()} 円`;
    document.getElementById("monthly-expense").textContent = `${monthlyExpense.toLocaleString()} 円`;
   
    // 目標設定のロジック
    const inputGoal = document.getElementById("inputGoal");
    const goalAmountDisplay = document.getElementById("goal-amount");
    const settingsForm = document.getElementById("settingsForm");
 
    const savedGoal = localStorage.getItem("financeGoalAmount");
    if (savedGoal) {
        goalAmountDisplay.textContent = `${Number(savedGoal).toLocaleString()} 円`;
        inputGoal.value = savedGoal;
    } else {
        goalAmountDisplay.textContent = `-- 円`;
    }
 
    if (settingsForm) {
        settingsForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const goalNum = Number(inputGoal.value);
            if (!isNaN(goalNum) && goalNum >= 0) {
                localStorage.setItem("financeGoalAmount", goalNum);
                goalAmountDisplay.textContent = `${goalNum.toLocaleString()} 円`;
                alert("目標金額を保存しました。");
            } else {
                alert("有効な目標金額を入力してください。");
            }
        });
    }
 
    // -------------------------
    // イベントリスナーの追加
    // -------------------------
    searchInput.addEventListener("input", applyFiltersAndSort);
    sortSelect.addEventListener("change", applyFiltersAndSort);
    filterCategory.addEventListener("change", applyFiltersAndSort);
    filterType.addEventListener("change", applyFiltersAndSort);
 
    // 初期描画
    applyFiltersAndSort();
});
 