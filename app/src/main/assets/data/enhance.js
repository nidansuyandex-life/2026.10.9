/* ═══════════════════════════════════════════════════════════════
 * enhance.js —— 日常·健康生活 增强模块
 * 需在 index.html 的 <head> 里加载，且在 main script 之后
 * ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // 等主脚本把变量都挂到全局（let 声明的全局词法变量其他脚本可直接访问）
  function ready(){
    try {
      // 检测核心变量是否已存在
      if (typeof LS === 'undefined') return false;
      if (typeof state === 'undefined') return false;
      if (typeof render !== 'function') return false;
      return true;
    } catch(e){ return false; }
  }
  function waitReady(cb, tries, interval){
    tries = tries || 100;
    interval = interval || 50;
    if (ready()){ cb(); return; }
    if (tries <= 0){ console.warn('enhance.js: 等待主脚本超时'); return; }
    setTimeout(() => waitReady(cb, tries-1, interval), interval);
  }
  waitReady(initEnhance);

  function initEnhance(){
    console.log('[enhance] 已激活');

    // ══════════════════════════════════════════════════
    // ① 存储满时提示 + 用包装方式拦截 localStorage.setItem
    // ══════════════════════════════════════════════════
    const _origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k, v){
      try {
        _origSetItem(k, v);
      } catch(e){
        const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 ||
                              /quota/i.test(e.message || ''));
        if (isQuota){
          setTimeout(() => {
            if (typeof toast === 'function') toast('⚠️ 存储已满，请到「我的」导出备份后清理');
          }, 50);
        }
        console.error('setItem 失败:', e);
      }
    };

    // ══════════════════════════════════════════════════
    // ② 工具函数
    // ══════════════════════════════════════════════════
    window.enhanceNormalizeTime = function(t){
      if (t == null) return '--:--';
      const s = String(t).trim();
      if (!s) return '--:--';
      let m = s.match(/^(\d{1,2}):(\d{1,2})/);
      if (m) return pad(parseInt(m[1],10)) + ':' + pad(parseInt(m[2],10));
      const n = parseFloat(s);
      if (!isNaN(n) && n >= 0 && n < 1){
        const totalMin = Math.round(n * 24 * 60);
        return pad(Math.floor(totalMin/60)) + ':' + pad(totalMin % 60);
      }
      return s;
    };

    window.enhanceStorageSize = function(){
      let total = 0;
      try {
        Object.keys(localStorage).forEach(k => {
          const v = localStorage.getItem(k);
          if (v != null) total += k.length + v.length;
        });
      } catch(e){}
      return total;
    };

    // ══════════════════════════════════════════════════
    // ③ 修复历史数据的 Excel 时间小数
    // ══════════════════════════════════════════════════
    (function fixHistoricalTimes(){
      let changed = false;
      try {
        const all = LS.get('app_h_transactions', []);
        if (!Array.isArray(all)) return;
        const fixed = all.map(t => {
          if (t && t.time != null){
            const raw = String(t.time).trim();
            if (/^\d*\.?\d+$/.test(raw)){
              const n = parseFloat(raw);
              if (!isNaN(n) && n >= 0 && n < 1){
                const f = window.enhanceNormalizeTime(raw);
                if (f !== raw){ changed = true; return { ...t, time: f }; }
              }
            }
          }
          return t;
        });
        if (changed){
          LS.set('app_h_transactions', fixed);
          console.log('[enhance] 已修复历史时间格式');
          // 通知主脚本刷新
          setTimeout(() => { try { render({keepScroll:true}); } catch(e){} }, 200);
        }
      } catch(e){ console.error('fixHistoricalTimes', e); }
    })();

    // ══════════════════════════════════════════════════
    // ④ 覆写 LS.set —— 加更友好的错误处理
    // ══════════════════════════════════════════════════
    // (LS.set 本身已经能抛错给上面的 setItem wrapper，无需再覆写)

    // ══════════════════════════════════════════════════
    // ⑤ 首页备份提醒 banner —— MutationObserver
    // ══════════════════════════════════════════════════
    let _backupBannerInjected = false;
    function tryInjectBackupBanner(){
      const head = document.querySelector('.home-head');
      if (!head || _backupBannerInjected) return;
      // 检查是否已插入
      if (document.querySelector('[data-enhance-backup-banner]')) return;
      const lastTs = parseInt(LS.get('app_h_lastBackupAt', '0') || '0', 10);
      const days = lastTs ? Math.floor((Date.now() - lastTs) / 86400000) : 999;
      let txCount = 0, clothesCount = 0;
      try {
        const tx = LS.get('app_h_transactions', []);
        txCount = Array.isArray(tx) ? tx.length : 0;
        const cl = LS.get('app_h_clothes', []);
        clothesCount = Array.isArray(cl) ? cl.length : 0;
      } catch(e){}
      if (!((txCount > 0 || clothesCount > 0) && days >= 7)) return;
      const banner = document.createElement('div');
      banner.setAttribute('data-enhance-backup-banner', '1');
      banner.className = 'card';
      banner.style.cssText = 'background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #fbbf24;cursor:pointer;padding:14px;';
      banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">💾</span>
          <div style="flex:1;">
            <div style="font-size:13.5px;font-weight:750;color:#92400e;">已 ${days === 999 ? '从未备份' : days + ' 天没备份'}</div>
            <div style="font-size:11.5px;color:#a16207;margin-top:3px;">点这里立即导出 JSON 备份</div>
          </div>
          <span style="color:#92400e;font-size:16px;">›</span>
        </div>`;
      banner.addEventListener('click', () => {
        try { doExport(); } catch(e){ toast('导出失败'); }
      });
      head.parentNode.insertBefore(banner, head.nextSibling);
      _backupBannerInjected = true;
    }

    // ══════════════════════════════════════════════════
    // ⑥ "我的"页面存储占用卡片
    // ══════════════════════════════════════════════════
    function tryInjectStorageCard(){
      if (document.querySelector('[data-enhance-storage-card]')) return;
      // 只在"我的"页面 —— 找 hero 里"数据管理"
      const heroes = document.querySelectorAll('.hero h1');
      let found = false;
      heroes.forEach(h => { if (h.textContent.includes('数据管理')) found = true; });
      if (!found) return;
      const dangerCard = document.querySelector('.card[style*="fee2e2"]');
      if (!dangerCard) return;
      const size = window.enhanceStorageSize();
      const kb = (size/1024).toFixed(1);
      const pct = Math.min(100, size / (5*1024*1024) * 100).toFixed(1);
      const card = document.createElement('div');
      card.setAttribute('data-enhance-storage-card', '1');
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

    // ══════════════════════════════════════════════════
    // ⑦ 总测页加错题本入口
    // ══════════════════════════════════════════════════
    function tryInjectWrongBookEntry(){
      if (document.querySelector('[data-enhance-wrongbook]')) return;
      // 找"全部内容综合测试"或"本周综合测试"卡片
      const cards = document.querySelectorAll('.card');
      let anchor = null;
      cards.forEach(c => {
        const t = c.textContent || '';
        if ((t.includes('全部内容综合测试') || t.includes('本周综合测试')) && !c.querySelector('[data-enhance-wrongbook]')){
          anchor = c;
        }
      });
      if (!anchor) return;
      let wrongCount = 0;
      try { wrongCount = LearnStore.getWrongBook().length; } catch(e){}
      if (wrongCount <= 0) return;
      const card = document.createElement('div');
      card.setAttribute('data-enhance-wrongbook', '1');
      card.className = 'card';
      card.style.cssText = 'background:linear-gradient(135deg,#fef2f2,#fee2e2);border:1px solid #fecaca;cursor:pointer;';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">📕</span>
          <div style="flex:1;">
            <div style="font-size:13.5px;font-weight:750;color:#991b1b;">错题本 · ${wrongCount} 条</div>
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
      // 绑定移除按钮
      setTimeout(() => {
        document.querySelectorAll('[data-enh-remove-wrong]').forEach(btn => {
          btn.addEventListener('click', () => {
            LearnStore.removeWrong(btn.dataset.type, btn.dataset.key);
            toast('已移除');
            openWrongBookSheet();
          });
        });
      }, 30);
    }
    window.enhanceOpenWrongBook = openWrongBookSheet;

    // ══════════════════════════════════════════════════
    // ⑧ 记账编辑区增强：日期 / 账户 / 备注喇叭
    // ══════════════════════════════════════════════════
    const ACCOUNTS_DEFAULT = ['现金','微信','支付宝','银行卡','其他'];
    window.enhanceGetAccounts = function(){
      const v = LS.get('app_h_accounts', null);
      return Array.isArray(v) && v.length ? v : ACCOUNTS_DEFAULT.slice();
    };
    window.enhanceSaveAccounts = function(a){ LS.set('app_h_accounts', a); };

    function enhanceTxEditor(){
      const area = document.getElementById('txEditArea');
      if (!area) return;
      const pending = (state && state.pendingTx) ? state.pendingTx : null;
      if (!pending) return;

      // 加日期（如果还没加）
      if (!document.getElementById('txDate')){
        const amountRow = area.querySelector('input#txAmount')?.closest('.dim-row');
        if (amountRow){
          const dateRow = document.createElement('div');
          dateRow.className = 'dim-row';
          const dateVal = pending.date || todayStr();
          dateRow.innerHTML = `<span class="lb">日期</span><input type="date" id="txDate" value="${dateVal}" style="width:150px">`;
          amountRow.parentNode.insertBefore(dateRow, amountRow.nextSibling);
        }
      }

      // 加账户行（如果还没加）
      if (!area.querySelector('[data-enh-account-row]')){
        const noteRow = area.querySelector('input#txNote')?.closest('.dim-row');
        if (noteRow){
          const accounts = window.enhanceGetAccounts();
          const curAcc = pending.account || LS.get('app_h_lastAccount', '现金');
          const accRow = document.createElement('div');
          accRow.className = 'dim-row';
          accRow.setAttribute('data-enh-account-row', '1');
          accRow.style.cssText = 'flex-wrap:wrap;align-items:flex-start;';
          accRow.innerHTML = `
            <span class="lb" style="flex:none;width:56px;">账户</span>
            <div style="flex:1;display:flex;flex-wrap:wrap;gap:4px;">
              ${accounts.map(a => `<span class="cat-chip ${a===curAcc?'active':''}" data-enh-account="${esc(a)}">${esc(a)}</span>`).join('')}
              <span class="cat-chip" data-enh-add-account style="background:#EAF3FF;color:var(--blue);">＋</span>
            </div>`;
          noteRow.parentNode.insertBefore(accRow, noteRow.nextSibling);
        }
      }

      // 备注加喇叭
      const noteInput = area.querySelector('input#txNote');
      if (noteInput && !noteInput.parentNode.querySelector('[data-enh-speak-note]')){
        noteInput.style.width = '140px';
        const btn = document.createElement('button');
        btn.setAttribute('data-enh-speak-note', '1');
        btn.style.cssText = 'border:0;background:#f3f4fa;width:36px;height:36px;border-radius:10px;font-size:15px;cursor:pointer;flex:none;';
        btn.textContent = '🔊';
        btn.title = '朗读备注';
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const v = noteInput.value.trim();
          if (!v){ toast('没有可朗读的内容'); return; }
          toggleSpeak(v, 'zh-CN', btn);
        });
        noteInput.parentNode.appendChild(btn);
      }

      // 绑定账户 chip 点击
      area.querySelectorAll('[data-enh-account]').forEach(chip => {
        if (chip.dataset.enhBound) return;
        chip.dataset.enhBound = '1';
        chip.addEventListener('click', e => {
          e.stopPropagation();
          const acc = chip.dataset.enhAccount;
          if (state.pendingTx){
            state.pendingTx.account = acc;
            LS.set('app_h_lastAccount', acc);
            enhanceTxEditor();
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
          const list = window.enhanceGetAccounts();
          if (list.includes(name)){ toast('该账户已存在'); return; }
          list.push(name);
          window.enhanceSaveAccounts(list);
          if (state.pendingTx) state.pendingTx.account = name;
          LS.set('app_h_lastAccount', name);
          enhanceTxEditor();
          toast('已添加账户：' + name);
        });
      }
    }

    // ══════════════════════════════════════════════════
    // ⑨ 图片 src 工具
    // ══════════════════════════════════════════════════
    window.enhanceImageSrc = function(img){
      if (!img) return '';
      if (img.startsWith('data:')) return img;
      if (img.startsWith('file://') || img.startsWith('http')) return img;
      if (window.AndroidFile && typeof AndroidFile.getImageUrl === 'function'){
        try { const u = AndroidFile.getImageUrl(img); return u || ''; } catch(e){ return ''; }
      }
      return '';
    };

    // ══════════════════════════════════════════════════
    // ⑩ 后处理：记账列表加日期 + 账户 + 用 enhanceImageSrc
    // ══════════════════════════════════════════════════
    function postProcessMoneyList(){
      // 处理 .tx 里的时间和分类那一行
      document.querySelectorAll('.tx').forEach(tx => {
        const muted = tx.querySelector('.muted');
        if (!muted || muted.dataset.enhProcessed) return;
        const idAttr = tx.getAttribute('data-tx-id');
        if (!idAttr) return;
        let t = null;
        try {
          const all = LS.get('app_h_transactions', []);
          t = all.find(x => String(x.id) === String(idAttr));
        } catch(e){}
        if (!t) return;
        const today = todayStr();
        const yest = prevDayStr();
        let dateLabel = t.date || '';
        if (dateLabel === today) dateLabel = '今天';
        else if (dateLabel === yest) dateLabel = '昨天';
        const timeStr = window.enhanceNormalizeTime(t.time);
        const acc = t.account || '现金';
        muted.textContent = `${dateLabel} ${timeStr} · ${t.type === 'income' ? '收入' : '支出'} · ${t.category} · ${acc}`;
        muted.dataset.enhProcessed = '1';
      });

      // 处理衣橱图片
      document.querySelectorAll('.lib-item img').forEach(img => {
        if (img.dataset.enhProcessed) return;
        const src = img.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('file:') && !src.startsWith('http')){
          const newSrc = window.enhanceImageSrc(src);
          if (newSrc) img.src = newSrc;
        }
        img.dataset.enhProcessed = '1';
      });
    }

    // ══════════════════════════════════════════════════
    // ⑪ MutationObserver 统一监听 DOM 变化
    // ══════════════════════════════════════════════════
    let _rafPending = false;
    function schedule(){
      if (_rafPending) return;
      _rafPending = true;
      requestAnimationFrame(() => {
        _rafPending = false;
        tryInjectBackupBanner();
        tryInjectStorageCard();
        tryInjectWrongBookEntry();
        enhanceTxEditor();
        postProcessMoneyList();
      });
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true });

    // ══════════════════════════════════════════════════
    // ⑫ 拦截"确认记账"事件：把 txDate / account 写回
    // ══════════════════════════════════════════════════
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-act="confirmTx"]');
      if (!t) return;
      // 把 txDate 的值暂存到 state.pendingTx
      const dateEl = document.getElementById('txDate');
      if (dateEl && state.pendingTx && dateEl.value){
        state.pendingTx.date = dateEl.value;
      }
      // 账户已经在 chip 点击时写过了
    }, true);  // capture

    // ══════════════════════════════════════════════════
    // ⑬ 覆写 doExport：加时间戳
    // ══════════════════════════════════════════════════
    const _origDoExport = window.doExport || (typeof doExport === 'function' ? doExport : null);
    // doExport 是顶层函数，可以直接覆写（如果它能被 let/var 引用）
    // 但因为它可能是 function 声明，直接在全局作用域名 doExport 上覆写
    try {
      const oldExport = doExport;
      // 用 eval 保证覆写的是全局词法名
      // 更安全：用 setter 覆盖
      // 由于 function 声明的函数名是可写的，直接赋值即可
      // 但 doExport 是 function 声明，下面的赋值会成功
      // （若失败，静默）
      // eslint-disable-next-line no-global-assign
      doExport = function(){
        LS.set('app_h_lastBackupAt', Date.now());
        return oldExport.apply(this, arguments);
      };
    } catch(e){
      console.warn('enhance: 无法覆写 doExport，请手动在 HTML 的 doExport 里加一行：LS.set(\'app_h_lastBackupAt\', Date.now());');
    }

    // ══════════════════════════════════════════════════
    // ⑭ 记录：SaveCloth 时若 HTML 端没走原生保存（比如旧版本），
    //    在这里做二次兜底 —— 不需要，HTML 端已改
    // ══════════════════════════════════════════════════

    // ══════════════════════════════════════════════════
    // ⑮ 首次进入主动触发一次
    // ══════════════════════════════════════════════════
    setTimeout(schedule, 300);
    setTimeout(schedule, 1500);
  }
})();
