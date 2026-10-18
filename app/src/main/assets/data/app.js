window.initApp = function() {
  renderTabs();
  render();
  
  document.getElementById('tabbar').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if(!t) return;
    state.tab = t.dataset.tab;
    render();
  });

  document.getElementById('view').addEventListener('click', async e => {
    const t = e.target.closest('[data-act]'); if(!t) return;
    const act = t.dataset.act;

    // 通用
    if (act === 'closeSheet') { closeSheet(); return; }
    if (act === 'exportData') {
      const data = { transactions, skincareLib, skincareRoutine };
      if(window.AndroidFile) AndroidFile.saveFile(JSON.stringify(data), `backup_${todayStr()}.json`, 'application/json');
      return;
    }
    if (act === 'speak') { toggleSpeak(t.dataset.text, t.dataset.lang||'zh-CN', t); return; }
    
    // 记账
    if (act === 'setTxType') {
      state.pendingTx.type = t.dataset.t;
      state.pendingTx.category = t.dataset.t === 'income' ? '其他收入' : '其他';
      renderTxEditor(); return;
    }
    if (act === 'setTxCat') { state.pendingTx.category = t.dataset.cat; renderTxEditor(); return; }
    if (act === 'setTxAccount') {
      state.pendingTx.account = t.dataset.acc;
      LS.set('app_h_lastAccount', t.dataset.acc);
      renderTxEditor(); return;
    }
    if (act === 'addAccount') {
      const name = prompt('新账户名'); if(!name) return;
      const accs = getAccounts(); accs.push(name); saveAccounts(accs);
      state.pendingTx.account = name; renderTxEditor(); return;
    }
    if (act === 'speakNote') {
      const v = document.getElementById('txNote')?.value;
      if(v) toggleSpeak(v, 'zh-CN', t); return;
    }
    if (act === 'confirmTx') {
      const amt = parseFloat(document.getElementById('txAmount').value);
      const date = document.getElementById('txDate').value;
      const note = document.getElementById('txNote').value;
      if(!amt) { toast('金额有误'); return; }
      
      if(state.pendingTx.editingId) {
        const tx = transactions.find(x => x.id === state.pendingTx.editingId);
        if(tx) { tx.amount = amt; tx.date = date; tx.note = note; tx.category = state.pendingTx.category; tx.account = state.pendingTx.account; }
      } else {
        transactions.unshift({ id: Date.now(), date, time: fmtTime(new Date()), amount: amt, type: state.pendingTx.type, category: state.pendingTx.category, note, account: state.pendingTx.account });
      }
      transactions.sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time));
      LS.set('app_h_transactions', transactions);
      state.pendingTx = null; render(); toast('已保存'); return;
    }
    if (act === 'cancelTx') { state.pendingTx = null; render(); return; }
    
    if (act === 'moneySub') { state.moneySub = t.dataset.sub; render(); return; }
    if (act === 'lifeSub') { state.lifeSub = t.dataset.sub; render(); return; }
    if (act === 'careSub') { state.careSub = t.dataset.sub; render(); return; }

    // 护肤
    if (act === 'addSkincare') { openAddSkincareSheet(); return; }
    if (act === 'saveSkincare') { handleSaveSkincare(); return; }
    if (act === 'autoRecommend') { autoRecommend(t.dataset.phase); return; }
    if (act === 'delSkincare') {
      if(confirm('删除该产品?')) {
        skincareLib = skincareLib.filter(x => x.id !== t.dataset.id);
        saveSkincareLib(); render();
      }
      return;
    }

    // 运动
    if (act === 'startSport') { saveSportSession({ startTs: Date.now(), endTs: null }); render(); return; }
    if (act === 'endSport') { const s = getSportSessions()[todayStr()]; if(s){ s.endTs = Date.now(); saveSportSession(s); render(); } return; }

    // 其他
    if (act === 'toggleManual') { document.getElementById('textInputArea').style.display = 'block'; return; }
    if (act === 'parseManual') {
      const v = document.getElementById('manualTxInput').value;
      if(v) { state.pendingTx = parseTransactionText(v); state.pendingTx.date = todayStr(); render(); }
      return;
    }
    if (act === 'del-tx') {
      const id = Number(t.dataset.delTx);
      if(confirm('删除这笔记录？')) {
        transactions = transactions.filter(x => x.id !== id);
        LS.set('app_h_transactions', transactions); render();
      }
      return;
    }
  });

  document.getElementById('view').addEventListener('click', e => {
    const mic = e.target.closest('#micBtn');
    if(!mic) return;
    if(_voiceActive) { stopVoiceRecord(); }
    else { startVoiceRecord(); }
  });
};

function renderTabs() {
  const TABS = [
    { id:'home', icon:'🏠', label:'首页' },
    { id:'study', icon:'📚', label:'学习' },
    { id:'life', icon:'✨', label:'生活' },
    { id:'me', icon:'👤', label:'我的' }
  ];
  document.getElementById('tabbar').innerHTML = TABS.map(t => 
    `<button class="tab ${state.tab===t.id?'on':''}" data-tab="${t.id}"><span class="tab-icon">${t.icon}</span><span>${t.label}</span></button>`
  ).join('');
}

function render() {
  renderTabs();
  const view = document.getElementById('view');
  let html = '';
  if (state.tab === 'home') html = homeView();
  else if (state.tab === 'study') html = studyView();
  else if (state.tab === 'life') html = lifeView();
  else if (state.tab === 'me') html = meView();
  view.innerHTML = html;
}

function homeView() {
  const now = new Date();
  const dStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;
  return `<div class="home-head">
    <div class="left"><div class="title">今日</div><div class="suggest">记录每一天的成长</div></div>
    <div class="right"><div class="date">${dStr}</div></div>
  </div>
  <div class="stats" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat" data-act="tabHomeStudy"><div class="v" style="color:var(--brand)">0/10</div><div class="k">今日学习</div></div>
    <div class="stat"><div class="v" style="color:var(--accent)">—</div><div class="k">训练状态</div></div>
    <div class="stat"><div class="v" style="color:var(--hot)">¥0</div><div class="k">本月支出</div></div>
  </div>
  <div class="sec-title">时间线</div>
  <div class="home-tl-wrap">
    <div class="home-tl-item"><span class="check"></span><span class="home-tl-text"><span class="tm">07:00</span>起床</span></div>
    <div class="home-tl-item"><span class="check"></span><span class="home-tl-text"><span class="tm">12:00</span>午餐</span></div>
  </div>`;
}

function meView() {
  return `<div class="hero"><div class="hero-k">我的</div><h1>数据管理</h1></div>
  <div class="card"><button class="btn-primary" data-act="exportData">📤 导出 JSON 备份</button></div>
  <div class="card" style="border:1px solid #fee2e2;"><button class="btn" style="background:#fee2e2;color:#dc2626;width:100%;" onclick="localStorage.clear();location.reload()">🗑 清空数据</button></div>`;
}

// 语音占位符
let _voiceActive = false;
function startVoiceRecord() {
  _voiceActive = true;
  document.getElementById('micBtn').classList.add('listening');
  if(window.AndroidTTS) AndroidTTS.startRecognize(10);
}
function stopVoiceRecord() {
  _voiceActive = false;
  document.getElementById('micBtn').classList.remove('listening');
  if(window.AndroidTTS) AndroidTTS.stopRecognize();
}
window.onVoiceResult = function(text) {
  stopVoiceRecord();
  if(text) { state.pendingTx = parseTransactionText(text); state.pendingTx.date = todayStr(); render(); }
};
