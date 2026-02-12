import { TRIGGER_CATEGORIES_MAIN } from './constants.js';
import { populateSelect, updateSubOptions } from './ui_helpers.js';
import { createTriggerUI, updateTriggerInputFields } from './trigger_ui.js';
import { addConditionBlock, addAction } from './block_operations.js';
import { registerCommand, loadCommands, pollPendingActions, getCommandPayloadFromForm, loadCommandToForm } from './command_manager.js';

document.addEventListener("DOMContentLoaded",()=>{
  console.log("DOMContentLoaded event fired.");
  populateSelect("trigger_category", TRIGGER_CATEGORIES_MAIN);
  
  document.getElementById("trigger_category").addEventListener("change",()=>{
    updateSubOptions("trigger_category","trigger_sub",TRIGGER_CATEGORIES_MAIN);
    createTriggerUI(''); // updateSubOptionsの後にcreateTriggerUIを呼ぶ
  });
  document.getElementById("trigger_sub").addEventListener("change",()=>createTriggerUI(''));
  
  document.getElementById("add-condition-top").addEventListener("click",(event)=>addConditionBlock(event.currentTarget));
  document.getElementById("add-action-top").addEventListener("click",(event)=>addAction(event.currentTarget));
  document.getElementById("register-btn").addEventListener("click",registerCommand);

  const tagHelpOpenBtn = document.getElementById("tag-help-open-btn");
  const tagHelpCloseBtn = document.getElementById("tag-help-close-btn");
  const tagHelpOverlay = document.getElementById("tag-help-overlay");

  const openTagHelp = () => tagHelpOverlay?.classList.remove("co-hidden");
  const closeTagHelp = () => tagHelpOverlay?.classList.add("co-hidden");

  tagHelpOpenBtn?.addEventListener("click", openTagHelp);
  tagHelpCloseBtn?.addEventListener("click", closeTagHelp);
  tagHelpOverlay?.addEventListener("click", (event) => {
    if (event.target === tagHelpOverlay) closeTagHelp();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTagHelp();
  });
  
  // JSON Import/Export
  const downloadBtn = document.getElementById('download-as-json-btn');
  const loadBtn = document.getElementById('load-from-json-btn');
  const jsonArea = document.getElementById('json-input-area');

  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      const payload = await getCommandPayloadFromForm();
      if (!payload) return;

      const commandName = payload.name.trim().replace(/\s+/g, '_') || 'command';
      const jsonString = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${commandName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (loadBtn && jsonArea) {
    loadBtn.addEventListener('click', () => {
      const jsonString = jsonArea.value.trim();
      if (!jsonString) {
        alert('JSONデータを入力してください。');
        return;
      }
      try {
        const commandData = JSON.parse(jsonString);
        loadCommandToForm(commandData);
        jsonArea.value = ''; // 読み込み後にクリア
        alert('JSONから設定を読み込みました。');
      } catch (error) {
        console.error("JSONのパースに失敗しました:", error);
        alert(`無効なJSONデータです: ${error.message}`);
      }
    });
  }

  loadCommands();
  console.log("--- DEBUG: Setting up pollPendingActions interval (5000ms). ---"); // 追加
  setInterval(pollPendingActions, 5000); // 5秒ごとにポーリングを追加
  updateTriggerInputFields(); // 初期表示
});
