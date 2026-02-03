import { updateActionSummary } from './ui_helpers.js';
import { fetchGenres } from './command_manager.js';

// --- Helper function for the new advanced date range component (Copied from trigger_ui.js) ---
const createAdvancedDateRangeUI = (p, iv) => {
  const parentId = `${p}date-range-container`;

  const createDatalist = (id, start, end, type) => {
    let html = `<datalist id="${id}">`;
    const specialOptionText = {
        year: '実行された年',
        month: '実行された月',
        day: '実行された日'
    };
    if (specialOptionText[type]) {
        html += `<option value="${specialOptionText[type]}"></option>`;
    }
    for (let i = start; i <= end; i++) {
      html += `<option value="${String(i).padStart(id.includes('month') || id.includes('day') ? 2 : 0, '0')}"></option>`;
    }
    return html + `</datalist>`;
  };
  
  const yearOptsId = `${p}year_opts`;
  const monthOptsId = `${p}month_opts`;
  const dayOptsId = `${p}day_opts`;
  const timeOptsId = `${p}time_opts`;
  
  const currentYear = new Date().getFullYear();
  const yearDatalist = createDatalist(yearOptsId, 2025, currentYear + 5, 'year');
  const monthDatalist = createDatalist(monthOptsId, 1, 12, 'month');
  const dayDatalist = createDatalist(dayOptsId, 1, 31, 'day');
  
  let timeOptionsHtml = `<datalist id="${timeOptsId}"><option value="実行された時刻"></option>`;
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) timeOptionsHtml += `<option value="${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}"></option>`;
  timeOptionsHtml += `</datalist>`;

  const html = `
    <details class="co-details-group" style="margin-top: 15px;">
      <summary style="font-size: 1.1em; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px; border-radius: 8px; background-color: var(--co-bg-2); border: 1px solid var(--co-border);">
          <span>期間: <span id="${p}date_range_summary">指定なし</span></span>
          <span class="co-disclosure-icon">▼</span>
      </summary>
      <div class="co-preset-buttons" id="${p}date_presets">
        <button type="button" class="co-btn ghost" data-preset="today">今日</button>
        <button type="button" class="co-btn ghost" data-preset="this_month">今月</button>
        <button type="button" class="co-btn ghost" data-preset="this_year">今年</button>
        <button type="button" class="co-btn ghost" data-preset="all">全期間</button>
      </div>
      <div class="co-date-range-container">
        <div class="co-date-range-group">
          <label>開始日時</label>
          <div class="co-datetime-inputs">
            <input type="text" id="${p}start_year" list="${yearOptsId}" placeholder="年" value="${iv.start_year || ''}" data-summary-part="start">
            <input type="text" id="${p}start_month" list="${monthOptsId}" placeholder="月" value="${iv.start_month || ''}" data-summary-part="start">
            <input type="text" id="${p}start_day" list="${dayOptsId}" placeholder="日" value="${iv.start_day || ''}" data-summary-part="start">
            <input type="text" id="${p}start_time" list="${timeOptsId}" placeholder="時刻" value="${iv.start_time || ''}" data-summary-part="start">
          </div>
        </div>
        <div class="co-date-range-group">
          <label>終了日時</label>
          <div class="co-datetime-inputs">
            <input type="text" id="${p}end_year" list="${yearOptsId}" placeholder="年" value="${iv.end_year || ''}" data-summary-part="end">
            <input type="text" id="${p}end_month" list="${monthOptsId}" placeholder="月" value="${iv.end_month || ''}" data-summary-part="end">
            <input type="text" id="${p}end_day" list="${dayOptsId}" placeholder="日" value="${iv.end_day || ''}" data-summary-part="end">
            <input type="text" id="${p}end_time" list="${timeOptsId}" placeholder="時刻" value="${iv.end_time || ''}" data-summary-part="end">
          </div>
        </div>
      </div>
    </details>
    ${yearDatalist}${monthDatalist}${dayDatalist}${timeOptionsHtml}
  `;

  const attachListeners = (container) => {
    const summaryEl = container.querySelector(`#${p}date_range_summary`);
    const inputs = container.querySelectorAll('.co-datetime-inputs input');

    const updateSummary = () => {
      const start = ['year', 'month', 'day', 'time'].map(t => container.querySelector(`#${p}start_${t}`).value || '').join('-').replace(/-+$/, '');
      const end = ['year', 'month', 'day', 'time'].map(t => container.querySelector(`#${p}end_${t}`).value || '').join('-').replace(/-+$/, '');
      
      if (!start && !end) {
        summaryEl.textContent = "指定なし";
      } else {
        summaryEl.textContent = `${start || '...'} ~ ${end || '...'}`;
      }
    };
    
    inputs.forEach(input => input.addEventListener('input', updateSummary));

    container.querySelector(`#${p}date_presets`).addEventListener('click', (event) => {
      if (event.target.tagName !== 'BUTTON') return;

      const preset = event.target.dataset.preset;
      const fields = {
        start: { y: container.querySelector(`#${p}start_year`), m: container.querySelector(`#${p}start_month`), d: container.querySelector(`#${p}start_day`), t: container.querySelector(`#${p}start_time`) },
        end: { y: container.querySelector(`#${p}end_year`), m: container.querySelector(`#${p}end_month`), d: container.querySelector(`#${p}end_day`), t: container.querySelector(`#${p}end_time`) }
      };
      const clearAll = () => Object.values(fields).flatMap(group => Object.values(group)).forEach(el => el.value = '');
      clearAll();

      switch(preset) {
        case 'today':
          fields.start.y.value = '実行された年';
          fields.start.m.value = '実行された月';
          fields.start.d.value = '実行された日';
          fields.start.t.value = '00:00';
          fields.end.y.value = '実行された年';
          fields.end.m.value = '実行された月';
          fields.end.d.value = '実行された日';
          fields.end.t.value = '23:59';
          break;
        case 'this_month':
          fields.start.y.value = '実行された年';
          fields.start.m.value = '実行された月';
          fields.start.d.value = '1';
          fields.start.t.value = '00:00';
          fields.end.y.value = '実行された年';
          fields.end.m.value = '実行された月';
          fields.end.d.value = ''; // 月末はサーバー側で解釈
          fields.end.t.value = '23:59';
          break;
        case 'this_year':
          fields.start.y.value = '実行された年';
          fields.start.m.value = '1';
          fields.start.d.value = '1';
          fields.start.t.value = '00:00';
          fields.end.y.value = '実行された年';
          fields.end.m.value = '12';
          fields.end.d.value = '31';
          fields.end.t.value = '23:59';
          break;
        case 'all':
          break;
      }
      updateSummary();
    });
    updateSummary(); // Initial call
  };

  return { html, attachListeners };
};

export function createActionUI(prefix = '', initialValue = {}) {
  console.log(`createActionUI called with prefix: '${prefix}', initialValue:`, initialValue);
  const category = document.getElementById(`${prefix}action_category`).value;
  const sub = document.getElementById(`${prefix}action_sub`).value;
  const detailContainer = document.getElementById(`${prefix}action_detail_container`);
  detailContainer.innerHTML = '';

  // ????????????????????????
  if (category === "\u30e1\u30fc\u30eb" || category === "??????") {
    detailContainer.innerHTML = `
      <label>\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9</label>
      <input type="email" class="action-detail-mail-to" placeholder="recipient@example.com" value="${initialValue.to || ''}">
      <label>\u4ef6\u540d</label>
      <input type="text" class="action-detail-mail-subject" placeholder="\u30e1\u30fc\u30eb\u306e\u4ef6\u540d" value="${initialValue.subject || ''}">
      <label>\u672c\u6587</label>
      <textarea class="action-detail-mail-body" placeholder="\u30e1\u30fc\u30eb\u306e\u672c\u6587">${initialValue.body || ''}</textarea>
    `;
    return;
  }

  switch (category) {
    case "カレンダー":
      if (sub === "追加") {
        const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
        detailContainer.innerHTML = `
          <label>タイトル</label>
          <input type="text" class="action-detail-cal-title" placeholder="予定のタイトル" value="${initialValue.title || ''}">
          ${dateRange.html}
          <label style="margin-top: 10px;">説明</label>
          <textarea class="action-detail-cal-description" placeholder="予定の説明">${initialValue.description || ''}</textarea>
        `;
        dateRange.attachListeners(detailContainer);
      } else if (sub === "削除") {
        const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
        detailContainer.innerHTML = `
          <label>タイトル</label>
          <input type="text" class="action-detail-cal-title" placeholder="削除する予定のタイトル" value="${initialValue.title || ''}">
          ${dateRange.html}
        `;
        dateRange.attachListeners(detailContainer);
      } else if (sub === "読み上げ") {
        const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
        detailContainer.innerHTML = `
          ${dateRange.html}
        `;
        dateRange.attachListeners(detailContainer);
      }
      break;
    case "収支管理":
      if (sub === "読み上げ") {
        const generateDatalist = (type) => {
          let options = '';
          const currentYear = new Date().getFullYear();
          switch(type) {
            case 'year':
              options += `<option value="実行された年">`;
              for (let i = currentYear; i <= currentYear + 20; i++) options += `<option value="${i}">`;
              break;
            case 'month':
              options += `<option value="実行された月">`;
              for (let i = 1; i <= 12; i++) options += `<option value="${i}">`;
              break;
            case 'day':
              options += `<option value="実行された日">`;
              for (let i = 1; i <= 31; i++) options += `<option value="${i}">`;
              break;
            case 'time':
              options += `<option value="実行された時刻">`;
              for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) options += `<option value="${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}">`;
              break;
          }
          return options;
        };

        detailContainer.innerHTML = `
          <label>読み上げ項目</label>
          <select class="action-detail-fin-read-item">
            <option value="total_balance" ${initialValue.item === 'total_balance' ? 'selected' : ''}>総所持金</option>
            <option value="remaining_to_target" ${initialValue.item === 'remaining_to_target' ? 'selected' : ''}>目標金額までの残金</option>
            <option value="monthly_expense" ${initialValue.item === 'monthly_expense' ? 'selected' : ''}>今月の支出</option>
            <option value="monthly_expense_no_necessities" ${initialValue.item === 'monthly_expense_no_necessities' ? 'selected' : ''}>今月の支出(必需品なし)</option>
            <option value="monthly_income" ${initialValue.item === 'monthly_income' ? 'selected' : ''}>今月の収入</option>
            <option value="daily_expense" ${initialValue.item === 'daily_expense' ? 'selected' : ''}>今日の支出</option>
            <option value="daily_expense_no_necessities" ${initialValue.item === 'daily_expense_no_necessities' ? 'selected' : ''}>今日の支出(必需品なし)</option>
          </select>
          <label>読み上げ形式</label>
          <select class="action-detail-fin-read-format">
            <option value="individual" ${initialValue.format === 'individual' ? 'selected' : ''}>個別</option>
            <option value="expense" ${initialValue.format === 'expense' ? 'selected' : ''}>支出</option>
            <option value="income" ${initialValue.format === 'income' ? 'selected' : ''}>収入</option>
            <option value="balance" ${initialValue.format === 'balance' ? 'selected' : ''}>収支</option>
          </select>
          <details class="co-details-group" data-group="start" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
            <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
              <span>読み上げ範囲 (開始)</span>
              <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
            </summary>
            <div class="co-details-content" style="margin-top: 15px;">
                <label>年 (必須)</label>
                <input type="text" class="action-detail-fin-read-start-year" list="action_fin_read_start_year_options" value="${initialValue.start_year || '実行された年'}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_start_year_options">${generateDatalist('year')}</datalist>
                <label>月 (必須)</label>
                <input type="text" class="action-detail-fin-read-start-month" list="action_fin_read_start_month_options" value="${initialValue.start_month || '実行された月'}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_start_month_options">${generateDatalist('month')}</datalist>
                <label>日 (必須)</label>
                <input type="text" class="action-detail-fin-read-start-day" list="action_fin_read_start_day_options" value="${initialValue.start_day || '1'}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_start_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (必須)</label>
                <input type="text" class="action-detail-fin-read-start-time" list="action_fin_read_start_time_options" value="${initialValue.start_time || '00:00'}" placeholder="例: 07:30" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_start_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
          <details class="co-details-group" data-group="end" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
            <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
              <span>読み上げ範囲 (終了)</span>
              <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
            </summary>
            <div class="co-details-content" style="margin-top: 15px;">
                <label>年 (必須)</label>
                <input type="text" class="action-detail-fin-read-end-year" list="action_fin_read_end_year_options" value="${initialValue.end_year || '実行された年'}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_end_year_options">${generateDatalist('year')}</datalist>
                <label>月 (必須)</label>
                <input type="text" class="action-detail-fin-read-end-month" list="action_fin_read_end_month_options" value="${initialValue.end_month || '実行された月'}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_end_month_options">${generateDatalist('month')}</datalist>
                <label>日 (必須)</label>
                <input type="text" class="action-detail-fin-read-end-day" list="action_fin_read_end_day_options" value="${initialValue.end_day || '実行された日'}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_end_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (必須)</label>
                <input type="text" class="action-detail-fin-read-end-time" list="action_fin_read_end_time_options" value="${initialValue.end_time || '23:55'}" placeholder="例: 18:00" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_end_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
        `;

        const updateSummary = (group) => {
            const details = detailContainer.querySelector(`[data-group='${group}']`);
            if (!details) return;

            const yearInput = details.querySelector(`[class*='-${group}-year']`);
            const monthInput = details.querySelector(`[class*='-${group}-month']`);
            const dayInput = details.querySelector(`[class*='-${group}-day']`);
            const timeInput = details.querySelector(`[class*='-${group}-time']`);

            const year = yearInput?.value || '';
            const month = monthInput?.value || '';
            const day = dayInput?.value || '';
            const time = timeInput?.value || '';
            
            let summaryText = '';
            if (year) summaryText += year.includes('実行された') ? 'n年' : `${year}年`;
            if (month) summaryText += month.includes('実行された') ? 'n月' : `${month}月`;
            if (day) summaryText += day.includes('実行された') ? 'n日' : `${day}日`;
            if (summaryText && time) summaryText += ' ';
            if (time) summaryText += time.includes('実行された') ? 'n:n' : time;

            const summaryValueEl = details.querySelector('.co-summary-value');
            if (summaryValueEl) {
                summaryValueEl.textContent = summaryText || '未設定';
            }
        };

        ['start', 'end'].forEach(group => {
          const details = detailContainer.querySelector(`[data-group='${group}']`);
          if(details) {
            details.addEventListener('input', () => updateSummary(group));
            updateSummary(group); // 初期表示の更新
          }
        });
      }
      break;
    case "メモ":
      if (sub === "読み上げ") {
        const generateDatalist = (type) => {
          let options = '';
          const currentYear = new Date().getFullYear();
          switch(type) {
            case 'year':
              options += `<option value="実行された年">`;
              for (let i = currentYear; i <= currentYear + 20; i++) options += `<option value="${i}">`;
              break;
            case 'month':
              options += `<option value="実行された月">`;
              for (let i = 1; i <= 12; i++) options += `<option value="${i}">`;
              break;
            case 'day':
              options += `<option value="実行された日">`;
              for (let i = 1; i <= 31; i++) options += `<option value="${i}">`;
              break;
            case 'time':
              options += `<option value="実行された時刻">`;
              for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) options += `<option value="${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}">`;
              break;
          }
          return options;
        };

        detailContainer.innerHTML = `
          <details class="co-details-group" data-group="start" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
            <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
              <span>読み上げ範囲 (開始)</span>
              <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
            </summary>
            <div class="co-details-content" style="margin-top: 15px;">
                <label>年 (必須)</label>
                <input type="text" class="action-detail-memo-read-start-year" list="action_memo_read_start_year_options" value="${initialValue.start_year || '実行された年'}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_start_year_options">${generateDatalist('year')}</datalist>
                <label>月 (必須)</label>
                <input type="text" class="action-detail-memo-read-start-month" list="action_memo_read_start_month_options" value="${initialValue.start_month || '実行された月'}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_start_month_options">${generateDatalist('month')}</datalist>
                <label>日 (必須)</label>
                <input type="text" class="action-detail-memo-read-start-day" list="action_memo_read_start_day_options" value="${initialValue.start_day || '実行された日'}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_start_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (必須)</label>
                <input type="text" class="action-detail-memo-read-start-time" list="action_memo_read_start_time_options" value="${initialValue.start_time || '00:00'}" placeholder="例: 07:30" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_start_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
          <details class="co-details-group" data-group="end" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
            <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
              <span>読み上げ範囲 (終了)</span>
              <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
            </summary>
            <div class="co-details-content" style="margin-top: 15px;">
                <label>年 (必須)</label>
                <input type="text" class="action-detail-memo-read-end-year" list="action_memo_read_end_year_options" value="${initialValue.end_year || '実行された年'}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_end_year_options">${generateDatalist('year')}</datalist>
                <label>月 (必須)</label>
                <input type="text" class="action-detail-memo-read-end-month" list="action_memo_read_end_month_options" value="${initialValue.end_month || '実行された月'}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_end_month_options">${generateDatalist('month')}</datalist>
                <label>日 (必須)</label>
                <input type="text" class="action-detail-memo-read-end-day" list="action_memo_read_end_day_options" value="${initialValue.end_day || '実行された日'}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_end_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (必須)</label>
                <input type="text" class="action-detail-memo-read-end-time" list="action_memo_read_end_time_options" value="${initialValue.end_time || '23:55'}" placeholder="例: 18:00" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_end_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
        `;

        const updateSummary = (group) => {
            const details = detailContainer.querySelector(`[data-group='${group}']`);
            if (!details) return;

            const yearInput = details.querySelector(`[class*='-${group}-year']`);
            const monthInput = details.querySelector(`[class*='-${group}-month']`);
            const dayInput = details.querySelector(`[class*='-${group}-day']`);
            const timeInput = details.querySelector(`[class*='-${group}-time']`);

            const year = yearInput?.value || '';
            const month = monthInput?.value || '';
            const day = dayInput?.value || '';
            const time = timeInput?.value || '';
            
            let summaryText = '';
            if (year) summaryText += year.includes('実行された') ? 'n年' : `${year}年`;
            if (month) summaryText += month.includes('実行された') ? 'n月' : `${month}月`;
            if (day) summaryText += day.includes('実行された') ? 'n日' : `${day}日`;
            if (summaryText && time) summaryText += ' ';
            if (time) summaryText += time.includes('実行された') ? 'n:n' : time;

            const summaryValueEl = details.querySelector('.co-summary-value');
            if (summaryValueEl) {
                summaryValueEl.textContent = summaryText || '未設定';
            }
        };

        ['start', 'end'].forEach(group => {
          const details = detailContainer.querySelector(`[data-group='${group}']`);
          if(details) {
            details.addEventListener('input', () => updateSummary(group));
            updateSummary(group); // 初期表示の更新
          }
        });
      }
      break;
    case "??????":
      case "\u30e1\u30fc\u30eb":
        detailContainer.innerHTML = `
            <label>\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9</label>
            <input type="email" class="action-detail-mail-to" placeholder="recipient@example.com" value="${initialValue.to || ''}">
            <label>\u4ef6\u540d</label>
            <input type="text" class="action-detail-mail-subject" placeholder="\u30e1\u30fc\u30eb\u306e\u4ef6\u540d" value="${initialValue.subject || ''}">
            <label>\u672c\u6587</label>
            <textarea class="action-detail-mail-body" placeholder="\u30e1\u30fc\u30eb\u306e\u672c\u6587">${initialValue.body || ''}</textarea>
          `;
        break;
    case "発声":
      if (sub === "実行") {
        detailContainer.innerHTML = `
          <label>発声する文章</label>
          <textarea class="action-detail-speak-text" placeholder="発声させたい文章を入力">${initialValue.text || ''}</textarea>
        `;
      }
      break;
    case "読み上げ":
      detailContainer.innerHTML = `
        <div class="co-help-text">
          <p>選択した項目を読み上げます。</p>
        </div>
      `;
      break;
    case "アラート":
      if (sub === "実行") {
        const alertSounds = [
          { value: "bet.mp3", label: "bet.mp3" },
          { value: "big.m4a", label: "big.m4a" },
          { value: "botan.m4a", label: "botan.m4a" },
          { value: "error.mp3", label: "error.mp3" },
          { value: "gako.mp3", label: "gako.mp3" },
          { value: "relode.mp3", label: "relode.mp3" },
          { value: "rr.m4a", label: "rr.m4a" },
          { value: "spin.mp3", label: "spin.mp3" },
          { value: "voice_wate.mp3", label: "voice_wate.mp3" }
        ];
        const options = alertSounds.map(sound => {
          const selected = initialValue.sound === sound.value ? 'selected' : '';
          return `<option value="${sound.value}" ${selected}>${sound.label}</option>`;
        }).join('');
        detailContainer.innerHTML = `
          <label>アラート音</label>
          <select class="action-detail-alert-sound">
            ${options}
          </select>
        `;
      }
      break;
  }
}
