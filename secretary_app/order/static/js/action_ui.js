import { updateActionSummary } from './ui_helpers.js';
import { fetchGenres } from './command_manager.js';

export function createActionUI(prefix = '', initialValue = {}) {
  console.log(`createActionUI called with prefix: '${prefix}', initialValue:`, initialValue);
  const category = document.getElementById(`${prefix}action_category`).value;
  const sub = document.getElementById(`${prefix}action_sub`).value;
  const detailContainer = document.getElementById(`${prefix}action_detail_container`);
  detailContainer.innerHTML = '';

  switch (category) {
    case "カレンダー":
      if (sub === "追加" || sub === "削除") {
        detailContainer.innerHTML = `<textarea class="action-detail-cal-text" placeholder="内容">${initialValue.text || ''}</textarea>`;
      } else if (sub === "読み上げ") {
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
          <details class="co-details-group" data-group="start" style="border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
            <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
              <span>読み上げ範囲 (開始)</span>
              <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
            </summary>
            <div class="co-details-content" style="margin-top: 15px;">
                <label>年 (任意)</label>
                <input type="text" class="action-detail-cal-read-start-year" list="action_cal_read_start_year_options" value="${initialValue.start_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_cal_read_start_year_options">${generateDatalist('year')}</datalist>
                <label>月 (任意)</label>
                <input type="text" class="action-detail-cal-read-start-month" list="action_cal_read_start_month_options" value="${initialValue.start_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_cal_read_start_month_options">${generateDatalist('month')}</datalist>
                <label>日 (任意)</label>
                <input type="text" class="action-detail-cal-read-start-day" list="action_cal_read_start_day_options" value="${initialValue.start_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_cal_read_start_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (任意)</label>
                <input type="text" class="action-detail-cal-read-start-time" list="action_cal_read_start_time_options" value="${initialValue.start_time || ''}" placeholder="例: 07:30" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_cal_read_start_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
          <details class="co-details-group" data-group="end" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
            <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
              <span>読み上げ範囲 (終了)</span>
              <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
            </summary>
            <div class="co-details-content" style="margin-top: 15px;">
                <label>年 (任意)</label>
                <input type="text" class="action-detail-cal-read-end-year" list="action_cal_read_end_year_options" value="${initialValue.end_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_cal_read_end_year_options">${generateDatalist('year')}</datalist>
                <label>月 (任意)</label>
                <input type="text" class="action-detail-cal-read-end-month" list="action_cal_read_end_month_options" value="${initialValue.end_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_cal_read_end_month_options">${generateDatalist('month')}</datalist>
                <label>日 (任意)</label>
                <input type="text" class="action-detail-cal-read-end-day" list="action_cal_read_end_day_options" value="${initialValue.end_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_cal_read_end_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (任意)</label>
                <input type="text" class="action-detail-cal-read-end-time" list="action_cal_read_end_time_options" value="${initialValue.end_time || ''}" placeholder="例: 18:00" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') thisvalue=this.getAttribute('data-prev-value');">
                <datalist id="action_cal_read_end_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
        `;

        ['start', 'end'].forEach(group => {
          const details = detailContainer.querySelector(`[data-group='${group}']`);
          if(details) {
            details.addEventListener('input', () => updateActionSummary(group));
            updateActionSummary(group); // 初期表示の更新
          }
        });
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
                <label>年 (任意)</label>
                <input type="text" class="action-detail-fin-read-start-year" list="action_fin_read_start_year_options" value="${initialValue.start_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_start_year_options">${generateDatalist('year')}</datalist>
                <label>月 (任意)</label>
                <input type="text" class="action-detail-fin-read-start-month" list="action_fin_read_start_month_options" value="${initialValue.start_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_start_month_options">${generateDatalist('month')}</datalist>
                <label>日 (任意)</label>
                <input type="text" class="action-detail-fin-read-start-day" list="action_fin_read_start_day_options" value="${initialValue.start_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_start_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (任意)</label>
                <input type="text" class="action-detail-fin-read-start-time" list="action_fin_read_start_time_options" value="${initialValue.start_time || ''}" placeholder="例: 07:30" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_start_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
          <details class="co-details-group" data-group="end" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
            <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
              <span>読み上げ範囲 (終了)</span>
              <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
            </summary>
            <div class="co-details-content" style="margin-top: 15px;">
                <label>年 (任意)</label>
                <input type="text" class="action-detail-fin-read-end-year" list="action_fin_read_end_year_options" value="${initialValue.end_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_end_year_options">${generateDatalist('year')}</datalist>
                <label>月 (任意)</label>
                <input type="text" class="action-detail-fin-read-end-month" list="action_fin_read_end_month_options" value="${initialValue.end_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_end_month_options">${generateDatalist('month')}</datalist>
                <label>日 (任意)</label>
                <input type="text" class="action-detail-fin-read-end-day" list="action_fin_read_end_day_options" value="${initialValue.end_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_end_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (任意)</label>
                <input type="text" class="action-detail-fin-read-end-time" list="action_fin_read_end_time_options" value="${initialValue.end_time || ''}" placeholder="例: 18:00" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_fin_read_end_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
        `;

        ['start', 'end'].forEach(group => {
          const details = detailContainer.querySelector(`[data-group='${group}']`);
          if(details) {
            details.addEventListener('input', () => updateActionSummary(group));
            updateActionSummary(group); // 初期表示の更新
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
                <label>年 (任意)</label>
                <input type="text" class="action-detail-memo-read-start-year" list="action_memo_read_start_year_options" value="${initialValue.start_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_start_year_options">${generateDatalist('year')}</datalist>
                <label>月 (任意)</label>
                <input type="text" class="action-detail-memo-read-start-month" list="action_memo_read_start_month_options" value="${initialValue.start_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_start_month_options">${generateDatalist('month')}</datalist>
                <label>日 (任意)</label>
                <input type="text" class="action-detail-memo-read-start-day" list="action_memo_read_start_day_options" value="${initialValue.start_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_start_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (任意)</label>
                <input type="text" class="action-detail-memo-read-start-time" list="action_memo_read_start_time_options" value="${initialValue.start_time || ''}" placeholder="例: 07:30" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_start_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
          <details class="co-details-group" data-group="end" style="margin-top: 10px; border: 1px solid var(--co-border); border-radius: 12px; padding: 10px;">
            <summary style="font-weight: 600; cursor: pointer; display: flex; justify-content: space-between;">
              <span>読み上げ範囲 (終了)</span>
              <span class="co-summary-value" style="color: var(--co-accent); padding-right: 10px;">未設定</span>
            </summary>
            <div class="co-details-content" style="margin-top: 15px;">
                <label>年 (任意)</label>
                <input type="text" class="action-detail-memo-read-end-year" list="action_memo_read_end_year_options" value="${initialValue.end_year || ''}" placeholder="例: 2025" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_end_year_options">${generateDatalist('year')}</datalist>
                <label>月 (任意)</label>
                <input type="text" class="action-detail-memo-read-end-month" list="action_memo_read_end_month_options" value="${initialValue.end_month || ''}" placeholder="例: 1" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_end_month_options">${generateDatalist('month')}</datalist>
                <label>日 (任意)</label>
                <input type="text" class="action-detail-memo-read-end-day" list="action_memo_read_end_day_options" value="${initialValue.end_day || ''}" placeholder="例: 15" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_end_day_options">${generateDatalist('day')}</datalist>
                <label>時刻 (任意)</label>
                <input type="text" class="action-detail-memo-read-end-time" list="action_memo_read_end_time_options" value="${initialValue.end_time || ''}" placeholder="例: 18:00" onfocus="this.setAttribute('data-prev-value', this.value); this.value='';" onblur="if(this.value==='') this.value=this.getAttribute('data-prev-value');">
                <datalist id="action_memo_read_end_time_options">${generateDatalist('time')}</datalist>
            </div>
          </details>
        `;

        ['start', 'end'].forEach(group => {
          const details = detailContainer.querySelector(`[data-group='${group}']`);
          if(details) {
            details.addEventListener('input', () => updateActionSummary(group));
            updateActionSummary(group); // 初期表示の更新
          }
        });
      }
      break;
    case "メール":
      if (sub === "送信") {
        detailContainer.innerHTML = `
          <label>件名</label>
          <input type="text" class="action-detail-mail-subject" placeholder="メールの件名" value="${initialValue.subject || ''}">
          <label>本文</label>
          <textarea class="action-detail-mail-body" placeholder="メールの本文">${initialValue.body || ''}</textarea>
          <label>付与情報</label>
          <div class="action-detail-mail-attachment">
            <!-- ここにさらにUIが追加される -->
            <button type="button" class="add-attachment-btn">付与情報を追加</button>
          </div>
        `;
        // TODO: 付与情報追加ボタンのロジック
      }
      break;
  }
}
