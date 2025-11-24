import { TRIGGER_CATEGORIES } from './constants.js';
import { populateSelect, updateSubOptions } from './ui_helpers.js';
import { createTriggerUI, updateTriggerInputFields } from './trigger_ui.js';
import { addConditionBlock, addAction } from './block_operations.js';
import { registerCommand, loadCommands, pollPendingActions } from './command_manager.js';

document.addEventListener("DOMContentLoaded",()=>{
  console.log("DOMContentLoaded event fired.");
  populateSelect("trigger_category", TRIGGER_CATEGORIES);
  
  document.getElementById("trigger_category").addEventListener("change",()=>{
    updateSubOptions("trigger_category","trigger_sub",TRIGGER_CATEGORIES);
    createTriggerUI(''); // updateSubOptionsの後にcreateTriggerUIを呼ぶ
  });
  document.getElementById("trigger_sub").addEventListener("change",()=>createTriggerUI(''));
  
  document.getElementById("add-condition").addEventListener("click",()=>addConditionBlock(document.getElementById("condition_blocks")));
  document.getElementById("add-action").addEventListener("click",()=>addAction(document.getElementById("condition_blocks")));
  document.getElementById("register-btn").addEventListener("click",registerCommand);
  
  loadCommands();
  setInterval(pollPendingActions, 5000); // 5秒ごとにポーリングを追加
  updateTriggerInputFields(); // 初期表示
});