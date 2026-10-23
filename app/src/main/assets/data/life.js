window.getSportSessions = () => LS.get('app_h_sportSessions', {});
window.saveSportSession = (sess) => {
  const all = getSportSessions();
  if(sess) all[todayStr()] = sess; else delete all[todayStr()];
  LS.set('app_h_sportSessions', all);
};

window.lifeView = function(){
  const sub = state.lifeSub || 'money';
  const mainTabs = [{ id:'money', label:'记账' },{ id:'sport', label:'运动' },{ id:'care', label:'护肤' }];
  let content = '';
  if (sub === 'money') content = moneySection();
  else if (sub === 'sport') content = sportSection();
  else if (sub === 'care') content = careSection();
  
  return `<div class="hero"><div class="hero-k">生活</div><h1>${sub==='money'?'记账':sub==='sport'?'运动':'护肤'}</h1></div>
  <div class="subtabs">${mainTabs.map(t => `<button class="subtab ${t.id===sub?'on':''}" data-act="lifeSub" data-sub="${t.id}">${t.label}</button>`).join('')}</div>
  <div>${content}</div>`;
};

function sportSection(){
  const sess = getSportSessions()[todayStr()];
  let html = `<div class="card" style="background:linear-gradient(135deg,var(--hot),var(--hot2));color:#fff;"><div style="font-size:19px;font-weight:750;">今日运动计划</div></div>`;
  if(!sess) html += `<div class="card"><button class="btn-primary" data-act="startSport">▶ 开始运动打卡</button></div>`;
  else html += `<div class="card"><div style="font-size:13px;margin-bottom:10px;color:var(--ok)">✓ 运动已开始</div><button class="btn-ghost-h" data-act="endSport">■ 结束运动</button></div>`;
  return html;
}
