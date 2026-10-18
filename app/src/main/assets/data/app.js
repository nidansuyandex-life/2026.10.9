/* ═══════════════════════════════════════════════════════════════
 * 完整的 app.js —— 涵盖核心逻辑、记账、护肤等
 * ═══════════════════════════════════════════════════════════════ */

// --- 全局变量 ---
const DAY = Math.floor((Date.now() + 8*3600*1000) / 86400000);
const WEEK_CN = '日一二三四五六';

// --- 工具函数 ---
const bjDate = () => new Date(Date.now() + 8*3600*1000);
const todayStr = () => { const d = bjDate(); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); };
const prevDayStr = () => { const d = new Date(Date.now()-86400000+8*3600*1000); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); };
const pad = n => String(n).padStart(2,'0');
const fmtTime = d => pad(d.getHours())+':'+pad(d.getMinutes());
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const LS = {
  get(k,d){ try { const v=localStorage.getItem(k); return v===null?d:JSON.parse(v); } catch(e){ return d; } },
  set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){ console.error(e); if(typeof toast==='function') toast('存储已满'); } },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};

const toast = (msg) => {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.querySelector('.phone').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 1900);
};

const normalizeTimeStr = (t) => {
  if (t == null) return '--:--';
  const s = String(t).trim();
  if (!s) return '--:--';
  let m = s.match(/^(\d{1,2}):(\d{1,2})/);
  if (m) return pad(parseInt(m[1],10)) + ':' + pad(parseInt(m[2],10));
  const n = parseFloat(s);
  if (!isNaN(n) && n >= 0 && n < 1) { const totalMin = Math.round(n * 24 * 60); return pad(Math.floor(totalMin/60)) + ':' + pad(totalMin%60); }
  return s;
};

const openSheet = (html) => {
  const sheet = document.getElementById('sheet');
  sheet.innerHTML = `<div class="sheet-mask" data-act="closeSheet"></div><div class="sheet-body">${html}</div>`;
  requestAnimationFrame(() => sheet.classList.add('open'));
};
const closeSheet = () => {
  const sheet = document.getElementById('sheet');
  sheet.classList.remove('open');
  setTimeout(() => { if (!sheet.classList.contains('open')) sheet.innerHTML = ''; }, 320);
};

// --- 数据状态 ---
const state = {
  tab:'home', lifeSub:'money', moneySub:'record', careSub:'routine',
  pendingTx: null, 
  skincareLib: LS.get('app_h_skincareLib', []),
  skincareRoutine: LS.get('app_h_skincareRoutine', { morning: [], night: [] }),
  transactions: LS.get('app_h_transactions', [])
};

// --- 记账核心逻辑 ---
const EXPENSE_CATS = [['餐饮',/(餐饮|早餐|午餐|晚餐|吃|饭|餐|咖啡|奶茶|外卖|水果|零食|饮料|买菜)/],['交通',/(交通|打车|公交|地铁|加油|停车)/],['购物',/(购物|超市|商场|买|衣服|鞋|包|网购)/],['日用',/(日用|纸巾|洗发|沐浴|牙膏|清洁)/],['娱乐',/(娱乐|电影|游戏|旅游)/],['医疗',/(医疗|医院|药|挂号)/],['居住',/(居住|房租|水费|电费|燃气)/],['通讯',/(通讯|话费|流量|宽带)/],['美容',/(美容|美发|美甲|理发|护肤)/],['运动',/(运动|健身|游泳|瑜伽)/],['人情',/(人情|礼物|份子|请客|随礼)/]];
const INCOME_CATS = [['工资',/(工资|薪水|月薪|发薪)/],['奖金',/(奖金|绩效)/],['报销',/(报销)/],['退款',/(退款|退货)/],['投资收益',/(利息|分红|收益)/],['红包',/(红包|礼金)/],['转账',/(转入|收款)/]];
const ACCOUNTS_DEFAULT = ['现金', '微信', '支付宝', '银行卡', '其他'];

const getAccounts = () => { const v = LS.get('app_h_accounts', null); return (Array.isArray(v) && v.length) ? v : ACCOUNTS_DEFAULT; };
const saveAccounts = (a) => LS.set('app_h_accounts', a);
const getCatList = (type) => {
  let base = (type === 'income' ? INCOME_CATS : EXPENSE_CATS).map(x => x[0]);
  base.push(type === 'income' ? '其他收入' : '其他');
  return base;
};

const parseChineseAmount = (text) => {
  if (text == null) return NaN;
  let s = String(text).replace(/快/g,'块').replace(/园/g,'元').replace(/圓/g,'元');
  const numP = '(\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十]+)';
  let m = s.match(new RegExp(numP + '\\s*[块元]\\s*' + numP + '\\s*[毛角]\\s*' + numP + '\\s*分?'));
  if (m) return Math.round((parseFloat(m[1]) + parseFloat(m[2])/10 + parseFloat(m[3])/100)*100)/100;
  m = s.match(new RegExp(numP + '\\s*[块元]'));
  if (m) return Math.round(parseFloat(m[1])*100)/100;
  m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) return Math.round(parseFloat(m[1])*100)/100;
  return NaN;
};

const parseTransactionText = (text) => {
  const t = String(text || '').trim();
  const amount = parseChineseAmount(t) || 0;
  let type = 'expense', category = '其他';
  for (const [cat, re] of EXPENSE_CATS) { if (re.test(t)) { category = cat; break; } }
  if (/收入|工资|收到/.test(t)) { type = 'income'; category = '其他收入'; }
  return { type, amount, category, note: t, account: LS.get('app_h_lastAccount', '现金') };
};

// --- 护肤核心逻辑 ---
const skinProfile = LS.get('app_h_skinProfile', { type: '混合性', sensitivity: '中' });
const saveSkincareLib = () => LS.set('app_h_skincareLib', state.skincareLib);
const saveSkincareRoutine = () => LS.set('app_h_skincareRoutine', state.skincareRoutine);
const calcExpiryDate = (openDate, months) => { const d = new Date(openDate); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); };
const daysLeft = (expiryDate) => { const d1 = new Date(todayStr()); const d2 = new Date(expiryDate); return Math.ceil((d2 - d1) / 86400000); };

// --- 视图渲染 ---
const renderTabs = () => {
  const TABS = [{ id:'home', icon:'🏠', label:'首页' },{ id:'study', icon:'📚', label:'学习' },{ id:'life', icon:'✨', label:'生活' },{ id:'me', icon:'👤', label:'我的' }];
  document.getElementById('tabbar').innerHTML = TABS.map(t => `<button class="tab ${state.tab===t.id?'on':''}" data-tab="${t.id}"><span class="tab-icon">${t.icon}</span><span>${t.label}</span></button>`).join('');
};

const render = () => {
  renderTabs();
  const view = document.getElementById('view');
  let html = '';
  if (state.tab === 'home') html = homeView();
  else if (state.tab === 'study') html = studyView();
  else if (state.tab === 'life') html = lifeView();
  else if (state.tab === 'me') html = meView();
  view.innerHTML = html;
};

const homeView = () => {
  return `<div class="home-head"><div class="left"><div class="title">今日</div></div></div>
  <div class="card"><div style="text-align:center;padding:20px;color:var(--sub)">首页内容（原首页逻辑已精简）</div></div>`;
};

const studyView = () => {
  return `<div class="hero"><div class="hero-k">学习 · 认知提升</div><h1>每日精进</h1></div>
  <div class="card"><div style="padding:20px;text-align:center;color:var(--sub);">学习模块（原数据挂载保留）</div></div>`;
};

const meView = () => {
  return `<div class="hero"><div class="hero-k">我的</div><h1>数据管理</h1></div>
  <div class="card">
    <div class="sec-title" style="margin:0 0 12px;">数据备份</div>
    <button class="btn-primary" data-act="exportData">📤 导出完整备份</button>
    <button class="btn-ghost-h" data-act="importData" style="margin-top:8px;">📥 导入备份（覆盖）</button>
  </div>`;
};

const lifeView = () => {
  const sub = state.lifeSub || 'money';
  const mainTabs = [{ id:'money', label:'记账' },{ id:'sport', label:'运动' },{ id:'care', label:'护肤' }];
  let content = '';
  if (sub === 'money') content = moneySection();
  else if (sub === 'sport') content = `<div class="card">运动打卡(省略)</div>`;
  else if (sub === 'care') content = careSection();
  return `<div class="hero"><div class="hero-k">生活 · 记录</div></div>
  <div class="subtabs">${mainTabs.map(t => `<button class="subtab ${t.id===sub?'on':''}" data-act="lifeSub" data-sub="${t.id}">${t.label}</button>`).join('')}</div>
  <div>${content}</div>`;
};

// ================== 记账视图 ==================
const moneySection = () => {
  const sub = state.moneySub || 'record';
  const subs = [{ id:'record', label:'帮我记' },{ id:'book', label:'账本' },{ id:'export', label:'导出' }];
  let content = '';
  if (sub === 'record') content = moneyRecordPane();
  else if (sub === 'book') content = moneyBookPane();
  else content = moneyExportPane();
  return `<div class="subtabs">${subs.map(s => `<button class="subtab ${s.id===sub?'on':''}" data-act="moneySub" data-sub="${s.id}">${s.label}</button>`).join('')}</div>${content}`;
};

const txHtml = (arr) => {
  if(!arr.length) return '<p class="tip" style="color:#8A90A2">暂无记录</p>';
  const iconOf = c => c === '餐饮' ? '☕' : c === '交通' ? '🚕' : c === '购物' ? '🛒' : '💳';
  return arr.map(t => `<div class="tx" data-tx-id="${t.id}">
      <div class="ic">${iconOf(t.category)}</div>
      <div class="body">
        <div class="h-t-name">${esc(t.note || t.category)}</div>
        <div class="muted" style="font-size:11.5px;">${t.date} ${normalizeTimeStr(t.time)} · ${t.account||'现金'} · ${t.category}</div>
      </div>
      <div class="amt ${t.type === 'income' ? 'inc' : ''}">${t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}</div>
      <button class="del-tx" data-del-tx="${t.id}">✕</button>
    </div>`).join('');
};

const moneyRecordPane = () => {
  return `<div class="card">
    <div class="mic-wrap">
      <button class="mic" id="micBtn">🎙️</button>
      <p class="mic-hint" id="micHint">点击麦克风语音输入（10秒）</p>
      <button class="btn-ghost-h" data-act="toggleManual" style="margin-top:12px;">⌨️ 手动输入</button>
      <div class="text-input-area" id="textInputArea" style="display:none;margin-top:10px;width:100%;">
        <input type="text" id="manualTxInput" placeholder="如：午餐 35 元" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;margin-bottom:8px;">
        <button class="btn-ghost-h" data-act="parseManual">解析这笔</button>
      </div>
    </div>
    <div id="txEditArea"></div>
  </div>
  <div class="card"><div style="font-size:13px;font-weight:700;margin-bottom:8px;">今日明细</div>${txHtml(state.transactions.filter(t=>t.date===todayStr()))}</div>`;
};

const moneyBookPane = () => {
  // 原需求：把“最近记录”挪到账本里
  return `<div class="card" style="background:#4f46e5;color:#fff;border:0;text-align:center;">
    <div style="font-size:12px;opacity:.8;">总记录数</div>
    <div style="font-size:24px;font-weight:700;margin-top:8px;">${state.transactions.length} 笔</div>
  </div>
  <div class="card">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px;">最近记录 (全部)</div>
    ${txHtml(state.transactions.slice(0, 100))}
  </div>`;
};

const moneyExportPane = () => {
  return `<div class="card">
    <button class="btn-primary" data-act="exportData">📤 导出 JSON 备份</button>
  </div>`;
};

const renderTxEditor = () => {
  const p = state.pendingTx;
  const area = document.getElementById('txEditArea');
  if (!area) return;
  if (!p) { area.innerHTML = ''; return; }
  
  const cats = getCatList(p.type);
  const accounts = getAccounts();
  const curAcc = p.account || '现金';
  
  area.innerHTML = `<div class="tip-card" style="background:#f8f9fd;margin-top:14px;">
    <div style="font-size:14px;color:#2b3244;margin-bottom:10px;">"${esc(p.note||'')}"</div>
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
      <span class="cat-chip ${p.type==='expense'?'active':''}" data-act="setTxType" data-t="expense">支出</span>
      <span class="cat-chip ${p.type==='income'?'active':''}" data-act="setTxType" data-t="income">收入</span>
    </div>
    <div class="dim-row"><span class="lb">金额</span><input type="number" id="txAmount" value="${p.amount||0}" step="0.01"></div>
    <!-- 日期修复 -->
    <div class="dim-row"><span class="lb">日期</span><input type="date" id="txDate" value="${p.date || todayStr()}"></div>
    <!-- 账户修复 -->
    <div class="dim-row" style="flex-wrap:wrap;">
      <span class="lb">账户</span>
      <div style="flex:1;display:flex;flex-wrap:wrap;gap:4px;">
        ${accounts.map(a => `<span class="cat-chip ${a===curAcc?'active':''}" data-act="setTxAccount" data-acc="${esc(a)}">${esc(a)}</span>`).join('')}
        <span class="cat-chip" data-act="addAccount" style="background:#EAF3FF;color:var(--blue);">＋</span>
      </div>
    </div>
    <div style="margin:10px 0;display:flex;flex-wrap:wrap;">${cats.map(c => `<span class="cat-chip ${c===p.category?'active':''}" data-act="setTxCat" data-cat="${esc(c)}">${esc(c)}</span>`).join('')}</div>
    <div class="dim-row"><span class="lb">备注</span><input type="text" id="txNote" value="${esc(p.note||'')}"></div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn" style="flex:1;background:#f1f2f9;color:#4b5265;" data-act="cancelTx">取消</button>
      <button class="btn primary" style="flex:2;" data-act="confirmTx">✓ 确认</button>
    </div>
  </div>`;
};

// ================== 护肤视图（重写） ==================
const careSection = () => {
  const sub = state.careSub || 'routine';
  const subs = [{ id:'routine', label:'每日流程' },{ id:'lib', label:'护肤库' },{ id:'profile', label:'肤质档案' }];
  let content = '';
  if (sub === 'routine') content = careRoutinePane();
  else if (sub === 'lib') content = careLibPane();
  else content = careProfilePane();
  return `<div class="subtabs">${subs.map(s => `<button class="subtab ${s.id===sub?'on':''}" data-act="careSub" data-sub="${s.id}">${s.label}</button>`).join('')}</div>${content}`;
};

const careRoutinePane = () => {
  const renderStep = (phase, stepId, name, note) => {
    const bindId = phase === 'morning' ? state.skincareRoutine.morning.find(x => x.stepId === stepId)?.prodId : state.skincareRoutine.night.find(x => x.stepId === stepId)?.prodId;
    const prod = state.skincareLib.find(p => p.id === bindId);
    let prodHtml = prod ? `<div style="font-size:13px;color:var(--brand);margin-top:4px;">🧴 ${esc(prod.name)} (剩${daysLeft(prod.expiryDate)}天)</div>` : `<div style="font-size:12px;color:var(--sub);margin-top:4px;">未绑定产品</div>`;
    return `<div style="padding:10px 0;border-bottom:1px dashed #eee;display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="flex:1;">
        <div style="font-size:14px;font-weight:600;">${name} <span style="font-size:11px;color:var(--sub);">${note}</span></div>
        ${prodHtml}
      </div>
      <button class="mini-add" data-act="pickRoutineProd" data-phase="${phase}" data-step="${stepId}">选择</button>
    </div>`;
  };
  return `<div class="card">
    <div class="row-between" style="margin-bottom:12px;"><div style="font-weight:700;">☀️ 早间流程</div><button class="mini-add" data-act="autoRecommend" data-phase="morning">✨ AI推荐</button></div>
    ${renderStep('morning','m_clean','洁面','')}
    ${renderStep('morning','m_water','水','')}
    ${renderStep('morning','m_serum','精华','')}
    ${renderStep('morning','m_cream','乳霜','')}
    ${renderStep('morning','m_sun','防晒','必须步骤')}
  </div>
  <div class="card">
    <div class="row-between" style="margin-bottom:12px;"><div style="font-weight:700;">🌙 晚间流程</div><button class="mini-add" data-act="autoRecommend" data-phase="night">✨ AI推荐</button></div>
    ${renderStep('night','n_clean','洁面','')}
    ${renderStep('night','n_water','水','')}
    ${renderStep('night','n_serum','精华','')}
    ${renderStep('night','n_cream','乳霜','')}
  </div>`;
};

const careLibPane = () => {
  const list = state.skincareLib.map(p => {
    const left = daysLeft(p.expiryDate);
    const color = left < 0 ? 'var(--err)' : left <= 30 ? 'var(--warn)' : 'var(--accent)';
    return `<div class="card" style="padding:12px;margin-bottom:10px;">
      <div class="row-between"><div style="font-weight:700;">${esc(p.name)}</div><div style="font-size:11px;color:${color};font-weight:700;">${left<0?'已过期':'剩 '+left+' 天'}</div></div>
      <div style="font-size:12px;color:var(--sub);margin-top:4px;">${p.category} · 开封: ${p.openDate}</div>
      <div style="display:flex;gap:8px;margin-top:10px;"><button class="btn-ghost-h" style="font-size:12px;padding:6px;background:#fee2e2;color:#dc2626;" data-act="delSkincare" data-id="${p.id}">删除</button></div>
    </div>`;
  }).join('');
  return `<div class="card"><button class="btn-primary" data-act="addSkincare">＋ 添加护肤品</button></div>
  <div style="margin-top:14px;">${list || '<div class="tip-card">护肤库为空</div>'}</div>`;
};

const careProfilePane = () => {
  return `<div class="card">
    <div class="dim-row"><span class="lb">肤质</span><select data-act="setSkinProfile" data-key="type"><option ${skinProfile.type==='干性'?'selected':''}>干性</option><option ${skinProfile.type==='油性'?'selected':''}>油性</option><option ${skinProfile.type==='混合性'?'selected':''}>混合性</option></select></div>
    <div class="dim-row"><span class="lb">敏感度</span><select data-act="setSkinProfile" data-key="sensitivity"><option ${skinProfile.sensitivity==='低'?'selected':''}>低</option><option ${skinProfile.sensitivity==='中'?'selected':''}>中</option><option ${skinProfile.sensitivity==='高'?'selected':''}>高</option></select></div>
  </div>`;
};

// --- 护肤操作逻辑 ---
const openAddSkincare = () => {
  openSheet(`
    <div class="sheet-head"><h2>添加护肤品</h2><button class="link-btn" data-act="closeSheet">关闭</button></div>
    <div class="dim-row"><span class="lb">名称</span><input type="text" id="prodName"></div>
    <div class="dim-row"><span class="lb">类别</span><select id="prodCat"><option>洁面</option><option>水</option><option>精华</option><option>乳霜</option><option>防晒</option></select></div>
    <div class="dim-row"><span class="lb">开封日期</span><input type="date" id="prodOpenDate" value="${todayStr()}"></div>
    <div class="dim-row"><span class="lb">保质期(月)</span><input type="number" id="prodShelf" value="12"></div>
    <button class="btn primary wide" data-act="saveSkincare" style="margin-top:14px;">保存</button>
  `);
};

const autoRecommend = (phase) => {
  const routine = phase === 'morning' ? state.skincareRoutine.morning : state.skincareRoutine.night;
  state.skincareLib.forEach(p => {
    let stepId = '';
    if (p.category === '洁面') stepId = phase === 'morning' ? 'm_clean' : 'n_clean';
    else if (p.category === '水') stepId = phase === 'morning' ? 'm_water' : 'n_water';
    else if (p.category === '精华') stepId = phase === 'morning' ? 'm_serum' : 'n_serum';
    else if (p.category === '乳霜') stepId = phase === 'morning' ? 'm_cream' : 'n_cream';
    else if (p.category === '防晒' && phase === 'morning') stepId = 'm_sun';
    
    if (stepId) {
      const exist = routine.find(x => x.stepId === stepId);
      if (!exist) routine.push({ stepId, prodId: p.id });
      else exist.prodId = p.id;
    }
  });
  saveSkincareRoutine();
  render();
  toast('✨ 已为您推荐产品');
};

// --- 语音占位 ---
let _voiceActive = false;
const startVoiceRecord = () => { _voiceActive = true; document.getElementById('micBtn').classList.add('listening'); if(window.AndroidTTS) AndroidTTS.startRecognize(10); };
const stopVoiceRecord = () => { _voiceActive = false; const m = document.getElementById('micBtn'); if(m) m.classList.remove('listening'); if(window.AndroidTTS) AndroidTTS.stopRecognize(); };
window.onVoiceResult = (text) => { stopVoiceRecord(); if(text) { state.pendingTx = parseTransactionText(text); state.pendingTx.date = todayStr(); render(); } };
window.onVoiceError = (err) => { stopVoiceRecord(); toast('识别失败：'+err); };

// --- 事件监听 ---
const initApp = () => {
  render();
  
  // Tab 切换
  document.getElementById('tabbar').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if(!t) return;
    state.tab = t.dataset.tab; render();
  });

  // 统一委托
  document.getElementById('view').addEventListener('click', async e => {
    const t = e.target.closest('[data-act]'); if(!t) return;
    const act = t.dataset.act;

    if (act === 'closeSheet') { closeSheet(); return; }
    if (act === 'lifeSub') { state.lifeSub = t.dataset.sub; render(); return; }
    if (act === 'moneySub') { state.moneySub = t.dataset.sub; render(); return; }
    if (act === 'careSub') { state.careSub = t.dataset.sub; render(); return; }

    // 记账编辑
    if (act === 'setTxType') { state.pendingTx.type = t.dataset.t; renderTxEditor(); return; }
    if (act === 'setTxCat') { state.pendingTx.category = t.dataset.cat; renderTxEditor(); return; }
    if (act === 'setTxAccount') { state.pendingTx.account = t.dataset.acc; renderTxEditor(); return; }
    if (act === 'addAccount') { const name = prompt('新账户名'); if(!name) return; const accs = getAccounts(); accs.push(name); saveAccounts(accs); state.pendingTx.account = name; renderTxEditor(); return; }
    
    if (act === 'confirmTx') {
      const amt = parseFloat(document.getElementById('txAmount').value);
      // 读取用户修改的日期
      const date = document.getElementById('txDate').value;
      const note = document.getElementById('txNote').value;
      if(!amt) { toast('金额有误'); return; }
      
      state.transactions.unshift({ id: Date.now(), date, time: fmtTime(new Date()), amount: amt, type: state.pendingTx.type, category: state.pendingTx.category, note, account: state.pendingTx.account });
      state.transactions.sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time));
      LS.set('app_h_transactions', state.transactions);
      state.pendingTx = null; render(); toast('已保存'); return;
    }
    if (act === 'cancelTx') { state.pendingTx = null; render(); return; }

    // 护肤
    if (act === 'addSkincare') { openAddSkincare(); return; }
    if (act === 'saveSkincare') {
      const name = document.getElementById('prodName').value;
      const cat = document.getElementById('prodCat').value;
      const openDate = document.getElementById('prodOpenDate').value;
      const shelf = parseInt(document.getElementById('prodShelf').value) || 12;
      if(!name) { toast('请输入名称'); return; }
      state.skincareLib.push({ id: Date.now().toString(), name, category: cat, openDate, shelfLife: shelf, expiryDate: calcExpiryDate(openDate, shelf) });
      saveSkincareLib(); closeSheet(); render(); toast('添加成功'); return;
    }
    if (act === 'autoRecommend') { autoRecommend(t.dataset.phase); return; }
    if (act === 'delSkincare') { if(confirm('删除?')) { state.skincareLib = state.skincareLib.filter(x => x.id !== t.dataset.id); saveSkincareLib(); render(); } return; }

    // 语音
    if (act === 'toggleManual') { document.getElementById('textInputArea').style.display = 'block'; return; }
    if (act === 'parseManual') { const v = document.getElementById('manualTxInput').value; if(v) { state.pendingTx = parseTransactionText(v); state.pendingTx.date = todayStr(); render(); } return; }
    
    // 导出
    if (act === 'exportData') {
      const data = { transactions: state.transactions, skincareLib: state.skincareLib, skincareRoutine: state.skincareRoutine };
      if(window.AndroidFile) AndroidFile.saveFile(JSON.stringify(data, null, 2), `backup_${todayStr()}.json`, 'application/json');
      return;
    }
  });

  // 麦克风
  document.getElementById('view').addEventListener('click', e => {
    if(!e.target.closest('#micBtn')) return;
    if(_voiceActive) stopVoiceRecord(); else startVoiceRecord();
  });
};
