window.DAY = Math.floor((Date.now() + 8*3600*1000) / 86400000);
window.WEEK_CN = '日一二三四五六';

window.bjDate = function(){ return new Date(Date.now() + 8*3600*1000); };
window.todayStr = function(){ const d = bjDate(); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); };
window.prevDayStr = function(){ const d = new Date(Date.now()-86400000+8*3600*1000); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); };
window.pad = function(n){ return String(n).padStart(2,'0'); };
window.fmtTime = function(d){ return pad(d.getHours())+':'+pad(d.getMinutes()); };
window.esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); };

window.LS = {
  get(k,d){ try { const v=localStorage.getItem(k); return v===null?d:JSON.parse(v); } catch(e){ return d; } },
  set(k,v){
    try { localStorage.setItem(k, JSON.stringify(v)); } 
    catch(e){ console.error('LS.set 失败', e); if(window.toast) toast('⚠️ 存储已满'); }
  },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};

window.toast = function(msg){
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.querySelector('.phone').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 1900);
};

window.normalizeTimeStr = function(t){
  if (t == null) return '--:--';
  const s = String(t).trim();
  if (!s) return '--:--';
  let m = s.match(/^(\d{1,2}):(\d{1,2})/);
  if (m) return pad(parseInt(m[1],10)) + ':' + pad(parseInt(m[2],10));
  const n = parseFloat(s);
  if (!isNaN(n) && n >= 0 && n < 1){
    const totalMin = Math.round(n * 24 * 60);
    return pad(Math.floor(totalMin/60)) + ':' + pad(totalMin%60);
  }
  return s;
};

window.getStorageSize = function(){
  let total = 0;
  try { Object.keys(localStorage).forEach(k => { const v = localStorage.getItem(k); if (v != null) total += k.length + v.length; }); } catch(e){}
  return total;
};

window.state = {
  tab:'home', lifeSub:'money', moneySub:'record', careSub:'routine',
  pendingTx: null,
  _pendingImport: null
};

window.openSheet = function(html){
  const sheet = document.getElementById('sheet');
  sheet.innerHTML = `<div class="sheet-mask" data-act="closeSheet"></div><div class="sheet-body">${html}</div>`;
  requestAnimationFrame(() => sheet.classList.add('open'));
};
window.closeSheet = function(){
  const sheet = document.getElementById('sheet');
  sheet.classList.remove('open');
  setTimeout(() => { if (!sheet.classList.contains('open')) sheet.innerHTML = ''; }, 320);
};
