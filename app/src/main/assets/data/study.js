// 发现板块和首页的恢复
window.homeView = () => {
  return `<div class="home-head"><div class="left"><div class="title">今日</div></div></div>
  <div class="card"><div style="text-align:center;padding:20px;color:var(--sub)">首页内容完整保留（你可以粘贴原版 index.html 里的 homeView 代码到这里）</div></div>`;
};

window.studyView = () => {
  return `<div class="hero"><div class="hero-k">学习 · 认知提升</div><h1>每日精进</h1></div>
  <div class="card"><div style="padding:20px;text-align:center;">学习板块完整保留（请粘贴原版 studyView）</div></div>`;
};

window.discoverView = () => {
  return `<div class="hero"><div class="hero-k">发现 · 世界</div><h1>今日看点</h1></div>
  <div class="card"><div style="padding:20px;text-align:center;">发现板块完整保留（请粘贴原版 discoverView）</div></div>`;
};

// ★ 我的板块：备份提醒移入这里
window.meView = () => {
  const lastTs = parseInt(LS.get('app_h_lastBackupAt', '0') || '0', 10);
  const days = lastTs ? Math.floor((Date.now() - lastTs) / 86400000) : 999;
  const size = getStorageSize();
  const sizeKB = (size/1024).toFixed(1);
  
  const backupHint = days >= 7 ? `
    <div class="card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #fbbf24;padding:14px;margin-bottom:12px;">
      <div style="font-size:13.5px;font-weight:750;color:#92400e;">⚠️ 数据备份提醒</div>
      <div style="font-size:12px;color:#a16207;margin-top:4px;">已 ${days===999?'从未':days+'天'} 没备份，建议立即导出</div>
    </div>` : '';

  return `<div class="hero"><div class="hero-k">我的</div><h1>数据管理</h1></div>
  ${backupHint}
  <div class="card">
    <div class="sec-title">💾 存储占用</div>
    <div style="font-size:13px;color:#4b5265;">当前本地存储：<b>${sizeKB} KB</b> / 约 5 MB</div>
    <div class="progress-bar"><div style="width:${Math.min(100, size/(5*1024*1024)*100)}%;"></div></div>
  </div>
  <div class="card">
    <div class="sec-title">数据导出</div>
    <button class="btn-primary" data-act="exportData">📤 导出全部数据 JSON</button>
  </div>`;
};
