const listEl = document.getElementById('cat-list');
const emptyEl = document.getElementById('cat-empty');
const inputEl = document.getElementById('cat-input');

document.getElementById('cat-add').addEventListener('click', add);
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
document.getElementById('cat-clear').addEventListener('click', clearAll);

// HTMLエスケープ（XSS対策）
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ✅ 1. カテゴリ一覧を取得（Supabaseから）
async function render() {
  const res = await fetch("/api/categories");
  const data = await res.json();

  listEl.innerHTML = "";
  if (!data || data.length === 0) {
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  data.forEach(cat => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `
      <span>${escapeHtml(cat.name)}</span>
      <span class="del" title="削除">×</span>
    `;
    chip.querySelector('.del').addEventListener('click', async () => {
      if (!confirm(`「${cat.name}」を削除しますか？`)) return;
      await deleteCategory(cat.id);
      render();
    });
    listEl.appendChild(chip);
  });
}

// ✅ 2. 追加処理（SupabaseへPOST）
async function add() {
  const name = (inputEl.value || "").trim();
  if (!name) return;

  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  const data = await res.json();
  if (data.error) {
    alert(data.error);
    return;
  }

  inputEl.value = "";
  inputEl.focus();
  render();
}

// ✅ 3. 削除処理（個別削除）
async function deleteCategory(id) {
  await fetch(`/api/categories/${id}`, { method: "DELETE" });
}

// ✅ 4. 全削除処理
async function clearAll() {
  const res = await fetch("/api/categories");
  const cats = await res.json();
  if (!cats.length) return;
  if (confirm('全ての種類を削除しますか？')) {
    await fetch("/api/categories/clear", { method: "DELETE" });
    render();
  }
}

// 初期読み込み
render();
