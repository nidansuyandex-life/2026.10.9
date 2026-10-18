// ================== 数据定义 ==================
window.EXPENSE_CATS = [
  ['餐饮', /(餐饮|早餐|午餐|晚餐|吃|饭|餐|咖啡|奶茶|外卖|水果|零食|饮料|买菜)/],
  ['交通', /(交通|打车|公交|地铁|加油|停车)/],
  ['购物', /(购物|超市|商场|买|衣服|鞋|包|网购)/],
  ['日用', /(日用|纸巾|洗发|沐浴|牙膏|清洁)/],
  ['娱乐', /(娱乐|电影|游戏|旅游)/],
  ['医疗', /(医疗|医院|药|挂号)/],
  ['居住', /(居住|房租|水费|电费|燃气)/],
  ['通讯', /(通讯|话费|流量|宽带)/],
  ['美容', /(美容|美发|美甲|理发|护肤)/],
  ['运动', /(运动|健身|游泳|瑜伽)/],
  ['人情', /(人情|礼物|份子|请客|随礼)/]
];
window.INCOME_CATS = [['工资', /(工资|薪水|月薪|发薪)/], ['奖金', /(奖金|绩效)/], ['报销', /(报销)/], ['退款', /(退款|退货)/], ['投资收益', /(利息|分红|收益)/], ['红包', /(红包|礼金)/], ['转账', /(转入|收款)/]];

window.ACCOUNTS_DEFAULT = ['现金', '微信', '支付宝', '银行卡', '其他'];
window.getAccounts = function(){ const v = LS.get('app_h_accounts', null); return (Array.isArray(v) && v.length) ? v : ACCOUNTS_DEFAULT; };
window.saveAccounts = function(a){ LS.set('app_h_accounts', a); };

window.getCatList = function(type){
  let base = (type === 'income' ? INCOME_CATS : EXPENSE_CATS).map(x => x[0]);
  base.push(type === 'income' ? '其他收入' : '其他');
  return base;
};

window.transactions = LS.get('app_h_transactions', []);

// ================== 核心解析 ==================
window.parseChineseAmount = function(text){
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

window.parseTransactionText = function(text){
  const t = String(text || '').trim();
  const amount = parseChineseAmount(t) || 0;
  let type = 'expense', category = '其他';
  for (const [cat, re] of EXPENSE_CATS) { if (re.test(t)) { category = cat; break; } }
  if (/收入|工资|收到/.test(t)) { type = 'income'; category = '其他收入'; }
  return { type, amount, category, note: t, account: LS.get('app_h_lastAccount', '现金') };
};

// ================== 渲染视图 ==================
window.moneySection = function(){
  const sub = state.moneySub || 'record';
  const subs = [{ id:'record', label:'帮我记' },{ id:'book', label:'账本' },{ id:'export', label:'导入/导出' }];
  let content = '';
  if (sub === 'record') content = moneyRecordPane();
  else if (sub === 'book') content = moneyBookPane();
  else content = moneyExportPane();
  return `<div class="subtabs" style="margin-top:4px;">${subs.map(s => `<button class="subtab ${s.id===sub?'on':''}" data-act="moneySub" data-sub="${s.id}">${s.label}</button>`).join('')}</div>${content}`;
};

function txHtml(arr){
  if(!arr.length) return '<p class="tip" style="color:#8A90A2">暂无记录</p>';
  const iconOf = c => c === '餐饮' ? '☕' : c === '交通' ? '🚕' : c === '购物' ? '🛒' : c === '工资' ? '💼' : '💳';
  return arr.map(t => {
    const timeStr = normalizeTimeStr(t.time);
    return `<div class="tx" data-tx-id="${t.id}">
      <div class="ic">${iconOf(t.category)}</div>
      <div class="body">
        <div class="h-t-name">${esc(t.note || t.category)}</div>
        <div class="muted" style="font-size:11.5px;">${t.date} ${timeStr} · ${t.account||'现金'} · ${t.category}</div>
      </div>
      <div class="amt ${t.type === 'income' ? 'inc' : ''}">${t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}</div>
      <button class="del-tx" data-del-tx="${t.id}">✕</button>
    </div>`;
  }).join('');
}

function moneyRecordPane(){
  return `<div class="card">
    <div class="mic-wrap">
      <button class="mic" id="micBtn">🎙️</button>
      <p class="mic-hint" id="micHint">点击麦克风语音输入（10秒）</p>
      <button class="btn-ghost-h" data-act="toggleManual" style="margin-top:12px;max-width:220px">⌨️ 手动输入</button>
      <div class="text-input-area" id="textInputArea" style="display:none;margin-top:10px;width:100%;">
        <input type="text" id="manualTxInput" placeholder="如：午餐 35 元 / 发工资 8000" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;margin-bottom:8px;">
        <button class="btn-ghost-h" data-act="parseManual" style="padding:11px">解析这笔</button>
      </div>
    </div>
    <div id="txEditArea"></div>
  </div>
  <div class="card"><div style="font-size:13px;font-weight:700;margin-bottom:8px;">今日明细</div>${txHtml(transactions.filter(t=>t.date===todayStr()))}</div>`;
}

function moneyBookPane(){
  const today = todayStr();
  const ym = today.slice(0, 7);
  const mExp = transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym)).reduce((s,t) => s + t.amount, 0);
  const mInc = transactions.filter(t => t.type === 'income' && t.date.startsWith(ym)).reduce((s,t) => s + t.amount, 0);
  
  return `<div class="balance" style="background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-radius:20px;padding:20px;margin-bottom:12px;">
    <div style="font-size:12px;opacity:.85;">本月支出</div>
    <div style="font-size:30px;font-weight:700;margin-top:8px;">¥ ${mExp.toFixed(2)}</div>
    <div style="display:flex;gap:26px;margin-top:16px;font-size:11.5px;"><span>收入 ¥ ${mInc.toFixed(2)}</span><span>结余 ¥ ${(mInc-mExp).toFixed(2)}</span></div>
  </div>
  <div class="card">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px;">最近记录 <span class="muted" style="font-size:11.5px">共 ${transactions.length} 笔</span></div>
    ${txHtml(transactions.slice(0, 50))}
  </div>`;
}

function moneyExportPane(){
  return `<div class="card">
    <div style="font-size:13px;font-weight:700;margin-bottom:10px;">导出数据</div>
    <button class="btn-primary" data-act="exportExcel" style="background:linear-gradient(135deg,#217346,#2ea85c)">📊 导出 Excel (.xls)</button>
    <button class="btn-ghost-h" data-act="exportCsv" style="margin-top:8px">📄 导出 CSV</button>
    <button class="btn-ghost-h" data-act="importTxCsv" style="margin-top:8px">📥 导入账单 (CSV/Excel)</button>
  </div>`;
}

// ================== 记账编辑区 ==================
window.renderTxEditor = function(){
  const p = state.pendingTx;
  const area = document.getElementById('txEditArea');
  if (!area) return;
  if (!p){ area.innerHTML = ''; return; }
  
  const cats = getCatList(p.type);
  const accounts = getAccounts();
  const curAcc = p.account || '现金';
  
  area.innerHTML = `<div class="tip-card" style="background:linear-gradient(135deg,#eef0ff,#f6f0ff);border-color:#e2e5ff;margin-top:14px;">
    <div style="font-size:12px;font-weight:700;color:var(--brand);margin-bottom:8px;">识别结果 · 请确认</div>
    <div style="font-size:14px;color:#2b3244;margin-bottom:10px;">"${esc(p.note||'')}"</div>
    
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
      <span class="cat-chip ${p.type==='expense'?'active':''}" data-act="setTxType" data-t="expense">支出</span>
      <span class="cat-chip ${p.type==='income'?'active':''}" data-act="setTxType" data-t="income">收入</span>
    </div>
    
    <div class="dim-row"><span class="lb">金额</span><input type="number" id="txAmount" value="${p.amount||0}" step="0.01" style="width:120px"></div>
    <div class="dim-row"><span class="lb">日期</span><input type="date" id="txDate" value="${p.date || todayStr()}" style="width:150px"></div>
    
    <div class="dim-row" style="flex-wrap:wrap;">
      <span class="lb" style="flex:none;width:56px;">账户</span>
      <div style="flex:1;display:flex;flex-wrap:wrap;gap:4px;">
        ${accounts.map(a => `<span class="cat-chip ${a===curAcc?'active':''}" data-act="setTxAccount" data-acc="${esc(a)}">${esc(a)}</span>`).join('')}
        <span class="cat-chip" data-act="addAccount" style="background:#EAF3FF;color:var(--blue);">＋</span>
      </div>
    </div>

    <div style="margin:10px 0;display:flex;flex-wrap:wrap;">${cats.map(c => `<span class="cat-chip ${c===p.category?'active':''}" data-act="setTxCat" data-cat="${esc(c)}">${esc(c)}</span>`).join('')}</div>
    
    <div class="dim-row">
      <span class="lb">备注</span>
      <input type="text" id="txNote" value="${esc(p.note||'')}" style="width:130px;text-align:left">
      <button style="border:0;background:#f3f4fa;width:36px;height:36px;border-radius:10px;font-size:15px;cursor:pointer;" data-act="speakNote">🔊</button>
    </div>
    
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn" style="flex:1;background:#f1f2f9;color:#4b5265;" data-act="cancelTx">取消</button>
      <button class="btn primary" style="flex:2;" data-act="confirmTx">✓ 确认</button>
    </div>
  </div>`;
};

// ================== 导入/导出逻辑 ==================
window.exportExcel = function(){
  if(!transactions.length) { toast('暂无数据'); return; }
  const escXml = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '<html><head><meta charset="UTF-8"></head><body><table border="1">';
  html += '<tr><th>日期</th><th>时间</th><th>金额</th><th>类型</th><th>账户</th><th>分类</th><th>备注</th></tr>';
  transactions.forEach(t => { html += `<tr><td>${escXml(t.date)}</td><td>${escXml(normalizeTimeStr(t.time))}</td><td>${t.amount}</td><td>${t.type==='income'?'收入':'支出'}</td><td>${escXml(t.account||'现金')}</td><td>${escXml(t.category)}</td><td>${escXml(t.note)}</td></tr>`; });
  html += '</table></body></html>';
  if(window.AndroidFile) AndroidFile.saveFile(html, `账单_${todayStr()}.xls`, 'application/vnd.ms-excel');
};

window.exportCsv = function(){
  if(!transactions.length) { toast('暂无数据'); return; }
  const rows = [['日期','时间','金额','类型','账户','分类','备注']];
  transactions.forEach(t => rows.push([t.date, t.time, t.amount, t.type==='income'?'收入':'支出', t.account||'现金', t.category, t.note]));
  const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  if(window.AndroidFile) AndroidFile.saveFile('\ufeff'+csv, `账单_${todayStr()}.csv`, 'text/csv');
};
