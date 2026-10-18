window.getSportSessions = function(){ return LS.get('app_h_sportSessions', {}); };
window.saveSportSession = function(sess){
  const all = getSportSessions();
  if(sess) all[todayStr()] = sess; else delete all[todayStr()];
  LS.set('app_h_sportSessions', all);
};

window.lifeView = function(){
  const sub = state.lifeSub || 'money';
  const mainTabs = [{ id:'money', label:'记账' },{ id:'sport', label:'运动' },{ id:'calendar', label:'日历' },{ id:'care', label:'护肤' }];
  const titles = { money:'记账', sport:'运动打卡', calendar:'日历', care:'护肤' };
  let content = '';
  if (sub === 'money') content = moneySection();
  else if (sub === 'sport') content = sportSection();
  else if (sub === 'calendar') content = calendarSection();
  else if (sub === 'care') content = careSection();
  
  return `<div class="hero"><div class="hero-k">生活 · 记录</div><h1>${titles[sub]}</h1></div>
  <div class="subtabs">${mainTabs.map(t => `<button class="subtab ${t.id===sub?'on':''}" data-act="lifeSub" data-sub="${t.id}">${t.label}</button>`).join('')}</div>
  <div>${content}</div>`;
};

function sportSection(){
  const sess = getSportSessions()[todayStr()];
  let html = `<div class="card" style="background:linear-gradient(135deg,var(--hot),var(--hot2));color:#fff;border:0;"><div style="font-size:19px;font-weight:750;">今日运动</div></div>`;
  if(!sess) {
    html += `<div class="card"><button class="btn-primary" data-act="startSport">▶ 开始打卡</button></div>`;
  } else {
    const start = new Date(sess.startTs).toLocaleTimeString();
    html += `<div class="card">
      <div class="row-between"><span>开始时间</span><b>${start}</b></div>
      <button class="btn-ghost-h" data-act="endSport" style="margin-top:10px;">■ 结束打卡</button>
    </div>`;
  }
  return html;
}

function calendarSection(){
  return `<div class="card"><div style="text-align:center;padding:40px;color:var(--sub);">日历功能展示区</div></div>`;
}
