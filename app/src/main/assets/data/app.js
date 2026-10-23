window.state = { tab:'home', studySub:'today', moneySub:'record', lifeSub:'money', careSub:'routine', pendingTx:null };

window.initApp = function() {
  // 修复历史数据里时间字段是 Excel 小数的情况
  try {
    let changed = false;
    transactions = transactions.map(t => {
      if (t && t.time != null && /^\d*\.?\d+$/.test(String(t.time))){
        const n = parseFloat(t.time);
        if (n >= 0 && n < 1){
          changed = true; return { ...t, time: normalizeTimeStr(t.time) };
        }
      }
      return t;
    });
    if (changed) LS.set('app_h_transactions', transactions);
  } catch(e){}

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

    if (act === 'closeSheet') { closeSheet(); return; }
    if (act === 'studySub') { state.studySub = t.dataset.sub; render(); return; }
    if (act === 'moneySub') { state.moneySub = t.dataset.sub; render(); return; }
    if (act === 'lifeSub') { state.lifeSub = t.dataset.sub; render(); return; }
    if (act === 'careSub') { state.careSub = t.dataset.sub; render(); return; }
    
    // 记账
    if (act === 'setTxType') {
      state.pendingTx.type = t.dataset.t;
      state.pendingTx.category = t.dataset.t === 'income' ? '其他收入' : '其他';
      renderTxEditor(); return;
    }
    if (act === 'setTxCat') { state.pendingTx.category = t.dataset.cat; renderTxEditor(); return; }
    if (act === 'setTxAccount') {
      state.pendingTx.account = t.dataset.acc; LS.set('app_h_lastAccount', t.dataset.acc);
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
    if (act === 'toggleManual') { document.getElementById('textInputArea').style.display = 'block'; return; }
    if (act === 'parseManual') {
      const v = document.getElementById('manualTxInput').value;
      if(v) { state.pendingTx = parseTransactionText(v); state.pendingTx.date = todayStr(); render(); }
      return;
    }
    if (act === 'cancelTx') { state.pendingTx = null; render(); return; }
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

    // 护肤
    if (act === 'addSkincare') { openAddSkincareSheet(); return; }
    if (act === 'saveSkincare') { handleSaveSkincare(); return; }
    if (act === 'autoRecommend') { autoRecommend(t.dataset.phase); return; }
    if (act === 'delSkincare') {
      if(confirm('删除该产品?')) { skincareLib = skincareLib.filter(x => x.id !== t.dataset.id); saveSkincareLib(); render(); }
      return;
    }
    // 运动
    if (act === 'startSport') { saveSportSession({ startTs: Date.now() }); render(); return; }
    if (act === 'endSport') { saveSportSession(null); render(); return; }
  });

  // 点击明细编辑/删除
  document.getElementById('view').addEventListener('click', e => {
    const del = e.target.closest('[data-del-tx]');
    if(del) {
      if(confirm('删除这笔?')) {
        transactions = transactions.filter(x => x.id !== Number(del.dataset.delTx));
        LS.set('app_h_transactions', transactions); render();
      }
      return;
    }
    const tx = e.target.closest('[data-tx-id]');
    if(tx) {
      const item = transactions.find(x => x.id === Number(tx.dataset.txId));
      if(item) {
        state.pendingTx = { ...item, editingId: item.id };
        state.moneySub = 'record'; render();
      }
    }
  });

  // 麦克风
  document.getElementById('view').addEventListener('click', e => {
    if(e.target.closest('#micBtn')) {
      if(_voiceActive) stopVoiceRecord(); else startVoiceRecord();
    }
  });
};

function renderTabs() {
  const TABS = [{ id:'home', icon:'🏠', label:'首页' },{ id:'study', icon:'📚', label:'学习' },{ id:'life', icon:'✨', label:'生活' },{ id:'me', icon:'👤', label:'我的' }];
  document.getElementById('tabbar').innerHTML = TABS.map(t => `<button class="tab ${state.tab===t.id?'on':''}" data-tab="${t.id}"><span class="tab-icon">${t.icon}</span><span>${t.label}</span></button>`).join('');
}

async function render() {
  renderTabs();
  const view = document.getElementById('view');
  let html = '';
  if (state.tab === 'home') {
    html = `<div class="home-head">
      <div class="left"><div class="title">今日</div></div>
      <div class="right"><div class="date">${todayStr()}</div></div>
    </div>
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="v" style="color:var(--brand)">0/10</div><div class="k">今日学习</div></div>
      <div class="stat"><div class="v" style="color:var(--accent)">—</div><div class="k">训练状态</div></div>
      <div class="stat"><div class="v" style="color:var(--hot)">¥0</div><div class="k">本月支出</div></div>
    </div>
    <div class="card"><div style="text-align:center;padding:30px;color:var(--sub)">首页完整信息展示区</div></div>`;
  }
  else if (state.tab === 'study') html = studyView();
  else if (state.tab === 'life') html = lifeView();
  else if (state.tab === 'me') html = meView();
  
  view.innerHTML = html;
}

function meView() {
  const lastTs = parseInt(LS.get('app_h_lastBackupAt', '0') || '0', 10);
  const days = lastTs ? Math.floor((Date.now() - lastTs) / 86400000) : 999;
  const banner = `<div class="card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #fbbf24;">
    <div style="font-size:13.5px;font-weight:750;color:#92400e;">已 ${days===999?'从未备份':days+'天没备份'}</div>
    <button class="btn-ghost-h" data-act="exportData" style="margin-top:10px;background:#fff;color:#92400e;">📤 立即导出备份</button>
  </div>`;
  return `<div class="hero"><div class="hero-k">我的</div><h1>数据管理</h1></div>
  ${banner}
  <div class="card"><button class="btn-primary" data-act="exportData">📤 导出完整 JSON</button></div>`;
}

// 语音控制
let _voiceActive = false;
function startVoiceRecord() {
  _voiceActive = true; document.getElementById('micBtn').classList.add('listening');
  if(window.AndroidTTS) AndroidTTS.startRecognize(10);
}
function stopVoiceRecord() {
  _voiceActive = false; document.getElementById('micBtn').classList.remove('listening');
  if(window.AndroidTTS) AndroidTTS.stopRecognize();
}
window.onVoiceResult = function(text) {
  stopVoiceRecord();
  if(text) { state.pendingTx = parseTransactionText(text); state.pendingTx.date = todayStr(); render(); }
};
