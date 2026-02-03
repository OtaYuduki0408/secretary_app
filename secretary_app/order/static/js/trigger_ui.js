function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

import { populateSelect, updateSubOptions } from './ui_helpers.js';
import { geocodeAddress, getCurrentLocation, reverseGeocodeCoordinates } from './geolocation.js';
import { TRIGGER_CATEGORIES, TRIGGER_VALUE_PLACEHOLDERS } from './constants.js';
import { fetchGenres } from './command_manager.js';

export function createTriggerUI(prefix = '', initialValue = {}) {
  console.log(`createTriggerUI called with prefix: '${prefix}', initialValue:`, initialValue);

  // --- Helper function for the new advanced date range component ---
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

  const category = document.getElementById(`${prefix}trigger_category`).value;
  const sub = document.getElementById(`${prefix}trigger_sub`).value;
  const triggerValueContainer = document.getElementById(`${prefix}trigger_value_container`);
  triggerValueContainer.innerHTML = '';
  const safeVoiceKeywords = String(initialValue.keywords ?? initialValue.keyword ?? initialValue.value ?? '').replace(/"/g, '&quot;');

  if (category) {
    switch (category) {
      case "場所":
        // This case remains unchanged from our previous successful modifications.
        triggerValueContainer.innerHTML = `
          <label for="${prefix}trigger_value_address">住所</label>
          <input type="text" id="${prefix}trigger_value_address" class="trigger-input" placeholder="入力すると自動で緯度経度が検索されます" required value="${initialValue.address || ''}">
          <ul id="${prefix}past_addresses_list" class="past-addresses-list" style="display: none;"></ul>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button type="button" id="${prefix}get_current_location_btn" class="co-btn ghost" style="flex: 1;">現在地を取得</button>
          </div>
          <label for="${prefix}trigger_value_latitude">緯度</label>
          <input type="text" id="${prefix}trigger_value_latitude" class="trigger-input" placeholder="緯度" readonly value="${initialValue.latitude || ''}">
          <label for="${prefix}trigger_value_longitude">経度</label>
          <input type="text" id="${prefix}trigger_value_longitude" class="trigger-input" placeholder="経度" readonly value="${initialValue.longitude || ''}">
          <label for="${prefix}trigger_value_range">許容範囲 (m)</label>
          <input type="number" id="${prefix}trigger_value_range" class="trigger-input" placeholder="許容範囲 (m)" required value="${initialValue.range || '1000'}">
          <small>注意: 許容範囲はなるべく幅広くしてください。(例：1000m等)</small>
          <div id="${prefix}location_message" style="color: green; margin-top: 5px;"></div>
          <div id="${prefix}location_error_message" style="color: red; display: none;"></div>
          <div id="${prefix}map" style="height: 300px; margin-top: 10px;"></div>
        `;
        
        let map = null;
        let marker = null;
        const addressInput = document.getElementById(`${prefix}trigger_value_address`);
        const pastAddressesList = document.getElementById(`${prefix}past_addresses_list`);
        
        const handleGeocoding = async () => {
          const address = addressInput ? addressInput.value : '';
          const locationMessage = document.getElementById(`${prefix}location_message`);
          const locationErrorMessage = document.getElementById(`${prefix}location_error_message`);
          if (address && address.trim() !== '') {
            locationMessage.textContent = "緯度経度を取得中...";
            locationErrorMessage.style.display = 'none';
            const result = await geocodeAddress(address, window.gcp_api_key);
            if (result && result.type === "success") {
              const { lat, lng } = result;
              document.getElementById(`${prefix}trigger_value_latitude`).value = lat;
              document.getElementById(`${prefix}trigger_value_longitude`).value = lng;
              locationMessage.textContent = "緯度経度を正常に取得しました。";
              locationErrorMessage.style.display = 'none';
              updateMap(lat, lng);
              await saveAddressToDB(address);
            } else {
              document.getElementById(`${prefix}trigger_value_latitude`).value = '';
              document.getElementById(`${prefix}trigger_value_longitude`).value = '';
              locationMessage.textContent = "";
              if (result && (result.type === "api_error" || result.type === "network_error" || result.type === "malformed_response")) {
                locationErrorMessage.textContent = "使用APIにエラーが発生しております。時間を置いて再度お試しください。";
              } else {
                locationErrorMessage.textContent = "住所が特定できませんでした。都道府県、市区町村、番地までなど、より簡潔な形式でお試しください。";
              }
              locationErrorMessage.style.display = 'block';
              if (map !== null) { map.remove(); map = null; marker = null; }
            }
          } else {
            document.getElementById(`${prefix}trigger_value_latitude`).value = '';
            document.getElementById(`${prefix}trigger_value_longitude`).value = '';
            locationMessage.textContent = "";
            locationErrorMessage.style.display = 'none';
            if (map !== null) { map.remove(); map = null; marker = null; }
          }
        };
        const debouncedGeocode = debounce(handleGeocoding, 500);
        const fetchPastAddresses = async () => {
          try {
            const response = await fetch('/order/api/past_addresses');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const addresses = await response.json();
            pastAddressesList.innerHTML = '';
            const uniqueAddresses = [...new Set(addresses)];
            if (uniqueAddresses.length > 0) {
              uniqueAddresses.forEach(addr => {
                const li = document.createElement('li');
                li.textContent = addr;
                li.addEventListener('click', () => {
                  addressInput.value = addr;
                  pastAddressesList.style.display = 'none';
                  handleGeocoding();
                });
                pastAddressesList.appendChild(li);
              });
              pastAddressesList.style.display = 'block';
            } else {
              pastAddressesList.style.display = 'none';
            }
          } catch (error) {
            console.error("過去の住所の取得に失敗しました:", error);
            pastAddressesList.style.display = 'none';
          }
        };
        addressInput.addEventListener('focus', fetchPastAddresses);
        addressInput.addEventListener('input', () => {
            debouncedGeocode();
            if (addressInput.value === '') {
                pastAddressesList.style.display = 'block';
            } else {
                const filterText = addressInput.value.toLowerCase();
                Array.from(pastAddressesList.children).forEach(li => {
                    li.style.display = li.textContent.toLowerCase().includes(filterText) ? 'list-item' : 'none';
                });
                pastAddressesList.style.display = 'block';
            }
        });
        document.addEventListener('click', (event) => {
          if (!addressInput.contains(event.target) && !pastAddressesList.contains(event.target)) {
            pastAddressesList.style.display = 'none';
          }
        });
        const updateMap = async (lat, lng) => {
          const mapElement = document.getElementById(`${prefix}map`);
          if (mapElement && !mapElement.__gm_id) {
            const { Map, Marker } = await google.maps.importLibrary("maps"); 
            const initialLatLng = { lat: lat, lng: lng };
            map = new Map(mapElement, { center: initialLatLng, zoom: 13 });
            mapElement.__gm_id = true;
            marker = new google.maps.Marker({ position: initialLatLng, map: map, draggable: true });
            google.maps.event.addListener(marker, 'dragend', function() {
              const newLatLng = marker.getPosition();
              document.getElementById(`${prefix}trigger_value_latitude`).value = newLatLng.lat().toFixed(6);
              document.getElementById(`${prefix}trigger_value_longitude`).value = newLatLng.lng().toFixed(6);
              reverseGeocodeAndUpdateAddress(newLatLng.lat(), newLatLng.lng());
            });
          } else if (map) {
            map.setCenter({ lat: lat, lng: lng });
            marker.setPosition({ lat: lat, lng: lng });
          }
        };
        const reverseGeocodeAndUpdateAddress = async (lat, lng) => {
            const result = await reverseGeocodeCoordinates(lat, lng, window.gcp_api_key);
            if (result.type === 'success') {
                document.getElementById(`${prefix}trigger_value_address`).value = result.address;
            }
        };
        document.getElementById(`${prefix}get_current_location_btn`).addEventListener("click", async () => {
            const locationMessage = document.getElementById(`${prefix}location_message`);
            const locationErrorMessage = document.getElementById(`${prefix}location_error_message`);
            locationMessage.textContent = "現在地を取得中...";
            locationErrorMessage.style.display = 'none';
            try {
                const result = await getCurrentLocation();
                if (result.type === 'success') {
                    const { lat, lng } = result;
                    document.getElementById(`${prefix}trigger_value_latitude`).value = lat;
                    document.getElementById(`${prefix}trigger_value_longitude`).value = lng;
                    locationMessage.textContent = "現在地を正常に取得しました。";
                    updateMap(lat, lng);
                    const addressResult = await reverseGeocodeCoordinates(lat, lng);
                    if (addressResult.type === 'success') {
                        document.getElementById(`${prefix}trigger_value_address`).value = addressResult.address;
                        await saveAddressToDB(addressResult.address);
                    } else {
                        locationMessage.textContent = "現在地は取得しましたが、住所の特定に失敗しました。";
                    }
                }
            } catch (error) {
                document.getElementById(`${prefix}trigger_value_latitude`).value = '';
                document.getElementById(`${prefix}trigger_value_longitude`).value = '';
                locationMessage.textContent = "";
                locationErrorMessage.textContent = error.message || "現在地の取得に失敗しました。";
                locationErrorMessage.style.display = 'block';
                if (map !== null) { map.remove(); map = null; marker = null; }
            }
        });
        if (initialValue.latitude && initialValue.longitude) {
            const lat = parseFloat(initialValue.latitude);
            const lng = parseFloat(initialValue.longitude);
            if (!isNaN(lat) && !isNaN(lng)) updateMap(lat, lng);
        }
        break;
      case "カレンダー":
        if (prefix && prefix.startsWith('cond_')) {
          const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
          triggerValueContainer.innerHTML = `
            <label>予定の名前</label>
            <input type="text" id="${prefix}trigger_value_cal_title" class="trigger-input" placeholder="予定のタイトルを入力" value="${initialValue.title || ''}">
            ${dateRange.html}
          `;
          dateRange.attachListeners(triggerValueContainer);
        } else {
           // Existing logic for triggers remains untouched
          if (sub === "入力があったら") {
            triggerValueContainer.innerHTML = `
              <label>アクション (複数選択可)</label>
              <div id="${prefix}trigger_value_calendar_actions" class="co-day-of-week-selector">
                <button type="button" data-value="追加">追加</button>
                <button type="button" data-value="変更">変更</button>
                <button type="button" data-value="取得">取得</button>
                <button type="button" data-value="削除">削除</button>
              </div>
            `;
            const actionButtonsContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_calendar_actions`);
            if (actionButtonsContainer) {
              actionButtonsContainer.addEventListener('click', (event) => { if (event.target.tagName === 'BUTTON') event.target.classList.toggle('selected'); });
              if (initialValue.actions && Array.isArray(initialValue.actions)) {
                initialValue.actions.forEach(action => {
                  const button = actionButtonsContainer.querySelector(`button[data-value="${action}"]`);
                  if (button) button.classList.add('selected');
                });
              }
            }
          } else if (sub === "予定の時間になったら") {
            const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
            triggerValueContainer.innerHTML = `
              <small><b>以下の条件を満たす予定の時間になったらトリガーが発動されます</b></small>
              <input type="text" id="${prefix}trigger_value_cal_title" class="trigger-input" placeholder="タイトル (任意)" value="${initialValue.title || ''}">
              <label style="margin-top: 10px; display: block;">曜日 (任意)(複数選択可)</label>
              <div id="${prefix}trigger_value_cal_day_of_week_buttons" class="co-day-of-week-selector">
                  <button type="button" data-value="月">月</button> <button type="button" data-value="火">火</button> <button type="button" data-value="水">水</button> <button type="button" data-value="木">木</button>
                  <button type="button" data-value="金">金</button> <button type="button" data-value="土">土</button> <button type="button" data-value="日">日</button>
              </div>
              ${dateRange.html}
            `;
            dateRange.attachListeners(triggerValueContainer);
            
            // 曜日ボタンの選択ロジック
            const dayOfWeekContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_cal_day_of_week_buttons`);
            if (dayOfWeekContainer) {
                dayOfWeekContainer.addEventListener('click', (event) => {
                    if (event.target.tagName === 'BUTTON') {
                        event.target.classList.toggle('selected');
                    }
                });
                // Restore selection
                if (initialValue.day_of_week && Array.isArray(initialValue.day_of_week)) {
                    initialValue.day_of_week.forEach(day => {
                        const button = dayOfWeekContainer.querySelector(`button[data-value="${day}"]`);
                        if (button) button.classList.add('selected');
                    });
                }
            }
          }
        }
        break;
      case "収支管理":
        if (prefix && prefix.startsWith('cond_')) {
            const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
            triggerValueContainer.innerHTML = `
                <div class="co-grid"><div class="co-cell-1-2"><label>対象項目</label><select id="${prefix}finance_item" class="trigger-input">
                    <option value="income" ${initialValue.item === 'income' ? 'selected' : ''}>収入</option>
                    <option value="expense" ${initialValue.item === 'expense' ? 'selected' : ''}>支出</option>
                    <option value="balance" ${initialValue.item === 'balance' ? 'selected' : ''}>収支</option>
                </select></div></div>
                ${dateRange.html}
                <details class="co-details-group"><summary>ジャンル (任意)</summary><div id="${prefix}finance_genres" class="co-day-of-week-selector co-flex-wrap"><p>ジャンルを読み込み中...</p></div></details>
                <div class="co-grid"><div class="co-cell-2-3"><label>比較条件</label><select id="${prefix}finance_compare" class="trigger-input">
                    <option value="gte" ${initialValue.compare === 'gte' ? 'selected' : ''}>次の金額を上回ったら</option>
                    <option value="lte" ${initialValue.compare === 'lte' ? 'selected' : ''}>次の金額を下回ったら</option>
                </select></div><div class="co-cell-1-3"><label>金額</label><input type="number" id="${prefix}finance_amount" class="trigger-input" placeholder="金額 (円)" value="${initialValue.amount || ''}"></div></div>
            `;
            dateRange.attachListeners(triggerValueContainer);
            const genresButtonsContainer = triggerValueContainer.querySelector(`#${prefix}finance_genres`);
            (async () => {
                const genres = await fetchGenres();
                genresButtonsContainer.innerHTML = '';
                if (genres.length === 0) { genresButtonsContainer.innerHTML = '<p>ジャンルが登録されていません。</p>'; return; }
                genres.forEach(genre => { const button = document.createElement('button'); button.type = 'button'; button.dataset.value = genre.name; button.textContent = genre.name; genresButtonsContainer.appendChild(button); });
                if (initialValue.genres && Array.isArray(initialValue.genres)) {
                    initialValue.genres.forEach(genreName => { const button = genresButtonsContainer.querySelector(`button[data-value="${genreName}"]`); if (button) button.classList.add('selected'); });
                }
                genresButtonsContainer.addEventListener('click', (event) => { if (event.target.tagName === 'BUTTON') event.target.classList.toggle('selected'); });
            })();
        } else {
          if (sub === "入力があったら") {
            triggerValueContainer.innerHTML = `
              <label>アクション (複数選択可)</label>
              <div id="${prefix}trigger_value_finance_actions" class="co-day-of-week-selector">
                <button type="button" data-value="追加">追加</button>
                <button type="button" data-value="取得">取得</button>
              </div>
            `;
            const actionButtonsContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_finance_actions`);
            if (actionButtonsContainer) {
              actionButtonsContainer.addEventListener('click', (event) => { if (event.target.tagName === 'BUTTON') event.target.classList.toggle('selected'); });
              if (initialValue.actions && Array.isArray(initialValue.actions)) {
                initialValue.actions.forEach(action => {
                  const button = actionButtonsContainer.querySelector(`button[data-value="${action}"]`);
                  if (button) button.classList.add('selected');
                });
              }
            }
          } else if (sub === "特定金額になったら") {
            const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
            triggerValueContainer.innerHTML = `
                <div class="co-grid">
                    <div class="co-cell-1-2">
                        <label>対象</label>
                        <select id="${prefix}finance_item" class="trigger-input">
                            <option value="balance" ${initialValue.item === 'balance' ? 'selected' : ''}>収支</option>
                            <option value="income" ${initialValue.item === 'income' ? 'selected' : ''}>収入</option>
                            <option value="expense" ${initialValue.item === 'expense' ? 'selected' : ''}>支出</option>
                        </select>
                    </div>
                </div>
                ${dateRange.html}
                <div class="co-grid">
                    <div class="co-cell-2-3">
                        <label>比較条件</label>
                        <select id="${prefix}finance_compare" class="trigger-input">
                            <option value="gte" ${initialValue.compare === 'gte' ? 'selected' : ''}>次の金額を上回ったら</option>
                            <option value="lte" ${initialValue.compare === 'lte' ? 'selected' : ''}>次の金額を下回ったら</option>
                        </select>
                    </div>
                    <div class="co-cell-1-3">
                        <label>金額</label>
                        <input type="number" id="${prefix}finance_amount" class="trigger-input" placeholder="金額 (円)" value="${initialValue.amount || ''}">
                    </div>
                </div>
            `;
            dateRange.attachListeners(triggerValueContainer);
          }
        }
        break;
      case "メモ":
        if (prefix && prefix.startsWith('cond_')) {
          const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
          triggerValueContainer.innerHTML = `
            <label>検索範囲</label><select id="${prefix}memo_scope" class="trigger-input">
              <option value="full" ${initialValue.scope === 'full' ? 'selected' : ''}>全文</option>
              <option value="title" ${initialValue.scope === 'title' ? 'selected' : ''}>タイトル</option>
              <option value="body" ${initialValue.scope === 'body' ? 'selected' : ''}>本文</option>
            </select>
            <label>内容キーワード (カンマ区切りAND検索)</label>
            <input type="text" id="${prefix}memo_content" class="trigger-input" placeholder="例: 重要,プロジェクトA" value="${initialValue.content || ''}">
            <label>優先度 (0-99, 任意)</label>
            <input type="number" id="${prefix}memo_priority" class="trigger-input" min="0" max="99" placeholder="例: 50" value="${initialValue.priority || ''}">
            ${dateRange.html}
          `;
          dateRange.attachListeners(triggerValueContainer);
        } else {
          const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
          triggerValueContainer.innerHTML = `
            <label>検索範囲</label>
            <select id="${prefix}memo_scope" class="trigger-input">
              <option value="full" ${initialValue.scope === 'full' ? 'selected' : ''}>全文</option>
              <option value="title" ${initialValue.scope === 'title' ? 'selected' : ''}>タイトル</option>
              <option value="body" ${initialValue.scope === 'body' ? 'selected' : ''}>本文</option>
            </select>
            <label>検索文 (カンマ区切りAND検索)</label>
            <input type="text" id="${prefix}memo_content" class="trigger-input" placeholder="例: 重要,プロジェクトA" value="${initialValue.content || ''}">
            ${dateRange.html}
          `;
          dateRange.attachListeners(triggerValueContainer);
        }
        break;
      case "時間":
        if (prefix && prefix.startsWith('cond_')) {
          const dateRange = createAdvancedDateRangeUI(prefix, initialValue);
          triggerValueContainer.innerHTML = dateRange.html;
          dateRange.attachListeners(triggerValueContainer);
        } else {
            const createDatalist = (id, start, end, specialOption) => {
              let html = `<datalist id="${id}">`;
              if (specialOption) {
                html += `<option value="${specialOption}"></option>`;
              }
              for (let i = start; i <= end; i++) {
                html += `<option value="${String(i).padStart(id.includes('month') || id.includes('day') ? 2 : 0, '0')}"></option>`;
              }
              return html + `</datalist>`;
            };

            const yearOptsId = `${prefix}year_opts`;
            const monthOptsId = `${prefix}month_opts`;
            const dayOptsId = `${prefix}day_opts`;
            const timeOptsId = `${prefix}time_opts`;

            const currentYear = new Date().getFullYear();
            const yearDatalist = createDatalist(yearOptsId, currentYear, currentYear + 5, "毎年");
            const monthDatalist = createDatalist(monthOptsId, 1, 12, "毎月");
            const dayDatalist = createDatalist(dayOptsId, 1, 31, "毎日");
            
            let timeOptionsHtml = `<datalist id="${timeOptsId}"><option value="毎時"></option>`;
            for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) timeOptionsHtml += `<option value="${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}"></option>`;
            timeOptionsHtml += `</datalist>`;

            // initialValueの 'x' を '毎年' などに変換
            const yearVal = initialValue.year === 'x' ? '毎年' : initialValue.year || '';
            const monthVal = initialValue.month === 'x' ? '毎月' : initialValue.month || '';
            const dayVal = initialValue.day === 'x' ? '毎日' : initialValue.day || '';
            const timeVal = initialValue.time === 'x' ? '毎時' : initialValue.time || '';

            triggerValueContainer.innerHTML = `
                <div class="co-fieldset">
                    <label>年</label>
                    <input type="text" id="${prefix}trigger_value_year" class="trigger-input" list="${yearOptsId}" placeholder="例: 2025 または 毎年" value="${yearVal}">
                </div>
                <div class="co-fieldset">
                    <label>月</label>
                    <input type="text" id="${prefix}trigger_value_month" class="trigger-input" list="${monthOptsId}" placeholder="例: 12 または 毎月" value="${monthVal}">
                </div>
                <div class="co-fieldset">
                    <label>日</label>
                    <input type="text" id="${prefix}trigger_value_day" class="trigger-input" list="${dayOptsId}" placeholder="例: 15 または 毎日" value="${dayVal}">
                </div>
                <div class="co-fieldset">
                    <label>曜日 (複数選択可)</label>
                    <div id="${prefix}trigger_value_day_of_week_buttons" class="co-day-of-week-selector">
                        <button type="button" data-value="月">月</button> <button type="button" data-value="火">火</button> <button type="button" data-value="水">水</button> <button type="button" data-value="木">木</button>
                        <button type="button" data-value="金">金</button> <button type="button" data-value="土">土</button> <button type="button" data-value="日">日</button>
                    </div>
                </div>
                <div class="co-fieldset">
                    <label>時間</label>
                    <input type="text" id="${prefix}trigger_value_time" class="trigger-input" list="${timeOptsId}" placeholder="例: 09:00 または 毎時" value="${timeVal}">
                </div>
                ${yearDatalist}${monthDatalist}${dayDatalist}${timeOptionsHtml}
            `;

            // 曜日ボタンの選択ロジック
            const dayOfWeekContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_day_of_week_buttons`);
            if (dayOfWeekContainer) {
                dayOfWeekContainer.addEventListener('click', (event) => {
                    if (event.target.tagName === 'BUTTON') {
                        event.target.classList.toggle('selected');
                    }
                });
                // Restore selection
                if (initialValue.day_of_week && Array.isArray(initialValue.day_of_week)) {
                    initialValue.day_of_week.forEach(day => {
                        const button = dayOfWeekContainer.querySelector(`button[data-value="${day}"]`);
                        if (button) button.classList.add('selected');
                    });
                }
            }
        }
        break;
      case "SwitchBot":
        if (prefix && prefix.startsWith('cond_')) {
          if (sub === "人感センサー") {
            triggerValueContainer.innerHTML = `
              <div class="co-fieldset">
                <label>人の検知状態</label>
                <select id="${prefix}switchbot_detection" class="trigger-input">
                  <option value="">選択しない</option>
                  <option value="detected" ${initialValue.detection === 'detected' ? 'selected' : ''}>人が居るなら</option>
                  <option value="not_detected" ${initialValue.detection === 'not_detected' ? 'selected' : ''}>人が居ないなら</option>
                </select>
              </div>
              <div class="co-fieldset">
                <label>部屋の明るさ</label>
                <select id="${prefix}switchbot_light" class="trigger-input">
                  <option value="">選択しない</option>
                  <option value="bright" ${initialValue.light === 'bright' ? 'selected' : ''}>部屋が明るいなら</option>
                  <option value="dark" ${initialValue.light === 'dark' ? 'selected' : ''}>部屋が暗いなら</option>
                </select>
              </div>
            `;
          }
        } else {
            if (sub === "人感センサーが反応したら") {
                triggerValueContainer.innerHTML = `
                  <small><b>状態が変化したときに検知します</b></small>
                  <div class="co-fieldset">
                    <label>人の検知状態</label>
                    <select id="${prefix}trigger_value_switchbot_detection" class="trigger-input">
                      <option value="">選択しない</option>
                      <option value="detected" ${initialValue.detection === 'detected' ? 'selected' : ''}>人を検知したら</option>
                      <option value="not_detected" ${initialValue.detection === 'not_detected' ? 'selected' : ''}>人が居なくなったら</option>
                    </select>
                  </div>
                  <div class="co-fieldset">
                    <label>部屋の明るさ</label>
                    <select id="${prefix}trigger_value_switchbot_light" class="trigger-input">
                      <option value="">選択しない</option>
                      <option value="bright" ${initialValue.light === 'bright' ? 'selected' : ''}>部屋が明るくなったら</option>
                      <option value="dark" ${initialValue.light === 'dark' ? 'selected' : ''}>部屋が暗くなったら</option>
                    </select>
                  </div>
                  <div class="co-fieldset">
                    <label>継続検知時間 (秒)</label>
                    <input type="number" id="${prefix}trigger_value_switchbot_duration" class="trigger-input" placeholder="例: 5" value="${initialValue.duration || '5'}">
                    <small>連続で指定の状態を検知したら発動</small>
                  </div>
                `;
            }
        }
        break;
      case "ボイス":
        triggerValueContainer.innerHTML = `
          <label>検索ワード (カンマ区切りAND検索)</label>
          <input type="text" id="${prefix}trigger_value_voice_keywords" class="trigger-input" placeholder="例: おはよう,今日の天気" value="${safeVoiceKeywords}">
        `;
        break;
      default:
        triggerValueContainer.innerHTML = `<input type="text" id="${prefix}trigger_value" placeholder="値" value="${initialValue.value || ''}">`;
        break;
    }
  } else {
    triggerValueContainer.innerHTML = `<input type="text" id="${prefix}trigger_value" placeholder="値" value="${initialValue.value || ''}">`;
  }
}


export async function saveAddressToDB(address) {
  if (!address || address.trim() === '') {
    console.warn("保存する住所が空です。");
    return false;
  }
  try {
    const response = await fetch('/order/api/past_addresses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: address }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("住所の保存に失敗しました:", errorData.error);
      return false;
    }

    console.log("住所が正常に保存されました。");
    return true;
  } catch (error) {
    console.error("住所の保存中にエラーが発生しました:", error);
    return false;
  }
}

export function updateTriggerInputFields() {
  createTriggerUI('');
}


