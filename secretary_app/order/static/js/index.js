import { TRIGGER_CATEGORIES_MAIN } from './constants.js';
import { populateSelect, updateSubOptions } from './ui_helpers.js';
import { createTriggerUI, updateTriggerInputFields } from './trigger_ui.js';
import { addConditionBlock, addAction } from './block_operations.js';
import { registerCommand, loadCommands, pollPendingActions } from './command_manager.js';

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
  
  loadCommands();
  console.log("--- DEBUG: Setting up pollPendingActions interval (5000ms). ---"); // 追加
  setInterval(pollPendingActions, 5000); // 5秒ごとにポーリングを追加
  updateTriggerInputFields(); // 初期表示
});
