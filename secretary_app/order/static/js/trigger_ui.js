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
  const category = document.getElementById(`${prefix}trigger_category`).value;
  const sub = document.getElementById(`${prefix}trigger_sub`).value;
  const triggerValueContainer = document.getElementById(`${prefix}trigger_value_container`);
  triggerValueContainer.innerHTML = '';

  let defaultPlaceholder = "値";
  const safeVoiceKeywords = String(initialValue.keywords ?? initialValue.keyword ?? initialValue.value ?? '').replace(/"/g, '&quot;');

  if (category) {
    switch (category) {
      case "場所":
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
              if (map !== null) { map.remove(); map = null; marker = null; window[`${prefix}leafletMap`] = null; }
            }
          } else {
            document.getElementById(`${prefix}trigger_value_latitude`).value = '';
            document.getElementById(`${prefix}trigger_value_longitude`).value = '';
            locationMessage.textContent = "";
            locationErrorMessage.style.display = 'none';
            if (map !== null) { map.remove(); map = null; marker = null; window[`${prefix}leafletMap`] = null; }
          }
        };

        const debouncedGeocode = debounce(handleGeocoding, 500);

        const fetchPastAddresses = async () => {
          try {
            const response = await fetch('/order/api/past_addresses');
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
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
                    if (li.textContent.toLowerCase().includes(filterText)) {
                        li.style.display = 'list-item';
                    } else {
                        li.style.display = 'none';
                    }
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
            map = new Map(mapElement, {
              center: initialLatLng,
              zoom: 13,
            });
            mapElement.__gm_id = true;

            marker = new google.maps.Marker({
              position: initialLatLng,
              map: map,
              draggable: true,
            });

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
                if (map !== null) { map.remove(); map = null; marker = null; window[`${prefix}leafletMap`] = null; }
            }
        });

        if (initialValue.latitude && initialValue.longitude) {
            const lat = parseFloat(initialValue.latitude);
            const lng = parseFloat(initialValue.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                updateMap(lat, lng);
            }
        }
        break;
      case "カレンダー":
        if (sub === "入力があったら") {
          triggerValueContainer.innerHTML = `
            <label>アクション (複数選択可)</label>
            <div id="${prefix}trigger_value_calendar_actions" class="co-day-of-week-selector">
              <button type="button" data-value="追加">追加</button>
              <button type="button" data-value="変更">変更</button>
              <button type="button" data-value="取得">取得</button>
              <button type="button" data-value="削除">削除</button>
            </div>
            <label>フィルター (任意)</label><br>
            <small>単語を指定して、検知するアクションにフィルターを掛けれます。</small>
            <div id="${prefix}trigger_value_calendar_filters">
              <button type="button" class="add_filter_btn co-btn ghost">フィルターを追加</button>
            </div>
            
          `;
          const actionButtonsContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_calendar_actions`);
          if (actionButtonsContainer) {
            actionButtonsContainer.addEventListener('click', (event) => {
              if (event.target.tagName === 'BUTTON') {
                event.target.classList.toggle('selected');
              }
            });
            // 復元
            if (initialValue.actions && Array.isArray(initialValue.actions)) {
              initialValue.actions.forEach(action => {
                const button = actionButtonsContainer.querySelector(`button[data-value="${action}"]`);
                if (button) {
                  button.classList.add('selected');
                }
              });
            }
          }
          const addFilterBtn = triggerValueContainer.querySelector(".add_filter_btn");
          const filterContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_calendar_filters`);
          if (addFilterBtn) {
            const addFilter = (filter = {}) => {
              const filterDiv = document.createElement("div");
              filterDiv.className = "filter-item";

              const isFirstItem = filterContainer.querySelectorAll('.filter-item').length === 0;

              let logicOptions = '';
              if (isFirstItem) {
                logicOptions = `
                  <option value="" ${filter.logic === '' ? 'selected' : ''}>(先頭)</option>
                  <option value="NOT" ${filter.logic === 'NOT' ? 'selected' : ''}>NOT (この単語が含まれていないなら)</option>
                `;
              } else {
                logicOptions = `
                  <option value="AND" ${filter.logic === 'AND' ? 'selected' : ''}>AND (「上のフィルター」と「このフィルター」の両方を満たす)</option>
                  <option value="OR" ${filter.logic === 'OR' ? 'selected' : ''}>OR (「上のフィルター」か「このフィルター」のどちらか一方でも満たす)</option>
                  <option value="NAND" ${filter.logic === 'NAND' ? 'selected' : ''}>NAND (「上のフィルター」と「このフィルター」の両方を満たすものを含まない)</option>
                  <option value="NOR" ${filter.logic === 'NOR' ? 'selected' : ''}>NOR (「上のフィルター」も「このフィルター」もどちらも満たさない)</option>
                  <option value="XOR" ${filter.logic === 'XOR' ? 'selected' : ''}>XOR (「上のフィルター」か「このフィルター」のどちらか一方だけを満たす)</option>
                  <option value="XNOR" ${filter.logic === 'XNOR' ? 'selected' : ''}>XNOR (「上のフィルター」と「このフィルター」の条件が同じである（両方満たす、または両方満たさない）)</option>
                `;
              }

              filterDiv.innerHTML = `
                <input type="text" class="calendar_filter_text trigger-input" placeholder="フィルター内容" value="${filter.text || ''}">
                <select class="calendar_filter_logic trigger-input">
                  ${logicOptions}
                </select>
                <button type="button" class="remove_filter_btn remove">削除</button>
              `;
              filterDiv.querySelector(".remove_filter_btn").addEventListener("click", (e) => e.target.parentNode.remove());
              filterContainer.insertBefore(filterDiv, addFilterBtn);
            };
            addFilterBtn.addEventListener("click", () => addFilter());
            initialValue.filters?.forEach(filter => addFilter(filter));
          }
        } else if (sub === "予定の時間になったら") {
          const updateSummary = (group) => {
            const details = triggerValueContainer.querySelector(`[data-group='${group}']`);
            if (!details) return;

            const year = details.querySelector(`[id$='_cal_${group}_year']`)?.value || '';
            const month = details.querySelector(`[id$='_cal_${group}_month']`)?.value || '';
            const day = details.querySelector(`[id$='_cal_${group}_day']`)?.value || '';
            const time = details.querySelector(`[id$='_cal_${group}_time']`)?.value || '';
            
            let summaryText = '';
            if (year) summaryText += `${year}年`;
            if (month) summaryText += `${month}月`;
            if (day) summaryText += `${day}日`;
            if (summaryText && time) summaryText += ' ';
            if (time) summaryText += time;

            const summaryValueEl = details.querySelector('.co-summary-value');
            if (summaryValueEl) {
                summaryValueEl.textContent = summaryText || '未設定';
            }
          };

          let html = `
            <small><b>以下の条件を満たす予定の時間になったらトリガーが発動されます</b></small>
            <input type="text" id="${prefix}trigger_value_cal_title" class="trigger-input" placeholder="タイトル (任意)" value="${initialValue.title || ''}">
            
            <label style="margin-top: 10px; display: block;">曜日 (任意)(複数選択可)</label>
            <div id="${prefix}trigger_value_cal_day_of_week_buttons" class="co-day-of-week-selector">
                <button type="button" data-value="月">月</button> <button type="button" data-value="火">火</button> <button type="button" data-value="水">水</button> <button type="button" data-value="木">木</button>
                <button type="button" data-value="金">金</button> <button type="button" data-value="土">土</button> <button type="button" data-value="日">日</button>
            </div>

            <details class="co-details-group" data-group="start" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
              <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
                <span>開始日時</span>
                <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
              </summary>
              <div class="co-details-content" style="margin-top: 15px;">
                  <label>年 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_cal_start_year" class="trigger-input" list="${prefix}cal_start_year_options" value="${initialValue.start_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}cal_start_year_options">${(() => { let o = ''; const y = new Date().getFullYear(); for (let i = y; i <= y + 20; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>月 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_cal_start_month" class="trigger-input" list="${prefix}cal_start_month_options" value="${initialValue.start_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}cal_start_month_options">${(() => { let o = ''; for (let i = 1; i <= 12; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>日 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_cal_start_day" class="trigger-input" list="${prefix}cal_start_day_options" value="${initialValue.start_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}cal_start_day_options">${(() => { let o = ''; for (let i = 1; i <= 31; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>時刻 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_cal_start_time" class="trigger-input" list="${prefix}cal_start_time_options" value="${initialValue.start_time || initialValue.time_start || ''}" placeholder="例: 07:30" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}cal_start_time_options">${(() => { let o = ''; for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) o += `<option value="${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}">`; return o; })()}</datalist>
              </div>
            </details>

            <details class="co-details-group" data-group="end" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
              <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
                <span>終了日時</span>
                <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
              </summary>
              <div class="co-details-content" style="margin-top: 15px;">
                  <label>年 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_cal_end_year" class="trigger-input" list="${prefix}cal_end_year_options" value="${initialValue.end_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}cal_end_year_options">${(() => { let o = ''; const y = new Date().getFullYear(); for (let i = y; i <= y + 20; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>月 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_cal_end_month" class="trigger-input" list="${prefix}cal_end_month_options" value="${initialValue.end_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}cal_end_month_options">${(() => { let o = ''; for (let i = 1; i <= 12; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>日 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_cal_end_day" class="trigger-input" list="${prefix}cal_end_day_options" value="${initialValue.end_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}cal_end_day_options">${(() => { let o = ''; for (let i = 1; i <= 31; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>時刻 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_cal_end_time" class="trigger-input" list="${prefix}cal_end_time_options" value="${initialValue.end_time || initialValue.time_end || ''}" placeholder="例: 18:00" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}cal_end_time_options">${(() => { let o = ''; for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) o += `<option value="${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}">`; return o; })()}</datalist>
              </div>
            </details>
          `;
          triggerValueContainer.innerHTML = html;

          // 曜日選択ボタンのロジックと復元
          const dayOfWeekButtonsContainer = document.getElementById(`${prefix}trigger_value_cal_day_of_week_buttons`);
          if (dayOfWeekButtonsContainer) {
            dayOfWeekButtonsContainer.addEventListener('click', (event) => {
              if (event.target.tagName === 'BUTTON') {
                event.target.classList.toggle('selected');
              }
            });
            const daysToRestore = initialValue.day_of_week || initialValue.start_day_of_week;
            if (daysToRestore && Array.isArray(daysToRestore)) {
              daysToRestore.forEach(day => {
                const button = dayOfWeekButtonsContainer.querySelector(`button[data-value="${day}"]`);
                if (button) button.classList.add('selected');
              });
            }
          }

          // Summaryの更新ロジック
          ['start', 'end'].forEach(group => {
            const details = triggerValueContainer.querySelector(`[data-group='${group}']`);
            if(details) {
                details.addEventListener('input', () => updateSummary(group));
                updateSummary(group); // 初期表示の更新
            }
          });
        }
        break;
      case "収支管理":
        if (sub === "入力があったら") {
          triggerValueContainer.innerHTML = `
            <label>アクション (複数選択可)</label>
            <div id="${prefix}trigger_value_finance_actions" class="co-day-of-week-selector">
              <button type="button" data-value="追加">追加</button>
              <button type="button" data-value="変更">変更</button>
              <button type="button" data-value="取得">取得</button>
              <button type="button" data-value="削除">削除</button>
            </div>
            <div id="${prefix}trigger_value_finance_genres_container" style="display: none; margin-top: 15px;">
              <label>ジャンル (複数選択可)</label>
              <div id="${prefix}trigger_value_finance_genres" class="co-day-of-week-selector">
                <p>ジャンルを読み込み中...</p>
              </div>
            </div>
          `;

          const actionButtonsContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_finance_actions`);
          const genresContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_finance_genres_container`);
          const genresButtonsContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_finance_genres`);

          const populateGenres = async () => {
            const genres = await fetchGenres();
            genresButtonsContainer.innerHTML = '';
            if (genres.length === 0) {
                genresButtonsContainer.innerHTML = '<p>ジャンルが登録されていません。</p>';
                return;
            }
            genres.forEach(genre => {
              const button = document.createElement('button');
              button.type = 'button';
              button.dataset.value = genre.name;
              button.textContent = genre.name;
              genresButtonsContainer.appendChild(button);
            });

            if (initialValue.genres && Array.isArray(initialValue.genres)) {
              initialValue.genres.forEach(genreName => {
                const button = genresButtonsContainer.querySelector(`button[data-value="${genreName}"]`);
                if (button) button.classList.add('selected');
              });
            }
          };

          const toggleGenresUI = () => {
            const addButton = actionButtonsContainer.querySelector('button[data-value="追加"]');
            if (addButton && addButton.classList.contains('selected')) {
              genresContainer.style.display = 'block';
            } else {
              genresContainer.style.display = 'none';
            }
          };

          if (actionButtonsContainer) {
            actionButtonsContainer.addEventListener('click', (event) => {
              if (event.target.tagName === 'BUTTON') {
                event.target.classList.toggle('selected');
                toggleGenresUI();
              }
            });
            if (initialValue.actions && Array.isArray(initialValue.actions)) {
              initialValue.actions.forEach(action => {
                const button = actionButtonsContainer.querySelector(`button[data-value="${action}"]`);
                if (button) button.classList.add('selected');
              });
            }
          }
          
          if (genresButtonsContainer) {
            genresButtonsContainer.addEventListener('click', (event) => {
              if (event.target.tagName === 'BUTTON') {
                event.target.classList.toggle('selected');
              }
            });
          }
          
          populateGenres();
          toggleGenresUI();
        } else if (sub === "特定金額になったら") {
          triggerValueContainer.innerHTML = `
            <label>項目</label>
            <select id="${prefix}trigger_value_finance_item" class="trigger-input" required>
              <option value="total_balance" ${initialValue.item === 'total_balance' ? 'selected' : ''}>総所持金</option>
              <option value="remaining_to_target" ${initialValue.item === 'remaining_to_target' ? 'selected' : ''}>目標金額までの残金</option>
              <option value="monthly_expense" ${initialValue.item === 'monthly_expense' ? 'selected' : ''}>今月の支出</option>
              <option value="monthly_expense_no_necessities" ${initialValue.item === 'monthly_expense_no_necessities' ? 'selected' : ''}>今月の支出(必需品なし)</option>
              <option value="monthly_income" ${initialValue.item === 'monthly_income' ? 'selected' : ''}>今月の収入</option>
              <option value="daily_expense" ${initialValue.item === 'daily_expense' ? 'selected' : ''}>今日の支出</option>
              <option value="daily_expense_no_necessities" ${initialValue.item === 'daily_expense_no_necessities' ? 'selected' : ''}>今日の支出(必需品なし)</option>
            </select>
            <label>判定</label>
            <select id="${prefix}trigger_value_finance_compare" class="trigger-input" required>
              <option value="gte" ${initialValue.compare === 'gte' ? 'selected' : ''}>上回ったら</option>
              <option value="lte" ${initialValue.compare === 'lte' ? 'selected' : ''}>下回ったら</option>
            </select>
            <label>金額</label>
            <input type="number" id="${prefix}trigger_value_finance_amount" class="trigger-input" placeholder="金額 (円)" value="${initialValue.amount || ''}">
            <label>または</label>
            <input type="number" id="${prefix}trigger_value_finance_percentage" class="trigger-input" placeholder="目標額のn%" value="${initialValue.percentage || ''}">
            <small>金額と目標額のn%はどちらか一方を入力してください。</small>
          `;
        }
        break;
      case "メモ":
        // メモカテゴリは詳細がないので、subを見ずにUIを生成
        triggerValueContainer.innerHTML = `
          <label>アクション (複数選択可)</label>
          <div id="${prefix}trigger_value_memo_actions" class="co-day-of-week-selector">
            <button type="button" data-value="追加">追加</button>
            <button type="button" data-value="変更">変更</button>
            <button type="button" data-value="取得">取得</button>
            <button type="button" data-value="削除">削除</button>
          </div>
          <label>フィルター (任意)</label><br>
          <small>単語を指定して、検知するアクションにフィルターを掛けれます。</small>
          <div id="${prefix}trigger_value_memo_filters">
            <button type="button" class="add_filter_btn co-btn ghost">フィルターを追加</button>
          </div>
        `;

        const actionButtonsContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_memo_actions`);
        if (actionButtonsContainer) {
          actionButtonsContainer.addEventListener('click', (event) => {
            if (event.target.tagName === 'BUTTON') {
              event.target.classList.toggle('selected');
            }
          });
          if (initialValue.actions && Array.isArray(initialValue.actions)) {
            initialValue.actions.forEach(action => {
              const button = actionButtonsContainer.querySelector(`button[data-value="${action}"]`);
              if (button) {
                button.classList.add('selected');
              }
            });
          }
        }
        const addFilterBtn = triggerValueContainer.querySelector(".add_filter_btn");
        const filterContainer = triggerValueContainer.querySelector(`#${prefix}trigger_value_memo_filters`);
        if (addFilterBtn) {
          const addFilter = (filter = {}) => {
            const filterDiv = document.createElement("div");
            filterDiv.className = "filter-item";

            const isFirstItem = filterContainer.querySelectorAll('.filter-item').length === 0;

            let logicOptions = '';
            if (isFirstItem) {
              logicOptions = `
                <option value="" ${filter.logic === '' ? 'selected' : ''}>(先頭)</option>
                <option value="NOT" ${filter.logic === 'NOT' ? 'selected' : ''}>NOT (この単語が含まれていないなら)</option>
              `;
            } else {
              logicOptions = `
                <option value="AND" ${filter.logic === 'AND' ? 'selected' : ''}>AND (「上のフィルター」と「このフィルター」の両方を満たす)</option>
                <option value="OR" ${filter.logic === 'OR' ? 'selected' : ''}>OR (「上のフィルター」か「このフィルター」のどちらか一方でも満たす)</option>
                <option value="NOT" ${filter.logic === 'NOT' ? 'selected' : ''}>NOT (かつ、この単語が含まれていないなら)</option>
                <option value="NAND" ${filter.logic === 'NAND' ? 'selected' : ''}>NAND (「上のフィルター」と「このフィルター」の両方を満たすものを含まない)</option>
                <option value="NOR" ${filter.logic === 'NOR' ? 'selected' : ''}>NOR (「上のフィルター」も「このフィルター」もどちらも満たさない)</option>
                <option value="XOR" ${filter.logic === 'XOR' ? 'selected' : ''}>XOR (「上のフィルター」か「このフィルター」のどちらか一方だけを満たす)</option>
                <option value="XNOR" ${filter.logic === 'XNOR' ? 'selected' : ''}>XNOR (「上のフィルター」と「このフィルター」の条件が同じである（両方満たす、または両方満たさない）)</option>
              `;
            }

            filterDiv.innerHTML = `
              <input type="text" class="memo_filter_text trigger-input" placeholder="フィルター内容" value="${filter.text || ''}">
              <select class="memo_filter_logic trigger-input">
                ${logicOptions}
              </select>
              <button type="button" class="remove_filter_btn remove">削除</button>
            `;
            filterDiv.querySelector(".remove_filter_btn").addEventListener("click", (e) => e.target.parentNode.remove());
            filterContainer.insertBefore(filterDiv, addFilterBtn);
          };
          addFilterBtn.addEventListener("click", () => addFilter());
          initialValue.filters?.forEach(filter => addFilter(filter));
        }
        break;
      case "時間":
        if (prefix) { // 条件の場合 (範囲指定UI)
          const updateSummary = (group) => {
            const details = triggerValueContainer.querySelector(`[data-group='${group}']`);
            if (!details) return;

            const year = details.querySelector(`[id$='_time_${group}_year']`)?.value || '';
            const month = details.querySelector(`[id$='_time_${group}_month']`)?.value || '';
            const day = details.querySelector(`[id$='_time_${group}_day']`)?.value || '';
            const time = details.querySelector(`[id$='_time_${group}_time']`)?.value || '';
            
            let summaryText = '';
            if (year) summaryText += `${year}年`;
            if (month) summaryText += `${month}月`;
            if (day) summaryText += `${day}日`;
            if (summaryText && time) summaryText += ' ';
            if (time) summaryText += time;

            const summaryValueEl = details.querySelector('.co-summary-value');
            if (summaryValueEl) {
                summaryValueEl.textContent = summaryText || '未設定';
            }
          };

          let html = `
            <small><b>以下の条件を満たす期間内にいる場合</b></small>
            
            <label style="margin-top: 10px; display: block;">曜日 (任意)(複数選択可)</label>
            <div id="${prefix}trigger_value_time_day_of_week_buttons" class="co-day-of-week-selector">
                <button type="button" data-value="月">月</button> <button type="button" data-value="火">火</button> <button type="button" data-value="水">水</button> <button type="button" data-value="木">木</button>
                <button type="button" data-value="金">金</button> <button type="button" data-value="土">土</button> <button type="button" data-value="日">日</button>
            </div>

            <details class="co-details-group" data-group="start" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
              <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
                <span>開始日時</span>
                <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
              </summary>
              <div class="co-details-content" style="margin-top: 15px;">
                  <label>年 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_time_start_year" class="trigger-input" list="${prefix}time_start_year_options" value="${initialValue.start_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}time_start_year_options">${(() => { let o = ''; const y = new Date().getFullYear(); for (let i = y; i <= y + 20; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>月 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_time_start_month" class="trigger-input" list="${prefix}time_start_month_options" value="${initialValue.start_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}time_start_month_options">${(() => { let o = ''; for (let i = 1; i <= 12; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>日 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_time_start_day" class="trigger-input" list="${prefix}time_start_day_options" value="${initialValue.start_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}time_start_day_options">${(() => { let o = ''; for (let i = 1; i <= 31; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>時刻 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_time_start_time" class="trigger-input" list="${prefix}time_start_time_options" value="${initialValue.start_time || ''}" placeholder="例: 07:30" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}time_start_time_options">${(() => { let o = ''; for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) o += `<option value="${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}">`; return o; })()}</datalist>
              </div>
            </details>

            <details class="co-details-group" data-group="end" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
              <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
                <span>終了日時</span>
                <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
              </summary>
              <div class="co-details-content" style="margin-top: 15px;">
                  <label>年 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_time_end_year" class="trigger-input" list="${prefix}time_end_year_options" value="${initialValue.end_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}time_end_year_options">${(() => { let o = ''; const y = new Date().getFullYear(); for (let i = y; i <= y + 20; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>月 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_time_end_month" class="trigger-input" list="${prefix}time_end_month_options" value="${initialValue.end_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}time_end_month_options">${(() => { let o = ''; for (let i = 1; i <= 12; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>日 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_time_end_day" class="trigger-input" list="${prefix}time_end_day_options" value="${initialValue.end_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}time_end_day_options">${(() => { let o = ''; for (let i = 1; i <= 31; i++) { o += `<option value="${i}">`; } return o; })()}</datalist>
                  <label>時刻 (任意)</label>
                  <input type="text" id="${prefix}trigger_value_time_end_time" class="trigger-input" list="${prefix}time_end_time_options" value="${initialValue.end_time || ''}" placeholder="例: 18:00" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                  <datalist id="${prefix}time_end_time_options">${(() => { let o = ''; for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) o += `<option value="${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}">`; return o; })()}</datalist>
              </div>
            </details>
          `;
          triggerValueContainer.innerHTML = html;

          const dayOfWeekButtonsContainer = document.getElementById(`${prefix}trigger_value_time_day_of_week_buttons`);
          if (dayOfWeekButtonsContainer) {
            dayOfWeekButtonsContainer.addEventListener('click', (event) => {
              if (event.target.tagName === 'BUTTON') event.target.classList.toggle('selected');
            });
            if (initialValue.day_of_week && Array.isArray(initialValue.day_of_week)) {
              initialValue.day_of_week.forEach(day => {
                const button = dayOfWeekButtonsContainer.querySelector(`button[data-value="${day}"]`);
                if (button) button.classList.add('selected');
              });
            }
          }

          ['start', 'end'].forEach(group => {
            const details = triggerValueContainer.querySelector(`[data-group='${group}']`);
            if(details) {
                details.addEventListener('input', () => updateSummary(group));
                updateSummary(group);
            }
          });
        } else { // トリガーの場合 (特定時間UI)
          let html = `
            <small><b>注意：以下の全ての条件を満たす時にトリガーが発動します。</b><br></small>
            <label>年 (任意)</label>
            <input type="text" id="${prefix}trigger_value_time_year" class="trigger-input" list="${prefix}year_options" value="${initialValue.year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
            <datalist id="${prefix}year_options">${(() => { let o = ''; const y = new Date().getFullYear(); for (let i = y; i <= y + 20; i++) o += `<option value="${i}">`; return o; })()}</datalist>
            <label>月 (任意)</label>
            <input type="text" id="${prefix}trigger_value_time_month" class="trigger-input" list="${prefix}month_options" value="${initialValue.month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
            <datalist id="${prefix}month_options">${(() => { let o = ''; for (let i = 1; i <= 12; i++) o += `<option value="${i}">`; return o; })()}</datalist>
            <label>日 (任意)</label>
            <input type="text" id="${prefix}trigger_value_time_day" class="trigger-input" list="${prefix}day_options" value="${initialValue.day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
            <datalist id="${prefix}day_options">${(() => { let o = ''; for (let d = 1; d <= 31; d++) o += `<option value="${d}">`; return o; })()}</datalist>
            <label>曜日 (任意)(複数選択可)</label>
            <div id="${prefix}trigger_value_time_day_of_week_buttons" class="co-day-of-week-selector">
              <button type="button" data-value="月">月</button> <button type="button" data-value="火">火</button> <button type="button" data-value="水">水</button> <button type="button" data-value="木">木</button>
              <button type="button" data-value="金">金</button> <button type="button" data-value="土">土</button> <button type="button" data-value="日">日</button>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <label style="margin: 0;">時刻 (必須)</label>
                <button type="button" id="${prefix}set_time_after_1_min_btn" class="co-btn ghost" style="padding: 5px 10px;">1分後</button>
            </div>
            <input type="text" id="${prefix}trigger_value_time_time_start" class="trigger-input" list="${prefix}time_options_start" value="${initialValue.time_start || ''}" placeholder="例: 07:30" required onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
            <datalist id="${prefix}time_options_start">${(() => { let o = ''; for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) o += `<option value="${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}">`; return o; })()}</datalist>
          `;
          triggerValueContainer.innerHTML = html;
          
          // 「1分後」ボタンのイベントリスナー
          const setTimeAfter1MinBtn = document.getElementById(`${prefix}set_time_after_1_min_btn`);
          if (setTimeAfter1MinBtn) {
            setTimeAfter1MinBtn.addEventListener('click', () => {
              const now = new Date();
              now.setMinutes(now.getMinutes() + 1);
              const hours = String(now.getHours()).padStart(2, '0');
              const minutes = String(now.getMinutes()).padStart(2, '0');
              const timeInput = document.getElementById(`${prefix}trigger_value_time_time_start`);
              if (timeInput) {
                timeInput.value = `${hours}:${minutes}`;
              }
            });
          }

          const dayOfWeekButtonsContainer = document.getElementById(`${prefix}trigger_value_time_day_of_week_buttons`);
          if (dayOfWeekButtonsContainer) {
            dayOfWeekButtonsContainer.addEventListener('click', (event) => {
              if (event.target.tagName === 'BUTTON') event.target.classList.toggle('selected');
            });
            if (initialValue.day_of_week && Array.isArray(initialValue.day_of_week)) {
              initialValue.day_of_week.forEach(day => {
                const button = dayOfWeekButtonsContainer.querySelector(`button[data-value="${day}"]`);
                if (button) button.classList.add('selected');
              });
            }
          }
        }
        break;
      case "ボイス":
        triggerValueContainer.innerHTML = `
          <label>キーワード (カンマ区切り)</label>
          <input type="text" id="${prefix}trigger_value_voice_keywords" class="trigger-input" placeholder="例: おはよう,起動" value="${safeVoiceKeywords}">
          <small>入力された単語が含まれるとトリガーが発動します。</small>
        `;
        break;
      case "SwitchBot":
        triggerValueContainer.innerHTML = `
          <label for="${prefix}trigger_value_switchbot_device_select">デバイス</label>
          <select id="${prefix}trigger_value_switchbot_device_select" class="trigger-input">
            <option value="">デバイス一覧を取得中...</option>
          </select>
          <label for="${prefix}trigger_value_switchbot_brightness">明るさ条件</label>
          <select id="${prefix}trigger_value_switchbot_brightness" class="trigger-input">
            <option value="">指定なし</option>
            <option value="bright" ${(initialValue.brightness_condition === "bright" ? "selected" : "")}>明るいとき</option>
            <option value="dark" ${(initialValue.brightness_condition === "dark" ? "selected" : "")}>暗いとき</option>
          </select>
          <label for="${prefix}trigger_value_switchbot_motion">人の居る/居ない条件</label>
          <select id="${prefix}trigger_value_switchbot_motion" class="trigger-input">
            <option value="">指定なし</option>
            <option value="present" ${(initialValue.motion_condition === "present" ? "selected" : "")}>人が居るとき</option>
            <option value="absent" ${(initialValue.motion_condition === "absent" ? "selected" : "")}>人が居ないとき</option>
          </select>
          <small>人感センサーの人の居る/居ないと明るさを組み合わせてトリガーを発動します。</small>
        `;
        (async () => {
          const select = document.getElementById(`${prefix}trigger_value_switchbot_device_select`);
          if (!select) return;
          try {
            const response = await fetch('/api/switchbot/devices');
            const data = await response.json();
            const devices = data?.devices || [];
            select.innerHTML = '';
            if (!devices.length) {
              const opt = document.createElement('option');
              opt.value = '';
              opt.textContent = 'デバイスが見つかりませんでした';
              select.appendChild(opt);
              return;
            }
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '選択してください';
            select.appendChild(defaultOpt);
            devices.forEach((device) => {
              const opt = document.createElement('option');
              opt.value = device.id;
              opt.textContent = `${device.name} (${device.type})`;
              if (initialValue.device_id && initialValue.device_id === device.id) {
                opt.selected = true;
              }
              select.appendChild(opt);
            });
          } catch (e) {
            select.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'デバイス一覧の取得に失敗しました';
            select.appendChild(opt);
          }
        })();
        break;
default:
        triggerValueContainer.innerHTML = `<input type="text" id="${prefix}trigger_value" placeholder="${defaultPlaceholder}" value="${initialValue.value || ''}">`;
        break;
    }
  } else {
    triggerValueContainer.innerHTML = `<input type="text" id="${prefix}trigger_value" placeholder="${defaultPlaceholder}" value="${initialValue.value || ''}">`;
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


