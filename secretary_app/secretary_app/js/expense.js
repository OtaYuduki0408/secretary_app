    const LS_CATEGORIES = "fm_categories";
    const LS_RECORDS = "fm_records";

    let categories = JSON.parse(localStorage.getItem(LS_CATEGORIES) || "[]");
    let records = JSON.parse(localStorage.getItem(LS_RECORDS) || "[]");
    let selected = "";

    const chipBox = document.getElementById('chip-box');
    const noCat = document.getElementById('no-cat');

    // 初期描画
    renderChips(); updateStatus();

    function renderChips(){
      chipBox.innerHTML = "";
      if(categories.length===0){
        noCat.style.display = "block";
        document.getElementById('save').disabled = true;
        return;
      }
      noCat.style.display = "none";
      document.getElementById('save').disabled = false;

      categories.forEach(name=>{
        const chip = document.createElement('button');
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = name;
        chip.addEventListener('click', ()=>{
          selected = name;
          chipBox.querySelectorAll('.chip').forEach(c=>c.classList.toggle('selected', c.textContent===name));
        });
        chipBox.appendChild(chip);
      });
    }

    document.getElementById('save').addEventListener('click', ()=>{
      const amount = Number(document.getElementById('amount').value);
      const purpose = document.getElementById('purpose').value.trim();
      if(!amount || !selected){ alert('金額と種類を入力してください。'); return; }

      const now = new Date();
      records.push({ amount, category:selected, purpose, ts:now.toISOString() });
      localStorage.setItem(LS_RECORDS, JSON.stringify(records));
      document.getElementById('amount').value = "";
      document.getElementById('purpose').value = "";
      updateStatus();
      alert('保存しました。');
    });

    function updateStatus(){
      const now = new Date();
      const today = now.toISOString().slice(0,10);
      const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

      let bal = 0, mSpent = 0, dSpent = 0;
      for(const r of records){
        const d = new Date(r.ts);
        const rYm = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        const rDay = r.ts.slice(0,10);
        const isIncome = (r.category === "収入"); // 「収入」は入金扱い

        if(isIncome) bal += r.amount;
        else         bal -= r.amount;

        if(!isIncome && rYm===ym) mSpent += r.amount;
        if(!isIncome && rDay===today) dSpent += r.amount;
      }
      document.getElementById('balance').textContent = toJa(bal);
      document.getElementById('monthly').textContent = toJa(mSpent);
      document.getElementById('daily').textContent = toJa(dSpent);
    }
    function toJa(n){ return (n|0).toLocaleString("ja-JP"); }

    // 設定ページから戻ったときに種類を再読込
    window.addEventListener('focus', ()=>{
      const latest = JSON.parse(localStorage.getItem(LS_CATEGORIES) || "[]");
      if(JSON.stringify(latest) !== JSON.stringify(categories)){
        categories = latest; selected = ""; renderChips();
      }
    });