document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("finance-data");
    
    // ----------------------------------------------------
    // 【データ取得】HTMLから全レコードを読み込む
    // ----------------------------------------------------
    const rawFinanceRecords = JSON.parse(container.dataset.allRecords || "[]");
    
    // ------------------------ -
    // 操作要素の取得
    // ------------------------ -
    const financeTableBody = document.querySelector("#financeTable tbody");
    const searchInput = document.getElementById("searchInput");
    const sortSelect = document.getElementById("sortSelect");
    const filterCategory = document.getElementById("filterCategory");
    const filterType = document.getElementById("filterType");
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    let incomeChart = null;
    let expenseChart = null;

    // ------------------------ -
    // カテゴリオプションの動的更新
    // ------------------------ -
    const allCategories = [...new Set(rawFinanceRecords.map(r => r.category))].filter(c => c);

    filterCategory.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());

    allCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        filterCategory.appendChild(option);
    });
    
    // ------------------------ -
    // テーブル描画関数
    // ------------------------ -
    function renderTable(data) {
        financeTableBody.innerHTML = "";
        if (data.length === 0) {
            financeTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 10px;">該当するデータがありません。</td></tr>';
            return;
        }

        data.forEach(record => {
            const row = financeTableBody.insertRow();
            row.insertCell().textContent = record.date;
            
            const typeCell = row.insertCell();
            const typeText = record.type === 'income' ? '収入' : '支出';
            typeCell.textContent = typeText;
            typeCell.style.color = record.type === 'income' ? '#00bcd4' : '#e74c3c';

            row.insertCell().textContent = record.category;
            row.insertCell().textContent = record.description;
            
            const amountCell = row.insertCell();
            amountCell.textContent = `${record.amount.toLocaleString()} 円`;
            amountCell.classList.add('fd-amount-cell');
        });
    }

    // ------------------------ -
    // フィルタとソートの適用
    // ------------------------ -
    function applyFiltersAndSort() {
        let currentData = [...rawFinanceRecords]; 

        const selectedType = document.querySelector('input[name="typeFilter"]:checked').value;
        if (selectedType !== "all") {
            currentData = currentData.filter(record => record.type === selectedType);
        }
        
        const selectedOptions = Array.from(filterCategory.selectedOptions).map(option => option.value);
        if (!selectedOptions.includes("all") && selectedOptions.length > 0) {
            currentData = currentData.filter(record => selectedOptions.includes(record.category));
        }

        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            currentData = currentData.filter(record => 
                record.description.toLowerCase().includes(searchTerm) || 
                record.date.includes(searchTerm) 
            );
        }

        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (startDate) {
            currentData = currentData.filter(record => record.date >= startDate);
        }
        if (endDate) {
            currentData = currentData.filter(record => record.date <= endDate);
        }

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

        renderTable(sortedData);
        updateCharts(sortedData);
    }
    
    // ------------------------ -
    // グラフ更新・描画関数
    // ------------------------ -
    function updateCharts(records) {
        const currentIncomeRecords = records.filter(r => r.type === 'income');
        const currentExpenseRecords = records.filter(r => r.type === 'expense');

        drawIncomeChart(currentIncomeRecords);
        drawExpenseChart(currentExpenseRecords);
    }

    function drawIncomeChart(records) {
        const ctx = document.getElementById('incomeChart').getContext('2d');
        if (incomeChart) {
            incomeChart.destroy();
        }

        const monthlyData = records.reduce((acc, record) => {
            const month = record.date.substring(0, 7);
            acc[month] = (acc[month] || 0) + record.amount;
            return acc;
        }, {});

        const labels = Object.keys(monthlyData).sort();
        const data = labels.map(label => monthlyData[label]);

        incomeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '収入',
                    data: data,
                    backgroundColor: 'rgba(0, 188, 212, 0.6)',
                    borderColor: 'rgba(0, 188, 212, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    function drawExpenseChart(records) {
        const ctx = document.getElementById('expenseChart').getContext('2d');
        if (expenseChart) {
            expenseChart.destroy();
        }

        const categories = [...new Set(records.map(r => r.category))];
        const categoryColorMap = generateCategoryColors(categories);

        const monthlyData = records.reduce((acc, record) => {
            const month = record.date.substring(0, 7);
            if (!acc[month]) {
                acc[month] = {};
            }
            acc[month][record.category] = (acc[month][record.category] || 0) + record.amount;
            return acc;
        }, {});

        const labels = Object.keys(monthlyData).sort();

        const datasets = categories.map(category => {
            return {
                label: category,
                data: labels.map(label => monthlyData[label][category] || 0),
                backgroundColor: categoryColorMap[category]
            };
        });

        expenseChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,

                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true
                    }
                }
            }
        });
    }

    function generateCategoryColors(categories) {
        const colors = {};
        const colorPalette = [
            'rgba(255, 99, 132, 0.6)', 'rgba(54, 162, 235, 0.6)', 'rgba(255, 206, 86, 0.6)',
            'rgba(75, 192, 192, 0.6)', 'rgba(153, 102, 255, 0.6)', 'rgba(255, 159, 64, 0.6)',
            'rgba(199, 199, 199, 0.6)', 'rgba(83, 109, 254, 0.6)', 'rgba(46, 125, 50, 0.6)'
        ];
        categories.forEach((category, index) => {
            colors[category] = colorPalette[index % colorPalette.length];
        });
        return colors;
    }

    // ------------------------ -
    // サマリー計算と目標設定機能
    // ------------------------ -
    function updateSummary() {
        const totalIncome = rawFinanceRecords.filter(r => r.type === 'income').reduce((sum, d) => sum + d.amount, 0);
        const totalExpense = rawFinanceRecords.filter(r => r.type === 'expense').reduce((sum, d) => sum + d.amount, 0);

        const today = new Date().toISOString().slice(0, 10);
        const currentMonth = today.slice(0, 7);

        const monthlyExpense = rawFinanceRecords
            .filter(r => r.type === 'expense' && r.date.startsWith(currentMonth))
            .reduce((sum, d) => sum + d.amount, 0);

        const monthlyIncome = rawFinanceRecords
            .filter(r => r.type === 'income' && r.date.startsWith(currentMonth))
            .reduce((sum, d) => sum + d.amount, 0);

        const dailyExpense = rawFinanceRecords
            .filter(r => r.type === 'expense' && r.date === today)
            .reduce((sum, d) => sum + d.amount, 0);

        const dailyExpenseNoNecessities = rawFinanceRecords
            .filter(r => r.type === 'expense' && r.date === today && r.category !== '必需品')
            .reduce((sum, d) => sum + d.amount, 0);

        document.getElementById("current-balance").textContent = `${(totalIncome - totalExpense).toLocaleString()} 円`;
        document.getElementById("monthly-expense").textContent = `${monthlyExpense.toLocaleString()} 円`;
        document.getElementById("monthly-income").textContent = `${monthlyIncome.toLocaleString()} 円`;
        document.getElementById("daily-expense").textContent = `${dailyExpense.toLocaleString()} 円`;
        document.getElementById("daily-expense-no-necessities").textContent = `${dailyExpenseNoNecessities.toLocaleString()} 円`;
    }

    updateSummary(); // Initial calculation

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

    // ------------------------ -
    // イベントリスナーの追加
    // ------------------------ -
    searchInput.addEventListener("input", applyFiltersAndSort);
    sortSelect.addEventListener("change", applyFiltersAndSort);
    filterCategory.addEventListener("change", applyFiltersAndSort);
    filterType.addEventListener("change", applyFiltersAndSort); 
    startDateInput.addEventListener("change", applyFiltersAndSort);
    endDateInput.addEventListener("change", applyFiltersAndSort);

    // 初期描画
    applyFiltersAndSort(); 
});