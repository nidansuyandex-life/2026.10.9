/* ═══════════════════════════════════════════════════════════════
 * enhance.js v3 —— 日常·健康生活 全部增强
 * 需要在 index.html 的 <head> 里引用：<script src="./data/enhance.js" defer></script>
 * ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  function ready(){
    try {
      return typeof LS !== 'undefined' &&
             typeof state !== 'undefined' &&
             typeof render === 'function' &&
             typeof todayStr === 'function' &&
             typeof prevDayStr === 'function';
    } catch(e){ return false; }
  }
  function waitReady(cb, tries, interval){
    tries = tries || 200; interval = interval || 50;
    if (ready()){ cb(); return; }
    if (tries <= 0){ console.warn('[enhance] 主脚本超时'); return; }
    setTimeout(() => waitReady(cb, tries-1, interval), interval);
  }
  waitReady(bootstrap);

  function bootstrap(){
    console.log('[enhance] v3 激活');
    const _pad = n => String(n).padStart(2, '0');

    // ───────────────────────────────────────────────
    // 工具
    // ───────────────────────────────────────────────
    function normalizeTimeStr(t){
      if (t == null) return '--:--';
      const s = String(t).trim();
      if (!s) return '--:--';
      let m = s.match(/^(\d{1,2}):(\d{1,2})/);
      if (m) return _pad(parseInt(m[1],10)) + ':' + _pad(parseInt(m[2],10));
      const n = parseFloat(s);
      if (!isNaN(n) && n >= 0 && n < 1){
        const totalMin = Math.round(n * 24 * 60);
        return _pad(Math.floor(totalMin/60)) + ':' + _pad(totalMin % 60);
      }
      return s;
    }
    window.normalizeTimeStr = normalizeTimeStr;

    function storageSize(){
      let total = 0;
      try {
        Object.keys(localStorage).forEach(k => {
          const v = localStorage.getItem(k);
          if (v != null) total += k.length + v.length;
        });
      } catch(e){}
      return total;
    }

    // ───────────────────────────────────────────────
    // ① localStorage.setItem 配额检测
    // ───────────────────────────────────────────────
    const _origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k, v){
      try { _origSetItem(k, v); }
      catch(e){
        const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 ||
                              /quota/i.test(e.message || ''));
        if (isQuota){
          setTimeout(() => {
            try { toast('⚠️ 存储已满，请到「我的」导出备份后清理'); } catch(_){}
          }, 50);
        }
      }
    };

    // ───────────────────────────────────────────────
    // ② 修复历史时间小数
    // ───────────────────────────────────────────────
    (function fixHist(){
      try {
        const all = LS.get('app_h_transactions', []);
        if (!Array.isArray(all)) return;
        let changed = false;
        const fixed = all.map(t => {
          if (t && t.time != null){
            const raw = String(t.time).trim();
            if (/^\d*\.?\d+$/.test(raw)){
              const n = parseFloat(raw);
              if (!isNaN(n) && n >= 0 && n < 1){
                const f = normalizeTimeStr(raw);
                if (f !== raw){ changed = true; return { ...t, time: f }; }
              }
            }
          }
          return t;
        });
        if (changed){
          LS.set('app_h_transactions', fixed);
          setTimeout(() => { try { render({keepScroll:true}); } catch(e){} }, 200);
        }
      } catch(e){}
    })();

    // ───────────────────────────────────────────────
    // ③ 账户
    // ───────────────────────────────────────────────
    const ACC_DEFAULT = ['现金','微信','支付宝','银行卡','其他'];
    function getAccountsList(){
      const v = LS.get('app_h_accounts', null);
      return Array.isArray(v) && v.length ? v : ACC_DEFAULT.slice();
    }
    window.enhanceGetAccounts = getAccountsList;

    // ───────────────────────────────────────────────
    // ④ parseTransactionText 覆写 —— 加账户识别
    // ───────────────────────────────────────────────
    (function overrideParse(){
      const _orig = (typeof parseTransactionText === 'function')
        ? parseTransactionText : null;
      if (!_orig) return;

      function enhanced(text){
        const t = String(text || '').trim();
        const r = _orig(t);
        const ACC = [
          { re: /微信|weixin/i,                     acc: '微信' },
          { re: /支付宝|zfb|alipay/i,               acc: '支付宝' },
          { re: /花呗/i,                            acc: '花呗' },
          { re: /白条|京东白条/i,                   acc: '京东白条' },
          { re: /现金|现钞/i,                       acc: '现金' },
          { re: /银行卡|刷卡|银联|工行|建行|农行|招行|中行|交行/i, acc: '银行卡' }
        ];
        for (const k of ACC){
          if (k.re.test(t)){
            r.account = k.acc;
            try {
              const list = getAccountsList();
              if (!list.includes(k.acc)){
                list.push(k.acc);
                LS.set('app_h_accounts', list);
              }
            } catch(e){}
            break;
          }
        }
        if (!r.account) r.account = LS.get('app_h_lastAccount', '现金');
        return r;
      }
      try { eval('parseTransactionText = enhanced;'); } catch(e){}
      window.parseTransactionText = enhanced;
    })();

    // ───────────────────────────────────────────────
    // ⑤ 覆写 moneyRecordPane —— 去掉"最近记录"
    // ───────────────────────────────────────────────
    function iconOf(c){
      return c === '餐饮' ? '☕' : c === '交通' ? '🚕' : c === '购物' ? '🛒' :
             c === '工资' ? '💼' : c === '穿着' ? '👕' : '💳';
    }
    function buildTxHtml(arr){
      const today = todayStr(), yest = prevDayStr();
      if (!arr.length) return '<p class="tip" style="color:#8A90A2">暂无记录</p>';
      return arr.map(t => {
        let dateLabel = t.date || '';
        if (dateLabel === today) dateLabel = '今天';
        else if (dateLabel === yest) dateLabel = '昨天';
        const timeStr = normalizeTimeStr(t.time);
        const acc = t.account || '现金';
        return `<div class="tx" data-tx-id="${t.id}">
          <div class="ic">${iconOf(t.category)}</div>
          <div class="body">
            <div class="h-t-name">${esc(t.note || t.category)}</div>
            <div class="muted" style="font-size:11.5px;color:var(--sub)">${esc(dateLabel)} ${esc(timeStr)} · ${t.type === 'income' ? '收入' : '支出'} · ${esc(t.category)} · ${esc(acc)}</div>
          </div>
          <div class="amt ${t.type === 'income' ? 'inc' : ''}">${t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}</div>
          <button class="del-tx" data-del-tx="${t.id}">✕</button>
        </div>`;
      }).join('');
    }

    window.moneyRecordPane = function(){
      const today = todayStr();
      const todayTx = transactions.filter(t => t.date === today);
      return `<div class="card">
        <div class="mic-wrap">
          <button class="mic" id="micBtn">🎙️</button>
          <p class="mic-hint" id="micHint">点击麦克风开始语音输入（10 秒）</p>
          <button class="btn-ghost-h" data-act="toggleManual" style="margin-top:12px;max-width:220px">⌨️ 手动输入文字</button>
          <div class="text-input-area" id="textInputArea">
            <input type="text" id="manualTxInput" placeholder="如：午餐 35 元 / 发工资 8000">
            <button class="btn-ghost-h" data-act="parseManual" style="padding:11px">解析这笔</button>
          </div>
        </div>
        <div id="txEditArea"></div>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">今日明细 <span class="muted" style="color:var(--sub);font-size:11.5px">点条目可编辑</span></div>
        ${buildTxHtml(todayTx)}
      </div>`;
    };

    // ───────────────────────────────────────────────
    // ⑥ 覆写 moneyBookPane —— 把最近记录挪到这里
    // ───────────────────────────────────────────────
    window.moneyBookPane = function(){
      const today = todayStr();
      const ym = today.slice(0, 7);
      const monthExpense = transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym)).reduce((s,t) => s + t.amount, 0);
      const monthIncome  = transactions.filter(t => t.type === 'income'  && t.date.startsWith(ym)).reduce((s,t) => s + t.amount, 0);
      const cats = {};
      transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym)).forEach(t => {
        cats[t.category] = (cats[t.category] || 0) + t.amount;
      });
      const total = Object.values(cats).reduce((s,v) => s + v, 0) || 1;
      const catHtml = Object.entries(cats).length
        ? Object.entries(cats).sort((a,b) => b[1]-a[1]).map(([k,v]) =>
            `<div class="progress"><div class="bar" style="width:${(v/total*100).toFixed(0)}%"></div></div>
             <div class="row-between" style="margin-bottom:10px">
               <span class="muted" style="font-size:12px;color:var(--sub)">${esc(k)}</span>
               <span class="muted" style="font-size:12px;color:var(--sub)">${(v/total*100).toFixed(0)}%</span>
             </div>`).join('')
        : '<p class="tip" style="color:#8A90A2">本月暂无支出</p>';
      return `<div class="balance">
          <div class="lab">本月支出</div>
          <div class="big">¥ ${monthExpense.toFixed(2)}</div>
          <div class="foot"><span>收入 ¥ ${monthIncome.toFixed(2)}</span><span>结余 ¥ ${(monthIncome - monthExpense).toFixed(2)}</span></div>
        </div>
        <div class="card">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">分类占比</div>
          ${catHtml}
        </div>
        <div class="card">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">最近记录 <span class="muted" style="color:var(--sub);font-size:11.5px">共 ${transactions.length} 笔，最多显示 50</span></div>
          ${buildTxHtml(transactions.slice(0, 50))}
        </div>`;
    };

    // ───────────────────────────────────────────────
    // ⑦ 增强 txEditArea —— 日期、账户、备注喇叭
    // ───────────────────────────────────────────────
    function enhanceTxEditArea(){
      const area = document.getElementById('txEditArea');
      if (!area) return;
      const p = state.pendingTx;
      if (!p) return;

      // 日期
      if (!document.getElementById('txDate')){
        const amountInput = area.querySelector('input#txAmount');
        if (amountInput){
          const row = amountInput.closest('.dim-row');
          const dateRow = document.createElement('div');
          dateRow.className = 'dim-row';
          dateRow.innerHTML = `<span class="lb">日期</span><input type="date" id="txDate" value="${p.date || todayStr()}" style="width:150px">`;
          row.parentNode.insertBefore(dateRow, row.nextSibling);
        }
      }

      // 账户
      if (!area.querySelector('[data-enh-account-row]')){
        const noteInput = area.querySelector('input#txNote');
        const noteRow = noteInput ? noteInput.closest('.dim-row') : null;
        if (noteRow){
          const accounts = getAccountsList();
          const cur = p.account || LS.get('app_h_lastAccount', '现金');
          const row = document.createElement('div');
          row.className = 'dim-row';
          row.setAttribute('data-enh-account-row', '1');
          row.style.cssText = 'flex-wrap:wrap;align-items:flex-start;';
          row.innerHTML = `
            <span class="lb" style="flex:none;width:56px;">账户</span>
            <div style="flex:1;display:flex;flex-wrap:wrap;gap:4px;">
              ${accounts.map(a => `<span class="cat-chip ${a===cur?'active':''}" data-enh-account="${esc(a)}">${esc(a)}</span>`).join('')}
              <span class="cat-chip" data-enh-add-account style="background:#EAF3FF;color:var(--blue);">＋</span>
            </div>`;
          noteRow.parentNode.insertBefore(row, noteRow);
        }
      }

      // 备注喇叭
      const noteInput = area.querySelector('input#txNote');
      if (noteInput && !noteInput.parentNode.querySelector('[data-enh-speak-note]')){
        const btn = document.createElement('button');
        btn.setAttribute('data-enh-speak-note', '1');
        btn.style.cssText = 'border:0;background:#f3f4fa;width:36px;height:36px;border-radius:10px;font-size:15px;cursor:pointer;flex:none;margin-left:6px;';
        btn.textContent = '🔊';
        btn.title = '朗读备注';
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const v = noteInput.value.trim();
          if (!v){ toast('没有可朗读的内容'); return; }
          toggleSpeak(v, 'zh-CN', btn);
        });
        noteInput.parentNode.appendChild(btn);
        noteInput.style.width = '140px';
      }

      // 账户 chip 绑定
      area.querySelectorAll('[data-enh-account]').forEach(chip => {
        if (chip.dataset.enhBound) return;
        chip.dataset.enhBound = '1';
        chip.addEventListener('click', e => {
          e.stopPropagation();
          const acc = chip.dataset.enhAccount;
          if (state.pendingTx){
            state.pendingTx.account = acc;
            LS.set('app_h_lastAccount', acc);
            area.querySelectorAll('[data-enh-account]').forEach(c => {
              c.classList.toggle('active', c.dataset.enhAccount === acc);
            });
          }
        });
      });

      const addBtn = area.querySelector('[data-enh-add-account]');
      if (addBtn && !addBtn.dataset.enhBound){
        addBtn.dataset.enhBound = '1';
        addBtn.addEventListener('click', e => {
          e.stopPropagation();
          const name = (prompt('新账户名称（如：招行卡、京东白条、花呗）') || '').trim();
          if (!name) return;
          if (name.length > 10){ toast('账户名太长'); return; }
          const list = getAccountsList();
          if (list.includes(name)){ toast('该账户已存在'); return; }
          list.push(name);
          LS.set('app_h_accounts', list);
          if (state.pendingTx) state.pendingTx.account = name;
          LS.set('app_h_lastAccount', name);
          const row = area.querySelector('[data-enh-account-row]');
          if (row) row.remove();
          enhanceTxEditArea();
          toast('已添加账户：' + name);
        });
      }
    }

    // ───────────────────────────────────────────────
    // ⑧ confirmTx 拦截
    // ───────────────────────────────────────────────
    function handleConfirmTx(){
      const p = state.pendingTx;
      if (!p){ toast('没有待确认的账目'); return; }
      const amtEl = document.getElementById('txAmount');
      const amt = amtEl ? parseFloat(amtEl.value) : NaN;
      if (!amt || amt <= 0){ toast('请输入有效金额'); return; }
      const noteEl = document.getElementById('txNote');
      const note = noteEl ? noteEl.value.trim() : '';
      const dateEl = document.getElementById('txDate');
      const dateVal = (dateEl && dateEl.value) ? dateEl.value : (p.date || todayStr());

      if (p.editingId){
        const tx = transactions.find(x => x.id === p.editingId);
        if (tx){
          tx.amount = amt;
          tx.category = p.category;
          tx.note = note;
          tx.type = p.type;
          tx.date = dateVal;
          tx.account = p.account || tx.account || '现金';
        }
      } else {
        transactions.unshift({
          id: Date.now()+Math.floor(Math.random()*1000),
          date: dateVal,
          time: fmtTime(new Date()),
          amount: amt,
          category: p.category,
          note: note || p.note,
          type: p.type,
          account: p.account || LS.get('app_h_lastAccount', '现金')
        });
      }
      state.transactions = transactions;
      LS.set('app_h_transactions', transactions);
      state.pendingTx = null;
      toast('已保存');
      render();
    }

    // ───────────────────────────────────────────────
    // ⑨ 护肤库：数据结构
    // ───────────────────────────────────────────────
    const SKIN_TYPES = {
      cleaner:   { label: '洁面',   step: 1 },
      toner:     { label: '化妆水', step: 2 },
      essence:   { label: '肌底液', step: 3 },
      serum:     { label: '精华',   step: 4 },
      acid:      { label: '酸类',   step: 4.5 },
      eye:       { label: '眼霜',   step: 5 },
      cream:     { label: '面霜',   step: 6 },
      oil:       { label: '面油',   step: 6.5 },
      mask:      { label: '面膜',   step: 7 },
      sunscreen: { label: '防晒',   step: 9 },
      other:     { label: '其他',   step: 5.5 }
    };

    function getSkinLib(){
      const v = LS.get('app_h_skinLib', []);
      return Array.isArray(v) ? v : [];
    }
    function saveSkinLib(a){ LS.set('app_h_skinLib', a); }

    function addMonths(dateStr, months){
      const [y,m,d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m-1, d);
      dt.setMonth(dt.getMonth() + months);
      return dt.getFullYear() + '-' + _pad(dt.getMonth()+1) + '-' + _pad(dt.getDate());
    }
    function daysBetween(d1, d2){
      return Math.round((new Date(d2 + 'T00:00:00') - new Date(d1 + 'T00:00:00')) / 86400000);
    }
    function getDeadline(p){
      if (!p) return null;
      if (p.status === 'opened' && p.openedAt && p.paoMonths)
        return addMonths(p.openedAt, Number(p.paoMonths));
      if (p.status === 'sealed' && p.expireDate) return p.expireDate;
      return null;
    }
    function getSkinState(p){
      const deadline = getDeadline(p);
      if (!deadline) return { tag:'—', color:'#6b7280', bg:'#f3f4f6', daysLeft:null, deadline:null };
      const days = daysBetween(todayStr(), deadline);
      if (days < 0)   return { tag:'已过期', color:'#dc2626', bg:'#fee2e2', daysLeft:days, deadline };
      if (days <= 30) return { tag:'快过期', color:'#b45309', bg:'#fef3c7', daysLeft:days, deadline };
      return { tag:'使用中', color:'#059669', bg:'#ecfdf5', daysLeft:days, deadline };
    }

    // 生成今日流程
    function buildRoutine(phase){
      const lib = getSkinLib();
      const today = todayStr();
      const dayIndex = Math.floor(new Date(today + 'T00:00:00').getTime() / 86400000);

      const list = lib.filter(p => {
        if (p.status === 'empty') return false;
        const st = getSkinState(p);
        if (st.daysLeft !== null && st.daysLeft < 0) return false;
        if (p.usage === 'any' || p.usage === 'both') return true;
        return p.usage === phase;
      });

      const groups = {};
      list.forEach(p => {
        const step = Number(p.step) || (SKIN_TYPES[p.type] ? SKIN_TYPES[p.type].step : 99);
        if (!groups[step]) groups[step] = [];
        groups[step].push(p);
      });

      const result = [];
      Object.keys(groups).sort((a,b) => a - b).forEach(step => {
        const g = groups[step];
        g.sort((a,b) => {
          const sa = getSkinState(a), sb = getSkinState(b);
          const da = sa.daysLeft == null ? 99999 : sa.daysLeft;
          const db = sb.daysLeft == null ? 99999 : sb.daysLeft;
          return da - db;
        });
        const picked = g[dayIndex % g.length];
        if (picked) result.push(picked);
      });
      return result;
    }

    // ───────────────────────────────────────────────
    // ⑩ 覆写 careSection —— 加"护肤库" tab
    // ───────────────────────────────────────────────
    window.careSection = function(){
      const sub = state.careSub || 'skin';
      const subs = [
        { id:'skin',    label:'护肤' },
        { id:'skinLib', label:'护肤库' },
        { id:'supp',    label:'补剂' },
        { id:'suppLib', label:'补剂库' }
      ];
      let content = '';
      if (sub === 'skin') content = careSkinPane();
      else if (sub === 'skinLib') content = careSkinLibPane();
      else if (sub === 'supp') { try { content = (typeof careSuppPane==='function'?careSuppPane():''); } catch(e){ content = ''; } }
      else { try { content = (typeof careSuppLibPane==='function'?careSuppLibPane():''); } catch(e){ content = ''; } }
      return `<div class="subtabs" style="margin-top:4px;">${subs.map(s => `<button class="subtab ${s.id===sub?'on':''}" data-act="careSub" data-sub="${s.id}">${s.label}</button>`).join('')}</div>${content}`;
    };

    // ───────────────────────────────────────────────
    // ⑪ 覆写 careSkinPane —— 早晚流程来自护肤库
    // ───────────────────────────────────────────────
    function careSkinPane(){
      const s = SKIN_STATES[skinState];
      const lib = getSkinLib();
      const morning = buildRoutine('morning');
      const night   = buildRoutine('night');

      const alerts = lib.map(p => ({ p, st: getSkinState(p) }))
        .filter(x => x.st.daysLeft !== null && x.st.daysLeft <= 30);
      const alertsHtml = alerts.length
        ? `<div class="card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #fbbf24;">
            <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:8px;">⚠️ 过期/临期提醒</div>
            ${alerts.map(a => `<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#92400e;padding:5px 0;border-bottom:1px dashed #fde68a;">
              <span style="flex:1;">${esc(a.p.name)}</span>
              <span style="flex:none;font-weight:700;">${a.st.daysLeft < 0 ? '已过期 ' + (-a.st.daysLeft) + ' 天' : '还剩 ' + a.st.daysLeft + ' 天'}</span>
            </div>`).join('')}
           </div>`
        : '';

      const skinStateCard = `<div class="card" style="background:linear-gradient(135deg,var(--pink),var(--pink2));color:#fff;border:0;">
        <div style="font-size:11px;letter-spacing:1.5px;font-weight:750;opacity:.75;margin-bottom:8px;">${s.icon} 皮肤状态</div>
        <div style="font-size:19px;font-weight:750;margin-bottom:8px;">${s.label}</div>
        <div style="font-size:13px;opacity:.92;line-height:1.7;">${esc(s.desc)}</div>
      </div>`;

      const switchCard = `<div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;">切换状态</div>
        <div class="opt-list">
          ${Object.values(SKIN_STATES).map(v => `<div class="opt-item ${skinState === v.key ? 'active' : ''}" data-act="setSkin" data-skin="${v.key}">
            <span style="font-size:16px;">${v.icon}</span>
            <span class="oi-lb">${v.label}</span>
            <span class="oi-ck">${skinState === v.key ? '✓' : ''}</span>
          </div>`).join('')}
        </div>
      </div>`;

      const profileChanged = Object.keys(profile).some(k => state.profileDraft[k] !== profile[k]);
      const profileCard = `<div class="profile-card">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">我的肤质档案</div>
        ${[
          { k:'skinType',    label:'肤质',   opts:['干性','油性','混合性','中性'] },
          { k:'oiliness',    label:'油度',   opts:['低','中','高'] },
          { k:'sensitivity', label:'敏感度', opts:['低','中','高'] },
          { k:'aging',       label:'老化度', opts:['低','中','高'] }
        ].map(row => `<div class="profile-row">
          <span class="pr-lb">${row.label}</span>
          <div class="pr-opts">
            ${row.opts.map(o => `<span class="pr-opt ${state.profileDraft[row.k] === o ? 'active' : ''}" data-act="setProfileDraft" data-key="${row.k}" data-val="${o}">${o}</span>`).join('')}
          </div>
        </div>`).join('')}
        <div class="row-between" style="margin-top:10px;padding-top:10px;border-top:1px solid #F0F2F7;">
          <span style="font-size:11.5px;color:var(--hot);${profileChanged?'':'visibility:hidden'}">⚠️ 有未保存的修改</span>
          <button class="btn primary" data-act="confirmProfile" ${profileChanged?'':'disabled style="opacity:.4"'} style="padding:9px 20px;font-size:13px;">确定更改</button>
        </div>
      </div>`;

      const tipCard = `<div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">💡 今日建议</div>
        <p class="tip">${esc(s.tips)}</p>
      </div>`;

      const emptyGuide = (!morning.length && !night.length)
        ? `<div class="card" style="text-align:center;padding:28px 20px;">
             <div style="font-size:38px;margin-bottom:10px;">🧴</div>
             <div style="font-size:14px;font-weight:700;margin-bottom:6px;">护肤库还是空的</div>
             <div style="font-size:12.5px;color:var(--sub);line-height:1.7;margin-bottom:14px;">先把你的护肤品加到「护肤库」，<br>系统会自动安排每天的早晚流程。</div>
             <button class="btn-primary" data-act="careSub" data-sub="skinLib" style="background:linear-gradient(135deg,var(--pink),var(--pink2));">去添加产品</button>
           </div>`
        : '';

      function renderRoutine(list, title, icon, phase){
        if (!list.length) return `<div class="card">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;">${icon} ${title}</div>
          <div class="tip-card" style="text-align:center;color:var(--sub);">暂无产品。到「护肤库」添加并设置"使用时间"为早间或早晚。</div>
        </div>`;
        return `<div class="card">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;">${icon} ${title} <span style="float:right;font-weight:500;font-size:11.5px;color:var(--sub)">${list.length} 步</span></div>
          ${list.map(p => {
            const st = getSkinState(p);
            const typeInfo = SKIN_TYPES[p.type] || { label:'其他' };
            const checkKey = `enh_skin_${phase}_${todayStr()}_${p.id}`;
            const checked = isChecked(checkKey);
            const remainStr = st.daysLeft != null ? (st.daysLeft < 0 ? '已过期' : `还剩 ${st.daysLeft} 天`) : '';
            return `<div class="skin-step" style="${checked?'opacity:.55;':''}">
              <span class="check ${checked?'done':''}" data-check-key="${checkKey}" style="margin-top:4px"></span>
              <div class="step-body">
                <div class="step-name">
                  <span style="font-size:11px;font-weight:750;padding:2px 7px;border-radius:5px;background:#eef0ff;color:var(--brand);margin-right:6px;">${typeInfo.label}</span>
                  ${esc(p.name)}
                  ${p.brand?`<span class="muted" style="font-weight:400;font-size:12px;color:var(--sub)"> ${esc(p.brand)}</span>`:''}
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--sub);margin-top:4px;">
                  ${remainStr?`<span style="color:${st.color};">${remainStr}</span>`:''}
                  ${st.deadline?`<span>截止 ${st.deadline}</span>`:''}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      }

      return skinStateCard + switchCard + profileCard + tipCard + alertsHtml + emptyGuide +
             renderRoutine(morning, '早间流程', '☀️', 'am') +
             renderRoutine(night,   '晚间流程', '🌙', 'pm');
    }
    window.careSkinPane = careSkinPane;

    // ───────────────────────────────────────────────
    // ⑫ 护肤库
    // ───────────────────────────────────────────────
    function careSkinLibPane(){
      const lib = getSkinLib();
      if (!lib.length){
        return `<div class="card" style="text-align:center;padding:32px 20px;">
          <div style="font-size:44px;margin-bottom:12px;">🧴</div>
          <div style="font-size:15px;font-weight:750;margin-bottom:8px;">护肤库还是空的</div>
          <div style="font-size:12.5px;color:var(--sub);line-height:1.7;margin-bottom:14px;">
            把你现有的护肤品都添加进来，<br>
            系统会自动计算过期时间并推荐早晚流程。
          </div>
          <button class="btn-primary" data-act="openSkinLibAdd" style="background:linear-gradient(135deg,var(--pink),var(--pink2));">＋ 添加第一个产品</button>
        </div>`;
      }
      const opened = lib.filter(p => p.status === 'opened');
      const sealed = lib.filter(p => p.status === 'sealed');
      const empty  = lib.filter(p => p.status === 'empty');

      const renderItem = p => {
        const st = getSkinState(p);
        const typeInfo = SKIN_TYPES[p.type] || { label:'其他' };
        const remainStr = st.daysLeft != null
          ? (st.daysLeft < 0 ? '已过期 ' + (-st.daysLeft) + ' 天' : '还剩 ' + st.daysLeft + ' 天')
          : '';
        return `<div class="card" style="margin-bottom:10px;padding:12px 14px;">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <div style="font-size:24px;flex:none;">🧴</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                <span style="font-size:14px;font-weight:750;color:#1B1F2A;">${esc(p.name)}</span>
                <span style="font-size:10.5px;font-weight:750;padding:2px 7px;border-radius:5px;background:#eef0ff;color:var(--brand);">${typeInfo.label}</span>
                <span style="font-size:10.5px;font-weight:750;padding:2px 7px;border-radius:5px;background:${st.bg};color:${st.color};">${st.tag}</span>
              </div>
              ${p.brand ? `<div style="font-size:11.5px;color:var(--sub);">${esc(p.brand)}</div>` : ''}
              ${st.deadline ? `<div style="font-size:11.5px;color:${st.color};margin-top:4px;">截止 ${st.deadline} · ${remainStr}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;flex:none;">
              <button class="mini-add" data-act="editSkinLibItem" data-id="${p.id}">编辑</button>
              <button class="mini-add ghost" data-act="delSkinLibItem" data-id="${p.id}">删除</button>
            </div>
          </div>
        </div>`;
      };

      const head = `<div class="card" style="background:linear-gradient(135deg,var(--pink),var(--pink2));color:#fff;border:0;">
        <div style="font-size:11px;letter-spacing:1.5px;font-weight:750;opacity:.75;margin-bottom:8px;">SKIN LIBRARY</div>
        <div style="font-size:19px;font-weight:750;margin-bottom:8px;">护肤库 · ${lib.length} 个产品</div>
        <div style="font-size:13px;opacity:.92;line-height:1.7;">使用中 ${opened.length} · 未开封 ${sealed.length} · 已用完 ${empty.length}</div>
        <button class="btn" style="background:rgba(255,255,255,.92);color:var(--pink);margin-top:12px;font-weight:700;" data-act="openSkinLibAdd">＋ 添加产品</button>
      </div>`;

      return head +
        (opened.length ? `<div class="sec-title" style="margin:8px 4px;">使用中 (${opened.length})</div>${opened.map(renderItem).join('')}` : '') +
        (sealed.length ? `<div class="sec-title" style="margin:8px 4px;">未开封 (${sealed.length})</div>${sealed.map(renderItem).join('')}` : '') +
        (empty.length  ? `<div class="sec-title" style="margin:8px 4px;">已用完 (${empty.length})</div>${empty.map(renderItem).join('')}` : '');
    }
    window.careSkinLibPane = careSkinLibPane;

    // ───────────────────────────────────────────────
    // ⑬ 添加/编辑护肤产品表单
    // ───────────────────────────────────────────────
    function openSkinLibForm(p){
      const isEdit = !!p;
      const d = p || {
        id: 'sp_' + Date.now() + '_' + Math.floor(Math.random()*1000),
        name: '', brand: '', type: 'serum', status: 'sealed',
        expireDate: '', openedAt: todayStr(), paoMonths: 6,
        usage: 'both', ingredients: '', notes: '', step: 4
      };
      const typeOpts = Object.keys(SKIN_TYPES).map(k =>
        `<option value="${k}" ${d.type===k?'selected':''}>${SKIN_TYPES[k].label}</option>`).join('');
      openSheet(`
        <div class="sheet-head">
          <div class="sheet-emoji">🧴</div>
          <div style="flex:1;min-width:0;">
            <h2>${isEdit?'编辑产品':'添加产品'}</h2>
            <div class="muted">填完会自动分析成分、计算到期时间</div>
          </div>
          <button class="link-btn" data-act="closeSheet">关闭</button>
        </div>
        <div style="margin-top:14px;">
          <div class="dim-row"><span class="lb">产品名 *</span><input type="text" id="slName" value="${esc(d.name)}" placeholder="如 玉兰油小白瓶" style="width:180px;text-align:left"></div>
          <div class="dim-row"><span class="lb">品牌</span><input type="text" id="slBrand" value="${esc(d.brand||'')}" placeholder="如 Olay" style="width:180px;text-align:left"></div>
          <div class="dim-row"><span class="lb">类型</span><select id="slType" style="width:180px;text-align:left;font-weight:600;">${typeOpts}</select></div>
          <div class="dim-row"><span class="lb">状态</span>
            <select id="slStatus" style="width:180px;text-align:left;font-weight:600;">
              <option value="sealed" ${d.status==='sealed'?'selected':''}>未开封（库存）</option>
              <option value="opened" ${d.status==='opened'?'selected':''}>已开封</option>
              <option value="empty"  ${d.status==='empty'?'selected':''}>已用完</option>
            </select>
          </div>
          <div id="slSealedRow" class="dim-row" style="display:${d.status==='sealed'?'flex':'none'};">
            <span class="lb">过期日期</span>
            <input type="date" id="slExpire" value="${esc(d.expireDate||'')}" style="width:160px">
          </div>
          <div id="slOpenedRow" style="display:${d.status==='opened'?'block':'none'};">
            <div class="dim-row"><span class="lb">开封日期</span><input type="date" id="slOpenedAt" value="${esc(d.openedAt||todayStr())}" style="width:160px"></div>
            <div class="dim-row"><span class="lb">开封后可用</span><input type="number" id="slPao" value="${d.paoMonths||6}" min="1" max="36" step="1" style="width:80px"><span class="unit">月</span></div>
          </div>
          <div class="dim-row"><span class="lb">使用时间</span>
            <select id="slUsage" style="width:180px;text-align:left;font-weight:600;">
              <option value="morning" ${d.usage==='morning'?'selected':''}>早间</option>
              <option value="night"   ${d.usage==='night'?'selected':''}>晚间</option>
              <option value="both"    ${d.usage==='both'?'selected':''}>早晚都用</option>
              <option value="any"     ${d.usage==='any'?'selected':''}>任意</option>
            </select>
          </div>
          <div class="dim-row" style="align-items:flex-start;">
            <span class="lb" style="flex:none;width:64px;">成分表</span>
            <textarea id="slIngredients" style="flex:1;min-height:90px;border:1.5px solid #E3E6EF;border-radius:10px;padding:8px 10px;font-family:inherit;font-size:12.5px;outline:none;line-height:1.6;" placeholder="粘贴成分表，系统自动分析是否适合你的肤质">${esc(d.ingredients||'')}</textarea>
          </div>
          <div id="slAnalysis" style="margin-top:6px;"></div>
          <button class="btn-ghost-h" data-act="slAnalyze" style="margin-top:10px;font-size:13px;">🔬 分析成分</button>
          <div class="dim-row" style="align-items:flex-start;margin-top:10px;">
            <span class="lb" style="flex:none;width:64px;">备注</span>
            <textarea id="slNotes" style="flex:1;min-height:50px;border:1.5px solid #E3E6EF;border-radius:10px;padding:8px 10px;font-family:inherit;font-size:12.5px;outline:none;line-height:1.6;" placeholder="可选">${esc(d.notes||'')}</textarea>
          </div>
          <button class="btn-primary" data-act="slSave" data-id="${d.id}" style="margin-top:14px;background:linear-gradient(135deg,var(--pink),var(--pink2));">💾 保存</button>
          ${isEdit?`<button class="btn danger wide" data-act="slDelete" data-id="${d.id}" style="margin-top:8px;">删除这个产品</button>`:''}
        </div>
      `);
      const sel = document.getElementById('slStatus');
      if (sel){
        sel.addEventListener('change', () => {
          const v = sel.value;
          document.getElementById('slSealedRow').style.display = v === 'sealed' ? 'flex' : 'none';
          document.getElementById('slOpenedRow').style.display = v === 'opened' ? 'block' : 'none';
        });
      }
      if (d.ingredients) setTimeout(doAnalyzeIngredients, 50);
    }
    window.enhanceOpenSkinLibForm = openSkinLibForm;

    function doSaveSkinLibItem(t){
      const id = t.dataset.id;
      const name = (document.getElementById('slName').value || '').trim();
      if (!name){ toast('请输入产品名'); return; }
      const type = document.getElementById('slType').value;
      const status = document.getElementById('slStatus').value;
      const brand = (document.getElementById('slBrand').value || '').trim();
      const expireDate = document.getElementById('slExpire').value || '';
      const openedAt = document.getElementById('slOpenedAt').value || '';
      const paoMonths = parseFloat(document.getElementById('slPao').value) || 6;
      const usage = document.getElementById('slUsage').value;
      const ingredients = (document.getElementById('slIngredients').value || '').trim();
      const notes = (document.getElementById('slNotes').value || '').trim();
      const step = SKIN_TYPES[type] ? SKIN_TYPES[type].step : 99;

      const arr = getSkinLib();
      const idx = arr.findIndex(x => x.id === id);
      const item = { id, name, brand, type, status, expireDate, openedAt, paoMonths, usage, ingredients, notes, step };
      if (idx >= 0) arr[idx] = item; else arr.push(item);
      saveSkinLib(arr);
      closeSheet();
      toast('已保存');
      state.careSub = 'skinLib';
      render({ keepScroll: true });
    }

    function doAnalyzeIngredients(){
      const ingr = (document.getElementById('slIngredients').value || '').trim();
      if (!ingr){ toast('请先填写成分表'); return; }
      let result;
      try { result = analyzeIngredients('', ingr); }
      catch(e){ toast('分析失败：' + e.message); return; }
      const tagText = result.level === 'ok' ? '适合' : result.level === 'caution' ? '谨慎' : '不建议';
      const el = document.getElementById('slAnalysis');
      if (el){
        el.innerHTML = `<div class="product-eval ${result.level}" style="margin-top:10px;">
          <div class="pe-head"><span class="pe-tag">${tagText}</span><span style="font-size:12.5px;font-weight:600;">分析结果</span></div>
          <div style="color:#3A4152;">${result.reasons.map(x => '· ' + esc(x)).join('<br>')}</div>
        </div>`;
      }
    }

    // ───────────────────────────────────────────────
    // ⑭ 事件拦截（capture 阶段）
    // ───────────────────────────────────────────────
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;

      if (act === 'confirmTx'){
        e.stopPropagation(); e.preventDefault();
        handleConfirmTx(); return;
      }
      if (act === 'openSkinLibAdd'){
        e.stopPropagation(); e.preventDefault();
        openSkinLibForm(null); return;
      }
      if (act === 'editSkinLibItem'){
        e.stopPropagation(); e.preventDefault();
        const p = getSkinLib().find(x => x.id === t.dataset.id);
        if (p) openSkinLibForm(p);
        return;
      }
      if (act === 'delSkinLibItem'){
        e.stopPropagation(); e.preventDefault();
        if (!confirm('删除该产品？')) return;
        saveSkinLib(getSkinLib().filter(x => x.id !== t.dataset.id));
        render({ keepScroll: true }); return;
      }
      if (act === 'slSave'){
        e.stopPropagation(); e.preventDefault();
        doSaveSkinLibItem(t); return;
      }
      if (act === 'slDelete'){
        e.stopPropagation(); e.preventDefault();
        if (!confirm('删除该产品？')) return;
        saveSkinLib(getSkinLib().filter(x => x.id !== t.dataset.id));
        closeSheet(); render({ keepScroll: true }); return;
      }
      if (act === 'slAnalyze'){
        e.stopPropagation(); e.preventDefault();
        doAnalyzeIngredients(); return;
      }
      if (act === 'careSub'){
        // 允许原生处理，但确保 skinLib 能渲染
        state.careSub = t.dataset.sub;
      }
      if (act === 'exportData'){
        e.stopPropagation(); e.preventDefault();
        doExportV3(); return;
      }
      if (act === 'importData'){
        e.stopPropagation(); e.preventDefault();
        doImportV3(); return;
      }
      if (act === 'saveCloth'){
        // 图片保存走原生
        const preview = document.getElementById('clothPreview');
        if (preview && preview.src && preview.style.display !== 'none'
            && window.AndroidFile && AndroidFile.saveImage){
          // 交给原生保存
          try {
            const filename = 'cloth_' + Date.now() + '_' + Math.floor(Math.random()*1000) + '.jpg';
            const path = AndroidFile.saveImage(preview.src, filename);
            if (path){ preview.dataset.filePath = path; }
          } catch(err){}
        }
        // 继续原生处理，但在 unshift 前用 filePath 替换 image
        // 无法拦截，这里不阻止，让原生执行
        return;
      }
    }, true);

    // ───────────────────────────────────────────────
    // ⑮ doExportV3 / doImportV3
    // ───────────────────────────────────────────────
    function buildFullExportPayload(){
      let planStart = todayStr();
      try {
        if (typeof PLAN_START !== 'undefined' && PLAN_START){
          planStart = PLAN_START.getFullYear() + '-' + _pad(PLAN_START.getMonth()+1) + '-' + _pad(PLAN_START.getDate());
        }
      } catch(e){}
      return {
        app: 'daily-health',
        version: 3,
        exportedAt: new Date().toISOString(),
        learn: {
          learned: LearnStore.getLearned(),
          wordDeckMap: LS.get('word-deck-map', {}),
          schedule: {
            english: LearnStore.getSchedule('english'),
            work: LearnStore.getSchedule('work')
          },
          wrongBook: LearnStore.getWrongBook(),
          streak: LearnStore.getStreak(),
          aiHistory: LearnStore.getAIHistory()
        },
        health: {
          body: (typeof body !== 'undefined') ? body : {},
          suppLib: (typeof suppLib !== 'undefined') ? suppLib : [],
          profile: (typeof profile !== 'undefined') ? profile : {},
          skinState: (typeof skinState !== 'undefined') ? skinState : 'stable',
          transactions: (typeof transactions !== 'undefined') ? transactions : [],
          clothes: (typeof clothes !== 'undefined') ? clothes : [],
          skinProducts: (typeof skinProducts !== 'undefined') ? skinProducts : {},
          skinLib: getSkinLib(),
          accounts: getAccountsList(),
          planStart,
          overrides: (typeof getOverrides === 'function') ? getOverrides() : {},
          manualTodos: (typeof getManualTodos === 'function') ? getManualTodos() : {},
          todoStatus: (typeof getTodoStatusMap === 'function') ? getTodoStatusMap() : {},
          sportSessions: (typeof getSportSessions === 'function') ? getSportSessions() : {},
          bodyHistory: (typeof getBodyHistory === 'function') ? getBodyHistory() : [],
          dailyChecks: (typeof getChecks === 'function') ? getChecks() : {}
        }
      };
    }
    function doExportV3(){
      const data = buildFullExportPayload();
      const json = JSON.stringify(data, null, 2);
      const filename = '日常健康备份_' + todayStr() + '.json';
      LS.set('app_h_lastBackupAt', Date.now());
      if (window.AndroidFile && typeof AndroidFile.saveFile === 'function'){
        try { AndroidFile.saveFile(json, filename, 'application/json'); return; }
        catch(e){}
      }
      try {
        const blob = new Blob([json], { type:'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); try { URL.revokeObjectURL(url); } catch(e){} }, 200);
        toast('已导出：' + filename);
      } catch(err){ toast('导出失败：' + err.message); }
    }
    function doImportV3(){
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json,text/plain,*/*';
      input.style.position = 'fixed'; input.style.left = '-9999px';
      input.style.top = '-9999px'; input.style.opacity = '0';
      input.onchange = e => {
        const f = e.target.files[0];
        if (!f) return;
        if (!confirm('导入会覆盖当前数据，确定继续？')) return;
        const reader = new FileReader();
        reader.onload = ev => {
          try { applyImportV3(ev.target.result); }
          catch(err){ toast('文件读取失败：' + err.message); }
        };
        reader.readAsText(f, 'UTF-8');
      };
      document.body.appendChild(input);
      input.click();
      setTimeout(() => { try { document.body.removeChild(input); } catch(e){} }, 60000);
    }

    function applyImportV3(text){
      let raw;
      try { raw = JSON.parse(text); } catch(e){ toast('JSON 解析失败'); return; }

      if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)){
        const src = raw.data;
        const p = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch(e){ return v; } };
        raw = {
          learn: {},
          health: {
            body: p(src.app_body || src.body),
            suppLib: p(src.app_supplements || src.supplements || src.suppLib),
            profile: p(src.app_profile || src.profile),
            skinState: p(src.app_skinState || src.skinState),
            transactions: p(src.transactions),
            bodyHistory: p(src.app_bodyHistory || src.bodyHistory),
            planStart: src.planStartDate || src.planStart,
            overrides: p(src.planOverrides || src.overrides),
            todoStatus: p(src.todoStatus),
            manualTodos: p(src.calendarManual || src.manualTodos),
            sportSessions: p(src.sportSessions),
            clothes: p(src.clothes),
            skinProducts: p(src.skinProducts),
            dailyChecks: p(src.dailyChecks),
            skinLib: p(src.app_skinLib),
            accounts: p(src.app_accounts || src.app_customCats)
          }
        };
      }
      const learn = raw.learn || {};
      const health = raw.health || raw;

      if (health.body) LS.set('app_h_body', health.body);
      if (health.suppLib) LS.set('app_h_suppLib', health.suppLib);
      if (health.profile) LS.set('app_h_profile', health.profile);
      if (health.skinState) LS.set('app_h_skinState', health.skinState);
      if (Array.isArray(health.transactions)){
        const cur = LS.get('app_h_transactions', []);
        const merged = health.transactions.concat(cur);
        const seen = new Set(); const dedup = [];
        merged.forEach(t => {
          const sig = `${t.date}|${t.time}|${t.amount}|${t.type}|${t.category}|${t.note||''}`;
          if (!seen.has(sig)){ seen.add(sig); dedup.push(t); }
        });
        LS.set('app_h_transactions', dedup);
      }
      if (Array.isArray(health.clothes)) LS.set('app_h_clothes', health.clothes);
      if (health.skinProducts) LS.set('app_h_skinProducts', health.skinProducts);
      if (health.planStart) LS.set('app_h_planStartDate', health.planStart);
      if (health.overrides) LS.set('app_h_planOverrides', health.overrides);
      if (health.manualTodos) LS.set('app_h_calendarManual', health.manualTodos);
      if (health.todoStatus) LS.set('app_h_todoStatus', health.todoStatus);
      if (health.sportSessions) LS.set('app_h_sportSessions', health.sportSessions);
      if (health.bodyHistory) LS.set('app_h_bodyHistory', health.bodyHistory);
      if (health.dailyChecks) LS.set('app_h_dailyChecks', health.dailyChecks);

      if (Array.isArray(health.accounts) && health.accounts.length){
        const cur = getAccountsList();
        LS.set('app_h_accounts', Array.from(new Set([...cur, ...health.accounts])));
      }
      if (Array.isArray(health.skinLib) && health.skinLib.length){
        const cur = getSkinLib();
        const ids = new Set(cur.map(x => x.id));
        const merged = cur.slice();
        health.skinLib.forEach(p => { if (!ids.has(p.id)) merged.push(p); });
        saveSkinLib(merged);
      }
      if (learn.learned) LS.set('learned:'+DAY, learn.learned);
      if (learn.wordDeckMap) LS.set('word-deck-map', learn.wordDeckMap);
      if (learn.schedule){
        if (learn.schedule.english) LS.set('schedule:english', learn.schedule.english);
        if (learn.schedule.work)    LS.set('schedule:work', learn.schedule.work);
      }
      if (learn.wrongBook) LS.set('wrong-book', learn.wrongBook);
      if (learn.streak) LS.set('streak', learn.streak);
      if (learn.aiHistory) LS.set('ai-history', learn.aiHistory);
      toast('✓ 导入成功，正在刷新…');
      setTimeout(() => location.reload(), 800);
    }

    // ───────────────────────────────────────────────
    // ⑯ MutationObserver：注入"我的"页面卡片
    // ───────────────────────────────────────────────
    let _pending = false;
    function schedule(){
      if (_pending) return;
      _pending = true;
      requestAnimationFrame(() => {
        _pending = false;
        try { removeHomeBackupBanner(); } catch(e){}
        try { injectMeBackupCard(); } catch(e){}
        try { injectMeStorageCard(); } catch(e){}
        try { injectWrongBookEntry(); } catch(e){}
        try { enhanceTxEditArea(); } catch(e){}
        try { postProcessImages(); } catch(e){}
      });
    }

    function removeHomeBackupBanner(){
      const home = document.querySelector('#view');
      if (!home) return;
      home.querySelectorAll('[data-enhance-backup-banner]').forEach(el => el.remove());
      home.querySelectorAll('.card').forEach(el => {
        const txt = el.textContent || '';
        if (/已\s*\d+\s*天没备份|从未备份/.test(txt) && el.querySelector('[data-act="exportData"]')){
          el.remove();
        }
      });
    }

    function injectMeBackupCard(){
      if (document.querySelector('[data-enh-me-backup]')) return;
      const h1s = document.querySelectorAll('.hero h1');
      let isMe = false;
      h1s.forEach(h => { if (h.textContent.includes('数据管理')) isMe = true; });
      if (!isMe) return;
      let anchor = null;
      document.querySelectorAll('.card').forEach(c => {
        if (c.querySelector('.sec-title') && /数据备份/.test(c.querySelector('.sec-title').textContent)) anchor = c;
      });
      if (!anchor) return;
      const lastTs = parseInt(LS.get('app_h_lastBackupAt', '0') || '0', 10);
      const days = lastTs ? Math.floor((Date.now() - lastTs) / 86400000) : 999;
      let txCount = 0;
      try { txCount = (LS.get('app_h_transactions', []) || []).length; } catch(e){}
      if (!(txCount > 0 && days >= 7)) return;
      const card = document.createElement('div');
      card.setAttribute('data-enh-me-backup', '1');
      card.className = 'card';
      card.style.cssText = 'background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #fbbf24;cursor:pointer;';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">💾</span>
          <div style="flex:1;">
            <div style="font-size:13.5px;font-weight:750;color:#92400e;">已 ${days === 999 ? '从未备份' : days + ' 天没备份'}</div>
            <div style="font-size:11.5px;color:#a16207;margin-top:3px;">点这里立即导出 JSON 备份</div>
          </div>
          <span style="color:#92400e;font-size:16px;">›</span>
        </div>`;
      card.addEventListener('click', e => { e.stopPropagation(); doExportV3(); });
      anchor.parentNode.insertBefore(card, anchor);
    }

    function injectMeStorageCard(){
      if (document.querySelector('[data-enh-storage]')) return;
      const h1s = document.querySelectorAll('.hero h1');
      let isMe = false;
      h1s.forEach(h => { if (h.textContent.includes('数据管理')) isMe = true; });
      if (!isMe) return;
      const dangerCard = document.querySelector('.card[style*="fee2e2"]');
      if (!dangerCard) return;
      const size = storageSize();
      const kb = (size/1024).toFixed(1);
      const pct = Math.min(100, size / (5*1024*1024) * 100).toFixed(1);
      const card = document.createElement('div');
      card.setAttribute('data-enh-storage', '1');
      card.className = 'card';
      card.innerHTML = `
        <div class="sec-title" style="margin:0 0 12px;">💾 存储占用</div>
        <div style="font-size:13px;color:#4b5265;">
          当前本地存储：<b style="color:var(--brand);">${kb} KB</b>
          <span style="color:var(--sub);font-size:11.5px;"> / 约 5 MB 上限</span>
        </div>
        <div class="progress-bar" style="margin-top:8px;">
          <div style="width:${pct}%;"></div>
        </div>
        ${size > 3.5*1024*1024 ? '<div class="err-inline" style="margin-top:10px;">⚠️ 存储接近上限，建议导出备份后清理旧数据</div>' : ''}
      `;
      dangerCard.parentNode.insertBefore(card, dangerCard);
    }

    function injectWrongBookEntry(){
      if (document.querySelector('[data-enh-wrongbook]')) return;
      const cards = document.querySelectorAll('.card');
      let anchor = null;
      cards.forEach(c => {
        const t = c.textContent || '';
        if ((t.includes('全部内容综合测试') || t.includes('本周综合测试')) && !c.querySelector('[data-enh-wrongbook]')){
          anchor = c;
        }
      });
      if (!anchor) return;
      let wc = 0;
      try { wc = LearnStore.getWrongBook().length; } catch(e){}
      if (wc <= 0) return;
      const card = document.createElement('div');
      card.setAttribute('data-enh-wrongbook', '1');
      card.className = 'card';
      card.style.cssText = 'background:linear-gradient(135deg,#fef2f2,#fee2e2);border:1px solid #fecaca;cursor:pointer;';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">📕</span>
          <div style="flex:1;">
            <div style="font-size:13.5px;font-weight:750;color:#991b1b;">错题本 · ${wc} 条</div>
            <div style="font-size:11.5px;color:#b91c1c;margin-top:3px;">点这里查看所有答错的题</div>
          </div>
          <span style="color:#991b1b;font-size:16px;">›</span>
        </div>`;
      card.addEventListener('click', openWrongBookSheet);
      anchor.parentNode.insertBefore(card, anchor.nextSibling);
    }

    function openWrongBookSheet(){
      let list = [];
      try { list = LearnStore.getWrongBook(); } catch(e){}
      if (!list.length){ toast('错题本是空的 🎉'); return; }
      const rows = list.map((w, i) => {
        const typeLabel = w.type === 'english' ? '英语' : '专业';
        return `<div style="padding:12px 0;border-bottom:1px dashed #eceef4;${i === list.length-1 ? 'border-bottom:none;' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div style="flex:1;min-width:0;">
              <span style="display:inline-block;font-size:10.5px;font-weight:750;padding:2px 7px;border-radius:5px;margin-bottom:5px;background:${w.type==='english'?'#ecfdf5':'#eef0ff'};color:${w.type==='english'?'#047857':'#4f46e5'};">${typeLabel}</span>
              <div style="font-size:14px;font-weight:650;line-height:1.5;">${esc(w.q)}</div>
              <div style="font-size:12px;color:var(--sub);margin-top:5px;line-height:1.65;">你的答案：${esc(w.userAnswer||'（空）')}</div>
              ${w.feedback ? `<div style="font-size:12px;color:#b45309;margin-top:4px;line-height:1.65;">点评：${esc(w.feedback)}</div>` : ''}
            </div>
            <button style="flex:none;border:0;background:#FFEDEA;color:var(--hot);border-radius:9px;padding:6px 10px;font-size:11.5px;font-weight:650;cursor:pointer;font-family:inherit;" data-enh-remove-wrong data-type="${w.type}" data-key="${esc(w.key)}">移除</button>
          </div>
        </div>`;
      }).join('');
      openSheet(`
        <div class="sheet-head">
          <div class="sheet-emoji">📕</div>
          <div style="flex:1;min-width:0;">
            <h2>错题本</h2>
            <div class="muted">共 ${list.length} 条 · 答对后自动移除</div>
          </div>
          <button class="link-btn" data-act="closeSheet">关闭</button>
        </div>
        <div style="margin-top:8px;">${rows}</div>
      `);
      setTimeout(() => {
        document.querySelectorAll('[data-enh-remove-wrong]').forEach(btn => {
          if (btn.dataset.enhBound) return;
          btn.dataset.enhBound = '1';
          btn.addEventListener('click', () => {
            LearnStore.removeWrong(btn.dataset.type, btn.dataset.key);
            toast('已移除');
            openWrongBookSheet();
          });
        });
      }, 30);
    }

    function postProcessImages(){
      document.querySelectorAll('.lib-item img').forEach(img => {
        if (img.dataset.enhProcessed) return;
        const src = img.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('file:') && !src.startsWith('http')){
          if (window.AndroidFile && AndroidFile.getImageUrl){
            try {
              const u = AndroidFile.getImageUrl(src);
              if (u) img.src = u;
            } catch(e){}
          }
        }
        img.dataset.enhProcessed = '1';
      });
    }

    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList:true, subtree:true });
    setTimeout(schedule, 200);
    setTimeout(schedule, 1000);
    setTimeout(schedule, 3000);
  }
})();
