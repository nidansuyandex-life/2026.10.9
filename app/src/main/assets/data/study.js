window.studyView = function(){
  const sub = state.studySub || 'today';
  const subs = [{ id:'today', label:'今日' }, { id:'english', label:'英语' }, { id:'valve', label:'专业' }];
  let content = '';
  if (sub === 'today') {
    content = `<div class="card"><div style="text-align:center;padding:20px;font-weight:600;">今日学习任务加载完成</div></div>`;
  } else if (sub === 'english') {
    content = `<div class="card"><div style="text-align:center;padding:20px;">英语单词模块 (数据结构保留)</div></div>`;
  } else if (sub === 'valve') {
    content = `<div class="card"><div style="text-align:center;padding:20px;">阀门知识模块 (数据结构保留)</div></div>`;
  }
  return `<div class="hero"><div class="hero-k">学习</div><h1>每日进步</h1></div>
  <div class="subtabs">${subs.map(x => `<button class="subtab ${x.id===sub?'on':''}" data-act="studySub" data-sub="${x.id}">${x.label}</button>`).join('')}</div>
  <div>${content}</div>`;
};
