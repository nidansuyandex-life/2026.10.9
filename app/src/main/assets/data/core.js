window.DAY = Math.floor((Date.now() + 8*3600*1000) / 86400000);
window.WEEK_CN = '日一二三四五六';
window.bjDate = () => new Date(Date.now() + 8*3600*1000);
window.todayStr = () => { const d = bjDate(); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); };
window.prevDayStr = () => { const d = new Date(Date.now()-86400000+8*3600*1000); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); };
window.pad = n => String(n).padStart(2,'0');
window.fmtTime = d => pad(d.getHours())+':'+pad(d.getMinutes());
window.esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

window.LS = {
  get(k,d){ try { const v=localStorage.getItem(k); return v===null?d:JSON.parse(v); } catch(e){ return d; } },
  set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
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
  const s = String(t).trim(); if (!s) return '--:--';
  let m = s.match(/^(\d{1,2}):(\d{1,2})/);
  if (m) return pad(parseInt(m[1],10)) + ':' + pad(parseInt(m[2],10));
  const n = parseFloat(s);
  if (!isNaN(n) && n >= 0 && n < 1){ const tm = Math.round(n * 1440); return pad(Math.floor(tm/60)) + ':' + pad(tm%60); }
  return s;
};

window.state = { tab:'home', studySub:'today', moneySub:'record', lifeSub:'money', careSub:'routine', pendingTx:null };

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

let _currentSpeakBtn = null, _speakSeq = 0;
window.stopSpeak = function(){
  try { if (window.AndroidTTS && AndroidTTS.stopSpeak) AndroidTTS.stopSpeak(); } catch(e){}
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch(e){}
  document.querySelectorAll('.playing').forEach(b => b.classList.remove('playing'));
  _currentSpeakBtn = null; _speakSeq++;
};
window.toggleSpeak = function(text, lang, btn){
  if (!text) { toast('没有内容'); return; }
  const wasPlaying = btn && btn.classList.contains('playing');
  stopSpeak(); if (wasPlaying) return;
  const seq = ++_speakSeq;
  if (btn) { btn.classList.add('playing'); _currentSpeakBtn = btn; }
  if (window.AndroidTTS && typeof AndroidTTS.speak === 'function'){
    AndroidTTS.speak(String(text), lang || 'zh-CN');
    const ms = Math.max(1500, Math.min(60000, String(text).length * 200));
    setTimeout(() => { if (seq === _speakSeq && _currentSpeakBtn) { _currentSpeakBtn.classList.remove('playing'); _currentSpeakBtn = null; } }, ms);
  }
};
