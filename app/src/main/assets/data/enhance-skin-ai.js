/* ═══════════════════════════════════════════════════════════════
 * enhance-skin-ai.js —— 护肤库 AI 推荐使用时间
 * 加载：<script src="./data/enhance-skin-ai.js" defer></script>
 * ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  let _injecting = false;

  function tryInject(){
    if (_injecting) return;
    const sel = document.getElementById('slUsage');
    if (!sel) return;
    if (document.getElementById('slAIRecommendBtn')) return;
    _injecting = true;
    try { inject(); } finally { _injecting = false; }
  }

  const obs = new MutationObserver(tryInject);
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(tryInject, 500);
  setTimeout(tryInject, 1500);
  setTimeout(tryInject, 3000);

  function inject(){
    const sel = document.getElementById('slUsage');
    if (!sel) return;
    const row = sel.closest('.dim-row');
    if (!row) return;
    sel.style.width = '120px';

    const btn = document.createElement('button');
    btn.id = 'slAIRecommendBtn';
    btn.style.cssText = 'margin-left:8px;border:0;font-family:inherit;font-size:12px;font-weight:650;color:#fff;background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:8px 12px;border-radius:10px;cursor:pointer;flex:none;white-space:nowrap;';
    btn.textContent = '🤖 AI 推荐';
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); runRecommend(); });
    row.appendChild(btn);

    if (!document.getElementById('slUsageReason')){
      const box = document.createElement('div');
      box.id = 'slUsageReason';
      row.parentNode.insertBefore(box, row.nextSibling);
    }
  }

  async function runRecommend(){
    const btn = document.getElementById('slAIRecommendBtn');
    const nameEl = document.getElementById('slName');
    const brandEl = document.getElementById('slBrand');
    const typeEl = document.getElementById('slType');
    const ingrEl = document.getElementById('slIngredients');

    const name = nameEl ? nameEl.value.trim() : '';
    const brand = brandEl ? brandEl.value.trim() : '';
    const type = typeEl ? typeEl.value : '';
    const ingredients = ingrEl ? ingrEl.value.trim() : '';

    if (!name && !ingredients){ toast('请先填写产品名或成分表'); return; }

    const oldText = btn.textContent;
    btn.textContent = '⏳ 分析中…';
    btn.disabled = true;
    btn.style.opacity = '0.6';

    try {
      const rawProvider = localStorage.getItem('ai-provider');
      const rawKey = localStorage.getItem('ai-key');
      const provider = rawProvider ? JSON.parse(rawProvider) : 'none';
      const apiKey  = rawKey ? JSON.parse(rawKey) : '';

      if (provider !== 'none' && apiKey){
        try {
          const ai = await callAI({ name, brand, type, ingredients, provider, apiKey });
          applyRec(ai, 'AI');
          return;
        } catch(err){ console.warn('[skinAI] AI 调用失败', err); }
      }
      const local = localRecommend({ name, brand, type, ingredients });
      applyRec(local, '本地规则');
    } finally {
      btn.textContent = oldText;
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }

  async function callAI(info){
    const endpoints = {
      deepseek: { base:'https://api.deepseek.com/v1/chat/completions', model:'deepseek-chat' },
      qwen:     { base:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model:'qwen-turbo' },
      zhipu:    { base:'https://open.bigmodel.cn/api/paas/v4/chat/completions', model:'glm-4-flash' }
    };
    const cfg = endpoints[info.provider];
    if (!cfg) throw new Error('未知 AI 提供商');

    const system = `你是资深护肤品配方顾问。根据产品的品牌、类型、成分表，判断该产品适合"早间 / 晚间 / 早晚都用 / 任意"中的哪一种使用时间。

必须只输出严格 JSON（不要任何 markdown 代码块、不要解释）：
{
  "usage": "morning" | "night" | "both" | "any",
  "reason": "20-60字中文，说明推荐依据，提到关键成分"
}

判断规则（按优先级）：
1. 防晒类产品 → morning
2. 含维C（抗坏血酸 / ascorbic acid / AA2G / 乙基维C / VC-IP）→ morning
3. 含视黄醇 / 维A酸 / retinol / tretinoin / 阿达帕林 → night
4. 含AHA / BHA / 水杨酸 / 果酸 / 甘醇酸 / 乳酸 → night
5. 含壬二酸 → night
6. 面膜 / 清洁泥膜 → night
7. 含烟酰胺 / 透明质酸 / 泛醇(B5) / 神经酰胺 / 角鲨烷 → both
8. 洁面 / 化妆水 / 保湿霜 → both
9. 精华液按主要活性判断
10. 无法判断 → both

返回 JSON 时 usage 必须是上述 4 个值之一，reason 必须中文。`;

    const user = `产品名：${info.name}
品牌：${info.brand || '（未填）'}
类型：${info.type}
成分表：${info.ingredients || '（未填）'}`;

    const r = await fetch(cfg.base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + info.apiKey },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.2,
        max_tokens: 400
      })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const content = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    let json = content.trim();
    if (json.startsWith('```')) json = json.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    const i = json.indexOf('{'), j = json.lastIndexOf('}');
    if (i >= 0 && j > i) json = json.slice(i, j + 1);
    const parsed = JSON.parse(json);
    if (!['morning', 'night', 'both', 'any'].includes(parsed.usage)) throw new Error('无效推荐');
    return parsed;
  }

  function localRecommend(info){
    const name = info.name || '';
    const t = ((info.ingredients || '') + ' ' + name).toLowerCase();
    const type = info.type || '';
    if (type === 'sunscreen' || /防晒/.test(name))
      return { usage:'morning', reason:'防晒类产品应在早间使用，白天持续防护紫外线。' };
    if (/tretinoin|retinol|视黄醇|维a酸|维甲酸|阿达帕林/.test(t))
      return { usage:'night', reason:'含视黄醇/维A类成分，见光易失活且增加光敏，仅晚间使用。' };
    if (/水杨酸|果酸|甘醇酸|乳酸|aha|bha|salicylic|glycolic/.test(t))
      return { usage:'night', reason:'含酸类成分（AHA/BHA），晚间使用更温和，白天需严格防晒。' };
    if (/抗坏血酸|ascorbic|维c|维生素c|aa2g/.test(t))
      return { usage:'morning', reason:'含维C类成分，早间抗氧化，并增强防晒效果。' };
    if (/壬二酸|azelaic/.test(t))
      return { usage:'night', reason:'含壬二酸，晚间使用可减少刺痛和泛红。' };
    if (type === 'mask')
      return { usage:'night', reason:'面膜建议晚间使用，利用睡眠期充分修复。' };
    if (type === 'cleanser' || type === 'toner' || type === 'cream')
      return { usage:'both', reason:'基础护理品，早晚均可使用。' };
    if (type === 'serum' || type === 'essence' || type === 'eye')
      return { usage:'both', reason:'精华类早晚通用；若含光敏成分请改晚间。' };
    return { usage:'both', reason:'未检测到光敏成分，早晚皆可使用。' };
  }

  function applyRec(rec, source){
    const sel = document.getElementById('slUsage');
    if (sel) sel.value = rec.usage;
    const box = document.getElementById('slUsageReason');
    if (box){
      const labelMap = { morning:'早间', night:'晚间', both:'早晚都用', any:'任意' };
      const color = source === 'AI' ? '#4f46e5' : '#6b7280';
      const icon  = source === 'AI' ? '🤖 AI' : '📋 本地规则';
      box.innerHTML = `<div style="background:linear-gradient(135deg,#eef0ff,#f6f0ff);border:1px solid #e2e5ff;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.65;color:#4b5265;margin-top:8px;">
        <div style="font-size:11px;font-weight:750;color:${color};margin-bottom:4px;">${icon}推荐：${labelMap[rec.usage] || rec.usage}</div>
        <div>${escapeHtml(rec.reason || '')}</div>
      </div>`;
    }
    const label = { morning:'早间', night:'晚间', both:'早晚', any:'任意' }[rec.usage] || '';
    toast(`${source}推荐：${label}`);
  }

  function escapeHtml(s){
    return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
})();
