window.skincareLib = LS.get('app_h_skincareLib', []);
window.skincareRoutine = LS.get('app_h_skincareRoutine', { morning: [], night: [] });
window.saveSkincareLib = () => LS.set('app_h_skincareLib', skincareLib);
window.saveSkincareRoutine = () => LS.set('app_h_skincareRoutine', skincareRoutine);

function calcExpiryDate(openDate, months) {
  const d = new Date(openDate); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10);
}
function daysLeft(expiryDate) {
  return Math.ceil((new Date(expiryDate) - new Date(todayStr())) / 86400000);
}

window.careSection = function(){
  const sub = state.careSub || 'routine';
  const subs = [{ id:'routine', label:'每日流程' },{ id:'lib', label:'护肤库' }];
  let content = '';
  if (sub === 'routine') content = careRoutinePane();
  else if (sub === 'lib') content = careLibPane();
  return `<div class="subtabs">${subs.map(s => `<button class="subtab ${s.id===sub?'on':''}" data-act="careSub" data-sub="${s.id}">${s.label}</button>`).join('')}</div>${content}`;
};

function careRoutinePane(){
  const renderStep = (phase, stepId, name, note) => {
    const bindId = phase === 'morning' ? skincareRoutine.morning.find(x => x.stepId === stepId)?.prodId 
                                       : skincareRoutine.night.find(x => x.stepId === stepId)?.prodId;
    const prod = skincareLib.find(p => p.id === bindId);
    let prodHtml = '';
    if (prod) {
      const left = daysLeft(prod.expiryDate);
      const warn = left <= 15 ? `<span style="color:var(--err);font-size:11px;">(仅剩${left}天)</span>` : '';
      prodHtml = `<div style="font-size:13px;color:var(--brand);margin-top:4px;">🧴 ${esc(prod.name)} ${warn}</div>`;
    } else {
      prodHtml = `<div style="font-size:12px;color:var(--sub);margin-top:4px;font-style:italic;">未绑定产品</div>`;
    }
    
    return `<div style="padding:10px 0;border-bottom:1px dashed #eee;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">${name} <span style="font-size:11px;color:var(--sub);font-weight:400;">${note}</span></div>
          ${prodHtml}
        </div>
      </div>
    </div>`;
  };

  return `<div class="card">
    <div class="row-between" style="margin-bottom:12px;">
      <div style="font-size:15px;font-weight:700;">☀️ 早间流程</div>
      <button class="mini-add" data-act="autoRecommend" data-phase="morning">✨ AI推荐</button>
    </div>
    ${renderStep('morning','m_clean','洁面','洗去油脂')}
    ${renderStep('morning','m_water','水','补水')}
    ${renderStep('morning','m_serum','精华','功效')}
    ${renderStep('morning','m_cream','乳/霜','锁水')}
    ${renderStep('morning','m_sun','防晒','必涂')}
  </div>
  <div class="card">
    <div class="row-between" style="margin-bottom:12px;">
      <div style="font-size:15px;font-weight:700;">🌙 晚间流程</div>
      <button class="mini-add" data-act="autoRecommend" data-phase="night">✨ AI推荐</button>
    </div>
    ${renderStep('night','n_clean','卸妆/洁面','清洁')}
    ${renderStep('night','n_water','水','补水')}
    ${renderStep('night','n_serum','精华','修护')}
    ${renderStep('night','n_cream','面霜','封闭')}
  </div>`;
}

function careLibPane(){
  const list = skincareLib.map(p => {
    const left = daysLeft(p.expiryDate);
    const isExpired = left < 0, isWarn = left >= 0 && left <= 30;
    const statusColor = isExpired ? 'var(--err)' : isWarn ? 'var(--warn)' : 'var(--accent)';
    const statusText = isExpired ? '已过期' : `剩 ${left} 天`;
    
    return `<div class="card" style="padding:12px;margin-bottom:10px;">
      <div class="row-between"><div style="font-size:15px;font-weight:700;">${esc(p.name)}</div><div style="font-size:11.5px;font-weight:700;color:${statusColor};">${statusText}</div></div>
      <div style="font-size:12px;color:var(--sub);margin-top:4px;">${p.category} · 开封: ${p.openDate} · 保质期: ${p.shelfLife}个月</div>
      ${p.ingredients ? `<div style="font-size:11px;color:#666;margin-top:6px;background:#f8f9fd;padding:6px;border-radius:6px;">成分: ${esc(p.ingredients)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn-ghost-h" style="flex:1;font-size:12px;padding:6px;background:#fee2e2;color:#dc2626;" data-act="delSkincare" data-id="${p.id}">删除</button>
      </div>
    </div>`;
  }).join('');
  
  return `<div class="card"><button class="btn-primary" data-act="addSkincare" style="background:linear-gradient(135deg,var(--pink),var(--pink2))">＋ 添加护肤品到库</button></div>
  <div style="font-size:13px;font-weight:700;margin:14px 4px 8px;">我的护肤库 (${skincareLib.length})</div>${list || '<div class="tip-card">暂无护肤品</div>'}`;
}

window.openAddSkincareSheet = function() {
  openSheet(`
    <div class="sheet-head"><h2>添加护肤品</h2><button class="link-btn" data-act="closeSheet">关闭</button></div>
    <div class="dim-row"><span class="lb">名称</span><input type="text" id="prodName" placeholder="如：适乐肤C霜"></div>
    <div class="dim-row"><span class="lb">类别</span><select id="prodCat"><option value="洁面">洁面</option><option value="水">水</option><option value="精华">精华</option><option value="乳霜">乳霜</option><option value="防晒">防晒</option></select></div>
    <div class="dim-row"><span class="lb">开封日期</span><input type="date" id="prodOpenDate" value="${todayStr()}"></div>
    <div class="dim-row"><span class="lb">保质期(月)</span><input type="number" id="prodShelf" value="12" style="width:60px;"></div>
    <div class="dim-row"><span class="lb">成分表</span><textarea id="prodIngr" style="width:100%;height:60px;"></textarea></div>
    <button class="btn primary wide" data-act="saveSkincare" style="margin-top:14px;">保存</button>
  `);
};

window.handleSaveSkincare = function() {
  const name = document.getElementById('prodName').value;
  const cat = document.getElementById('prodCat').value;
  const openDate = document.getElementById('prodOpenDate').value;
  const shelf = parseInt(document.getElementById('prodShelf').value) || 12;
  const ingr = document.getElementById('prodIngr').value;
  if(!name) { toast('请输入名称'); return; }
  
  const expiryDate = calcExpiryDate(openDate, shelf);
  skincareLib.push({ id: Date.now().toString(), name, category: cat, openDate, shelfLife: shelf, expiryDate, ingredients: ingr });
  saveSkincareLib(); closeSheet(); render(); toast('添加成功');
};

window.autoRecommend = function(phase) {
  const routine = phase === 'morning' ? skincareRoutine.morning : skincareRoutine.night;
  skincareLib.forEach(p => {
    let stepId = '';
    if (p.category === '洁面') stepId = phase === 'morning' ? 'm_clean' : 'n_clean';
    else if (p.category === '水') stepId = phase === 'morning' ? 'm_water' : 'n_water';
    else if (p.category === '精华') stepId = phase === 'morning' ? 'm_serum' : 'n_serum';
    else if (p.category === '乳霜') stepId = phase === 'morning' ? 'm_cream' : 'n_cream';
    else if (p.category === '防晒' && phase === 'morning') stepId = 'm_sun';
    
    if (stepId) {
      const exist = routine.find(x => x.stepId === stepId);
      if (!exist) routine.push({ stepId, prodId: p.id }); else exist.prodId = p.id;
    }
  });
  saveSkincareRoutine(); render(); toast('✨ 已根据护肤库为您分配产品');
};
