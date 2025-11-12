document.addEventListener('DOMContentLoaded', () => {
  const dataEl = document.getElementById('exp-cat-data');
  const selectEl = document.getElementById('exp-category');
  const emptyEl = document.getElementById('exp-cat-empty');
  const typeRadios = Array.from(document.querySelectorAll('input[name="type"]'));

  let categories = [];
  try {
    categories = JSON.parse(dataEl?.dataset?.categories || '[]') || [];
  } catch (_) {
    categories = [];
  }

  function renderOptions(type) {
    // Filter categories by selected type
    const items = categories.filter(c => c.type === type);

    // Clear current options
    while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);

    if (!items.length) {
      selectEl.disabled = true;
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    selectEl.disabled = false;

    // Append options
    for (const c of items) {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      selectEl.appendChild(opt);
    }
  }

  // On radio change, re-render options
  typeRadios.forEach(r => r.addEventListener('change', () => renderOptions(r.value)));

  // Initial render based on checked type (default: expense)
  const checked = typeRadios.find(r => r.checked)?.value || 'expense';
  renderOptions(checked);
});

