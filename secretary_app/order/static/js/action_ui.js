import { updateActionSummary } from './ui_helpers.js';
import { fetchGenres } from './command_manager.js';
import { geocodeAddress } from './geolocation.js';

function normalizeTimeReadSelections(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const map = {
    "年月日": "年",
    "今日の日付": "月日",
    "今日の曜日": "曜日",
    "今の時間": "時間",
  };
  return list.map((item) => map[item] || item);
}

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
  const subSelect = document.getElementById(`${prefix}action_sub`);
  let sub = subSelect?.value || '';

  const fixedSubByCategory = {
    '収支管理': '読み上げ',
    'メモ': '読み上げ',
    '時間読み上げ': '読み上げ内容'
  };
  if (fixedSubByCategory[category] && subSelect) {
    sub = fixedSubByCategory[category];
    subSelect.value = sub;
    subSelect.disabled = true;
    subSelect.style.display = 'none';
  }
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
        const subNotice = subSelect?.disabled ? `<div class="co-help-text">サブカテゴリ: ${sub}</div>` : "";        detailContainer.innerHTML = `
          ${subNotice}
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
        const subNotice = subSelect?.disabled ? `<div class="co-help-text">サブカテゴリ: ${sub}</div>` : "";        detailContainer.innerHTML = `
          ${subNotice}
          <label>タイトル</label>
          <input type="text" class="action-detail-memo-title" placeholder="指定したタイトルのメモのみ読み上げます" value="${initialValue.title || ''}">
          <label style="margin-top: 10px;">ワード</label>
          <input type="text" class="action-detail-memo-word" placeholder="指定したワードを含むメモを読み上げます" value="${initialValue.word || ''}">
          ${dateRange.html}
        `;
        dateRange.attachListeners(detailContainer);
      }
      break;
    case "特殊命令":
      if (sub === "目覚まし") {
        detailContainer.innerHTML = `
          <label>行動</label>
          <div class="co-help-text">目覚ましの時間を読み上げる</div>
          <small class="co-help-text">読み上げ例: 明日の目覚ましの時間は10時です</small>
        `;
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
            <option value="">デバイスを選択してください</option>
          </select>
          <small class="co-help-text">Hub Mini配下の赤外線リモコン（照明など）も選択できます。</small>
        `;

        const deviceSelect = detailContainer.querySelector('.action-detail-switchbot-device');
        const actionSelect = detailContainer.querySelector('.action-detail-switchbot-action');

        const defaultActionLabels = {
          turnOn: 'オンにする',
          turnOff: 'オフにする',
          press: 'スイッチを押す',
        };

        const renderActionOptions = (actions, selectedAction) => {
          const list = Array.isArray(actions) && actions.length > 0 ? actions : ['turnOn', 'turnOff'];
          actionSelect.innerHTML = '';
          list.forEach((action) => {
            const opt = document.createElement('option');
            opt.value = action;
            opt.textContent = defaultActionLabels[action] || action;
            if (selectedAction && selectedAction === action) opt.selected = true;
            actionSelect.appendChild(opt);
          });
        };

        // APIからデバイスリストを取得してselectを更新
        fetch('/api/switchbot/devices')
          .then(response => {
            if (!response.ok) {
              throw new Error('デバイスの取得に失敗しました');
            }
            return response.json();
          })
          .then(devices => { // 'data' ではなく、直接 'devices' 配列を受け取る
            deviceSelect.innerHTML = ''; // "読み込み中..."をクリア

            if (!Array.isArray(devices)) { // 防御的なチェック
              console.error('Error: API returned data is not an array:', devices);
              deviceSelect.innerHTML = '<option value="">デバイスリストの形式が不正です</option>';
              return;
            }

            if (devices.length === 0) {
              deviceSelect.innerHTML = '<option value="">利用可能なデバイスがありません</option>';
              return;
            }
            devices.forEach(device => {
              const option = document.createElement('option');
              option.value = device.deviceId;
              const typeText = device.deviceType ? ` (${device.deviceType})` : '';
              option.textContent = `${device.deviceName}${typeText}`;
              option.dataset.commandType = device.commandType || 'command';
              option.dataset.parameter = device.parameter || 'default';
              option.dataset.supportedActions = JSON.stringify(device.supportedActions || []);
              if (initialValue.deviceId === device.deviceId) {
                option.selected = true;
              }
              deviceSelect.appendChild(option);
            });

            const selectedOption = deviceSelect.selectedOptions[0];
            if (selectedOption) {
              let supported = [];
              try { supported = JSON.parse(selectedOption.dataset.supportedActions || '[]'); } catch (e) { supported = []; }
              renderActionOptions(supported, initialValue.action);
            } else {
              renderActionOptions(['turnOn', 'turnOff'], initialValue.action);
            }

            deviceSelect.addEventListener('change', () => {
              const selected = deviceSelect.selectedOptions[0];
              let supported = [];
              try { supported = JSON.parse(selected?.dataset?.supportedActions || '[]'); } catch (e) { supported = []; }
              renderActionOptions(supported, null);
            });
          })
          .catch(error => {
            console.error('Error fetching SwitchBot devices:', error);
            deviceSelect.innerHTML = `<option value="">${error.message}</option>`;
            actionSelect.innerHTML = '<option value="">アクションを取得できません</option>';
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
      if (sub === "読み上げ内容") {
        const subNotice = subSelect?.disabled ? `<div class="co-help-text">サブカテゴリ: ${sub}</div>` : "";
        const normalizedSelections = normalizeTimeReadSelections(initialValue.content);
        detailContainer.innerHTML = `
          ${subNotice}
          <div class="co-fieldset">
            <label>読み上げ内容 (複数選択可)</label>
            <div class="co-day-of-week-selector action-detail-time-read-content">
              <button type="button" data-value="年">年</button>
              <button type="button" data-value="月日">月日</button>
              <button type="button" data-value="曜日">曜日</button>
              <button type="button" data-value="時間">時間</button>
            </div>
          </div>
        `;

        const setupButtonSelector = (selector, initialValues) => {
          const container = detailContainer.querySelector(selector);
          if (container) {
            container.addEventListener('click', (event) => {
              if (event.target.tagName === 'BUTTON') {
                event.target.classList.toggle('selected');
              }
            });
            if (initialValues && (Array.isArray(initialValues) ? initialValues.length > 0 : initialValues)) {
              const valuesToSelect = Array.isArray(initialValues) ? initialValues : [initialValues];
              valuesToSelect.forEach(val => {
                const button = container.querySelector(`button[data-value="${val}"]`);
                if (button) button.classList.add('selected');
              });
            }
          }
        };

        setupButtonSelector('.action-detail-time-read-content', normalizedSelections);
      }
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

    // 新しく追加する case "天気":
    case "天気":
      if (sub === "読み上げ") {
        const hourButtons = [0, 3, 6, 9, 12, 15, 18, 21]
          .map((h) => `<button type="button" data-value="${h}" class="action-detail-weather-hour-btn">${h}</button>`)
          .join('');

        detailContainer.innerHTML = `
          <div class="co-fieldset">
            <label>読み上げ内容</label>
            <div class="co-day-of-week-selector action-detail-weather-content">
              <button type="button" data-value="weather">天気</button>
              <button type="button" data-value="temp">気温</button>
              <button type="button" data-value="pop">降水確率</button>
            </div>
          </div>
          <div class="co-fieldset">
            <label>読み上げ範囲</label>
            <div class="co-day-of-week-selector action-detail-weather-range">
              <button type="button" data-value="today">今日</button>
              <button type="button" data-value="tomorrow">明日</button>
              <button type="button" data-value="weekly">週間</button>
            </div>
          </div>
          <div class="co-fieldset action-detail-weather-hours-wrap">
            <label>時刻（複数選択可）</label>
            <div class="co-day-of-week-selector action-detail-weather-hours">
              ${hourButtons}
            </div>
            <small>実行時刻が読み上げ対象の時刻を過ぎている場合、その時刻以前の情報は読み上げません。</small>
          </div>
          <div class="co-fieldset">
            <label>場所</label>
            <input type="text" class="action-detail-weather-address trigger-input" placeholder="例: 群馬県高崎市">
            <input type="text" class="action-detail-weather-lat trigger-input" placeholder="緯度" readonly>
            <input type="text" class="action-detail-weather-lng trigger-input" placeholder="経度" readonly>
            <div class="action-detail-weather-location-message" style="margin-top:6px;font-size:12px;"></div>
          </div>
        `;

        // 選択状態の復元とイベントリスナー
        const setupButtonSelector = (selector, initialValues, isSingleSelect = false) => {
          const container = detailContainer.querySelector(selector);
          if (container) {
            container.addEventListener('click', (event) => {
              if (event.target.tagName === 'BUTTON') {
                if (isSingleSelect) {
                  // 単一選択の場合、他のボタンの選択を解除
                  Array.from(container.children).forEach(btn => btn.classList.remove('selected'));
                  event.target.classList.add('selected');
                } else {
                  // 複数選択
                  event.target.classList.toggle('selected');
                }
              }
            });
            if (initialValues && (Array.isArray(initialValues) ? initialValues.length > 0 : initialValues)) {
              const valuesToSelect = Array.isArray(initialValues) ? initialValues : [initialValues];
              valuesToSelect.forEach(val => {
                const button = container.querySelector(`button[data-value="${val}"]`);
                if (button) button.classList.add('selected');
              });
            }
          }
        };

        const normalizedContent = (Array.isArray(initialValue.content) ? initialValue.content : (initialValue.content ? [initialValue.content] : []))
          .map((v) => ({ 天気: 'weather', 気温: 'temp', 降水確率: 'pop' }[v] || v));
        const normalizedRange = ({ 今日: 'today', 明日: 'tomorrow', 週間: 'weekly', 今週: 'weekly' }[initialValue.range] || initialValue.range);

        setupButtonSelector('.action-detail-weather-content', normalizedContent);
        setupButtonSelector('.action-detail-weather-range', normalizedRange, true);
        setupButtonSelector('.action-detail-weather-hours', initialValue.hours);

        const setInputValue = (selector, value) => {
          const el = detailContainer.querySelector(selector);
          if (el) el.value = value || '';
        };

        const enforceWeatherSelectionRules = () => {
          const selectedRange = detailContainer.querySelector('.action-detail-weather-range button.selected')?.dataset.value;
          const selectedContents = [...detailContainer.querySelectorAll('.action-detail-weather-content button.selected')].map((b) => b.dataset.value);
          const hasPop = selectedContents.includes('pop');
          const hourWrap = detailContainer.querySelector('.action-detail-weather-hours-wrap');
          const hourButtonsEls = [...detailContainer.querySelectorAll('.action-detail-weather-hours button')];

          if (selectedRange === 'weekly') {
            if (hourWrap) hourWrap.style.display = 'none';
            return;
          }
          if (hourWrap) hourWrap.style.display = '';

          hourButtonsEls.forEach((btn) => {
            const hour = Number(btn.dataset.value);
            const canUse = !hasPop || [0, 6, 12, 18].includes(hour);
            btn.disabled = !canUse;
            if (!canUse) btn.classList.remove('selected');
          });
        };

        const addressInput = detailContainer.querySelector('.action-detail-weather-address');
        const locationMessage = detailContainer.querySelector('.action-detail-weather-location-message');
        let geocodeTimer = null;

        const geocodeNow = async () => {
          const address = (addressInput?.value || '').trim();
          if (!address) {
            setInputValue('.action-detail-weather-lat', '');
            setInputValue('.action-detail-weather-lng', '');
            if (locationMessage) locationMessage.textContent = '';
            return;
          }
          if (locationMessage) locationMessage.textContent = '場所を検索しています...';
          const result = await geocodeAddress(address, window.gcp_api_key);
          if (result && result.type === 'success') {
            setInputValue('.action-detail-weather-lat', result.lat);
            setInputValue('.action-detail-weather-lng', result.lng);
            if (locationMessage) locationMessage.textContent = '場所と緯度経度を取得しました。';
          } else {
            setInputValue('.action-detail-weather-lat', '');
            setInputValue('.action-detail-weather-lng', '');
            if (locationMessage) locationMessage.textContent = '場所の取得に失敗しました。';
          }
        };

        if (addressInput) {
          addressInput.value = initialValue.address || '';
          addressInput.addEventListener('input', () => {
            if (geocodeTimer) clearTimeout(geocodeTimer);
            geocodeTimer = setTimeout(geocodeNow, 500);
          });
        }
        setInputValue('.action-detail-weather-lat', initialValue.latitude || '');
        setInputValue('.action-detail-weather-lng', initialValue.longitude || '');

        detailContainer.querySelector('.action-detail-weather-content')?.addEventListener('click', enforceWeatherSelectionRules);
        detailContainer.querySelector('.action-detail-weather-range')?.addEventListener('click', enforceWeatherSelectionRules);

        if (!detailContainer.querySelector('.action-detail-weather-content button.selected')) {
          const defaultContent = detailContainer.querySelector('.action-detail-weather-content button[data-value="weather"]');
          if (defaultContent) defaultContent.classList.add('selected');
        }
        if (!detailContainer.querySelector('.action-detail-weather-range button.selected')) {
          const defaultRange = detailContainer.querySelector('.action-detail-weather-range button[data-value="today"]');
          if (defaultRange) defaultRange.classList.add('selected');
        }
        enforceWeatherSelectionRules();

      }
      break;

    // 新しく追加する case "Youtube":
    case "Youtube":
      if (sub === "再生") {
        const subNotice = subSelect?.disabled ? `<div class="co-help-text">サブカテゴリ: ${sub}</div>` : "";
        const mode = initialValue.mode || 'search';

        detailContainer.innerHTML = `
          ${subNotice}
          <div class="co-fieldset" style="margin-top: 10px;">
            <label>再生方法</label>
            <div class="co-radio-group">
              <input type="radio" id="${prefix}youtube_mode_search" name="${prefix}youtube_mode" value="search" ${mode === 'search' ? 'checked' : ''}>
              <label for="${prefix}youtube_mode_search">キーワードで検索</label>
              <input type="radio" id="${prefix}youtube_mode_url" name="${prefix}youtube_mode" value="url" ${mode === 'url' ? 'checked' : ''}>
              <label for="${prefix}youtube_mode_url">URLを直接指定</label>
            </div>
          </div>
          <div id="${prefix}youtube_input_container"></div>
        `;

        const renderYoutubeInput = () => {
          const selectedMode = detailContainer.querySelector(`input[name="${prefix}youtube_mode"]:checked`).value;
          const inputContainer = detailContainer.querySelector(`#${prefix}youtube_input_container`);
          if (selectedMode === 'search') {
            inputContainer.innerHTML = `
              <label>検索キーワード</label>
              <input type="text" class="action-detail-youtube-query" placeholder="再生したい動画のキーワード" value="${initialValue.search_query || ''}">
            `;
          } else {
            inputContainer.innerHTML = `
              <label>動画のURL</label>
              <input type="text" class="action-detail-youtube-url" placeholder="https://www.youtube.com/watch?v=..." value="${initialValue.video_url || ''}">
            `;
          }
        };

        detailContainer.querySelectorAll(`input[name="${prefix}youtube_mode"]`).forEach(radio => {
          radio.addEventListener('change', renderYoutubeInput);
        });

        renderYoutubeInput();
      } else if (sub === "動画を進める" || sub === "動画を戻す") {
        const defaultSeconds = Number.isFinite(Number(initialValue.seconds)) ? Number(initialValue.seconds) : 10;
        detailContainer.innerHTML = `
          <label>移動秒数</label>
          <input type="number" class="action-detail-youtube-seconds" min="1" max="600" step="1" value="${defaultSeconds}">
        `;
      } else if (sub === "音量を上げる" || sub === "音量を下げる") {
        const defaultStep = Number.isFinite(Number(initialValue.volume_step)) ? Number(initialValue.volume_step) : 10;
        detailContainer.innerHTML = `
          <label>音量変化量 (1-100)</label>
          <input type="number" class="action-detail-youtube-volume-step" min="1" max="100" step="1" value="${defaultStep}">
        `;
      } else {
        detailContainer.innerHTML = `<div class="co-help-text">この操作に追加設定はありません。</div>`;
      }
      break;

    case "画像提示":
      if (sub === "発声") {
        const imagePreviewSrc = initialValue.imageBase64 || 'https://via.placeholder.com/300x150.png?text=No+Image';
        detailContainer.innerHTML = `
          <label>アップロード画像</label>
          <div class="co-image-upload-container">
            <img src="${imagePreviewSrc}" alt="画像プレビュー" class="action-detail-image-preview" style="max-width: 100%; height: auto; margin-bottom: 10px; border-radius: 8px;">
            <input type="file" class="action-detail-image-input" accept="image/*">
            <input type="hidden" class="action-detail-image-base64" value="${initialValue.imageBase64 || ''}">
          </div>
          <label style="margin-top: 10px;">発声する文章</label>
          <textarea class="action-detail-speak-text" placeholder="画像表示中に発声させたい文章を入力">${initialValue.text || ''}</textarea>
        `;

        const fileInput = detailContainer.querySelector('.action-detail-image-input');
        const preview = detailContainer.querySelector('.action-detail-image-preview');
        const base64Input = detailContainer.querySelector('.action-detail-image-base64');

        fileInput.addEventListener('change', (event) => {
          const file = event.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = (e) => {
            const base64Data = e.target.result;
            preview.src = base64Data;
            base64Input.value = base64Data;
          };
          reader.readAsDataURL(file);
        });
      }
      break;

    default:
      detailContainer.innerHTML = `<input type="text" class="action-detail-value" value="${initialValue.value || ''}" placeholder="追加情報">`;
      break;
  }
}
