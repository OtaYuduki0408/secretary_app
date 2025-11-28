    const LS_CATEGORIES = "fm_categories";
    let categories = JSON.parse(localStorage.getItem(LS_CATEGORIES) || "[]");

    const listEl = document.getElementById('cat-list');
    const emptyEl = document.getElementById('cat-empty');
    const inputEl = document.getElementById('cat-input');

    function save(){ localStorage.setItem(LS_CATEGORIES, JSON.stringify(categories)); }
    function render(){
      listEl.innerHTML = "";
      if (categories.length === 0){ emptyEl.style.display = "block"; return; }
      emptyEl.style.display = "none";
      categories.forEach(name=>{
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `<span>${escapeHtml(name)}</span><span class="del" title="削除">×</span>`;
        chip.querySelector('.del').addEventListener('click', ()=>{
          if (!confirm(`「${name}」を削除しますか？`)) return;
          categories = categories.filter(n=>n!==name);
          save(); render();
        });
        listEl.appendChild(chip);
      });
    }
    function add(){
      const name = (inputEl.value||"").trim();
      if(!name) return;
      if(!categories.includes(name)){
        categories.push(name);
        save(); render();
      }
      inputEl.value = "";
      inputEl.focus();
    }
    document.getElementById('cat-add').addEventListener('click', add);
    inputEl.addEventListener('keydown', e=>{ if(e.key==='Enter') add(); });
    document.getElementById('cat-clear').addEventListener('click', ()=>{
      if(categories.length===0) return;
      if(confirm('全ての種類を削除しますか？')){
        categories = []; save(); render();
      }
    });

    function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));}
    render();