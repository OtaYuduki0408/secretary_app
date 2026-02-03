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
        const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
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
          ${dateRange.html}
        `;
        dateRange.attachListeners(detailContainer);
      }
      break;
    case "メモ":
      if (sub === "読み上げ") {
        const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
        detailContainer.innerHTML = `
          <label>タイトル</label>
          <input type="text" class="action-detail-memo-title" placeholder="指定したタイトルのメモのみ読み上げます" value="${initialValue.title || ''}">
          <label style="margin-top: 10px;">ワード</label>
          <input type="text" class="action-detail-memo-word" placeholder="指定したワードを含むメモを読み上げます" value="${initialValue.word || ''}">
          ${dateRange.html}
        `;
        dateRange.attachListeners(detailContainer);
      }
      break;
    case "SwitchBot":
      if (sub === "デバイス操作") {
        detailContainer.innerHTML = `
          <label>デバイス</label>
          <select class="action-detail-switchbot-device" style="margin-bottom: 10px;">
            <option value="">デバイスを読み込み中...</option>
          </select>
          <label>アクション</label>
          <select class="action-detail-switchbot-action" style="margin-bottom: 10px;">
            <option value="turnOn" ${initialValue.action === 'turnOn' ? 'selected' : ''}>オンにする</option>
            <option value="turnOff" ${initialValue.action === 'turnOff' ? 'selected' : ''}>オフにする</option>
            <option value="press" ${initialValue.action === 'press' ? 'selected' : ''}>スイッチを押す</option>
          </select>
          <small class="co-help-text">スイッチのオン,オフが反転している場合、設定→switchbotより変更してください</small>
        `;

        const deviceSelect = detailContainer.querySelector('.action-detail-switchbot-device');

        // APIからデバイスリストを取得してselectを更新
        fetch('/api/switchbot/devices')
          .then(response => {
            if (!response.ok) {
              throw new Error('デバイスの取得に失敗しました');
            }
            return response.json();
          })
          .then(data => { // devices ではなく data という名前に変更して、受け取った生のレスポンスボディを表す
            deviceSelect.innerHTML = ''; // "読み込み中..."をクリア

            // APIレスポンスから実際のデバイスリストを抽出
            const devices = data.devices; // ★ここを修正★

            if (!Array.isArray(devices)) { // 防御的なチェックをここでも行い続ける
              console.error('Error: API returned data.devices is not an array:', devices);
              deviceSelect.innerHTML = '<option value="">デバイスリストの形式が不正です</option>';
              return;
            }

            if (devices.length === 0) {
              deviceSelect.innerHTML = '<option value="">利用可能なデバイスがありません</option>';
              return;
            }
            devices.forEach(device => {
              const option = document.createElement('option');
              // APIレスポンスのデバイスオブジェクトは {id: ..., name: ..., type: ...} 形式
              // フロントエンドは {deviceId: ..., deviceName: ...} 形式を期待しているので変換
              option.value = device.id; // ★ここを修正: device.deviceId -> device.id
              option.textContent = device.name; // ★ここを修正: device.deviceName -> device.name
              if (initialValue.deviceId === device.id) { // ★ここを修正: initialValue.deviceId === device.id
                option.selected = true;
              }
              deviceSelect.appendChild(option);
            });
          })
          .catch(error => {
            console.error('Error fetching SwitchBot devices:', error);
            deviceSelect.innerHTML = `<option value="">${error.message}</option>`;
          });
      }
      break;
    case "発声":
      if (sub === "実行") {
        detailContainer.innerHTML = `
          <label>発声する文章</label>
          <textarea class="action-detail-speak-text" placeholder="発声させたい文章を入力">${initialValue.text || ''}</textarea>
        `;
      }
      break;
    case "時間読み上げ":
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
          <div style="display: flex; align-items: center; gap: 10px;">
            <select class="action-detail-alert-sound" style="flex-grow: 1;">
              ${options}
            </select>
            <button type="button" id="${prefix}test-play-alert" class="co-btn ghost" style="flex-shrink: 0;">テスト再生</button>
          </div>
        `;
        
        const testPlayBtn = document.getElementById(`${prefix}test-play-alert`);
        if (testPlayBtn) {
          testPlayBtn.addEventListener('click', () => {
            const select = detailContainer.querySelector('.action-detail-alert-sound');
            const soundFile = select.value;
            if (soundFile) {
              const audio = new Audio(`/static/voice/${soundFile}`);
              audio.play().catch(e => console.error("音声の再生に失敗しました:", e));
            }
          });
        }
      }
      break;
  }
}
