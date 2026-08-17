// ============================================================
// 《你是什么东西》交互逻辑
// 计分规则（03 文档）：每题 A=-1 / B=+1，每维 7 题，-7..+7
// >0 判右极，<0 判左极；彩蛋题（dim=null）不计分
//
// 模式（转化优化）：
//   full    = 完整版 30 题（每维 7 题）
//   quick   = 快测版 12 题（每维抽第 1/4/7 题，3 题为奇数，无平局）
//   upgrade = 快测完成后补 18 题升级完整档案（快测分保留累加）
// 断点续答：localStorage 存进度，回访时封面显示"继续上次测试"
// ============================================================

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var DIMS = ['EI', 'SN', 'TF', 'JP'];
  var LEFT_LABEL = { EI: 'E', SN: 'S', TF: 'T', JP: 'J' };
  var RIGHT_LABEL = { EI: 'I', SN: 'N', TF: 'F', JP: 'P' };
  var GALLERY_ORDER = ['ESTJ','ESTP','ESFJ','ESFP','ENTJ','ENTP','ENFJ','ENFP',
                       'ISTJ','ISTP','ISFJ','ISFP','INTJ','INTP','INFJ','INFP'];

  // ---------- 模式与题目列表 ----------
  var MODE_FULL = 'full', MODE_QUICK = 'quick', MODE_UPGRADE = 'upgrade';
  var currentMode = MODE_FULL;
  // 快测每维抽 3 题：该维第 1/4/7 题（下标：EI:0,12,25 / SN:1,13,26 / TF:2,15,27 / JP:3,16,28）
  var QUICK_PICKS = [0, 12, 25, 1, 13, 26, 2, 15, 27, 3, 16, 28];
  function questionList(mode) {
    if (mode === MODE_QUICK) {
      return QUICK_PICKS.map(function (i) { return QUESTIONS[i]; });
    }
    if (mode === MODE_UPGRADE) {
      return QUESTIONS.filter(function (q, i) { return QUICK_PICKS.indexOf(i) < 0; });
    }
    return QUESTIONS;
  }

  var scores = {};        // 每维得分
  var idx = 0;            // 当前题在 questionList 中的下标
  var myCode = null;      // 我的结果代码
  var viewingCode = null; // 当前查看的人格代码
  var ARCHIVE_KEY = 'wa_archives';
  var PROGRESS_KEY = 'wa_progress';
  var IS_WECHAT = /MicroMessenger/i.test(navigator.userAgent);
  // 正式线上地址：分享/二维码一律用它。
  // location.href 在本地测试（file:// / localhost）时会生成别人打不开的链接，
  // 所以只有当前确实在正式域名上时才保留当前 URL（可带 ?v= 参数绕微信缓存）。
  var SHARE_URL = 'https://hikaoxx-tech.github.io/what-are-you/';
  function shareUrl() {
    return location.hostname === 'hikaoxx-tech.github.io' ? location.href : SHARE_URL;
  }
  // ---------- 百度统计 ----------
  // hm.js 加载后自动上报 PV；这里统一埋自定义事件，用于"事件分析"看转发意图
  function track(action) {
    try {
      if (window._hmt && window._hmt.push) {
        window._hmt.push(['_trackEvent', '人格测试', action]);
      }
    } catch (e) {}
  }

  var TEASER_IDX = [2, 9, 10]; // 封面试读题：Q3 / Q10 / Q11
  var teaserPos = 0;
  var LOADING_LINES = [
    '正在分析你的灵魂…',
    '正在调取地狱档案库…',
    '正在翻你的旧账…',
    '正在给你的物种做鉴定…',
    '正在通知你的动物来认领你…'
  ];

  function initScores() {
    DIMS.forEach(function (d) { scores[d] = 0; });
  }

  function showPage(id) {
    ['page-start', 'page-quiz', 'page-loading', 'page-result', 'page-gallery'].forEach(function (p) {
      $(p).classList.toggle('hidden', p !== id);
    });
    window.scrollTo(0, 0);
  }

  // ---------- 断点续答：进度存取 ----------

  function saveProgress() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        mode: currentMode, idx: idx, scores: scores, done: false, ts: Date.now()
      }));
    } catch (e) {}
  }

  // 快测答完：保留进度（done=true），供"升级补测"恢复
  function saveQuickDone() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        mode: MODE_QUICK, idx: idx, scores: scores, done: true, ts: Date.now()
      }));
    } catch (e) {}
  }

  function clearProgress() {
    try { localStorage.removeItem(PROGRESS_KEY); } catch (e) {}
  }

  function readProgress() {
    try {
      var p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
      if (!p || !p.scores) { return null; }
      return p;
    } catch (e) { return null; }
  }

  function resumeLabel(p) {
    if (p.done && p.mode === MODE_QUICK) { return '继续升级完整档案（还差 18 题）'; }
    var list = questionList(p.mode);
    var total = list.length;
    var tag = p.mode === MODE_QUICK ? '快测' : (p.mode === MODE_UPGRADE ? '补测' : '');
    return '继续上次测试（' + tag + '第 ' + (Math.min(p.idx, total - 1) + 1) + ' / ' + total + ' 题）';
  }

  function renderResume() {
    var p = readProgress();
    var btn = $('btn-resume');
    if (!p) { btn.classList.add('hidden'); return; }
    btn.textContent = resumeLabel(p);
    btn.classList.remove('hidden');
  }

  // ---------- 封面试读题 / 归档计数 / 动物条 ----------

  function renderTeaser() {
    var q = QUESTIONS[TEASER_IDX[teaserPos]];
    $('ct-num').textContent = TEASER_IDX[teaserPos] + 1;
    $('ct-q').textContent = q.q;
    var box = $('ct-opts');
    box.innerHTML = '';
    [q.a, q.b].forEach(function (text, i) {
      var div = document.createElement('div');
      div.className = 'ct-opt';
      div.innerHTML = '<span class="ct-letter">' + (i === 0 ? 'A' : 'B') + '</span><span></span>';
      div.lastChild.textContent = text;
      box.appendChild(div);
    });
  }

  function cycleTeaser() {
    var el = $('cover-teaser');
    el.classList.add('fade-out');
    setTimeout(function () {
      teaserPos = (teaserPos + 1) % TEASER_IDX.length;
      renderTeaser();
      el.classList.remove('fade-out');
    }, 350);
  }

  function readArchives() {
    try { return parseInt(localStorage.getItem(ARCHIVE_KEY) || '0', 10) || 0; }
    catch (e) { return 0; }
  }

  function bumpArchives() {
    try { localStorage.setItem(ARCHIVE_KEY, String(readArchives() + 1)); } catch (e) {}
  }

  function renderArchiveCount() {
    $('cover-file').textContent = '16 种人格待归档 · 本机已归档 ' + readArchives() + ' 份';
  }

  function renderAnimalStrip() {
    var box = $('ca-icons');
    box.innerHTML = '';
    GALLERY_ORDER.forEach(function (code) {
      var img = document.createElement('img');
      img.src = iconUrl(code);
      img.alt = '';
      img.onerror = function () { this.style.display = 'none'; };
      box.appendChild(img);
    });
  }

  // ---------- 答题 ----------

  function renderQuestion() {
    var list = questionList(currentMode);
    var q = list[idx];
    $('q-count').textContent = '第 ' + (idx + 1) + ' / ' + list.length + ' 题';
    $('q-bar').style.width = ((idx + 1) / list.length * 100) + '%';

    // 模式标签：快测 / 补测
    var modeTag = $('q-mode');
    if (currentMode === MODE_QUICK) {
      modeTag.textContent = '快测';
      modeTag.classList.remove('hidden');
    } else if (currentMode === MODE_UPGRADE) {
      modeTag.textContent = '补测';
      modeTag.classList.remove('hidden');
    } else {
      modeTag.classList.add('hidden');
    }

    // 换题动画（重触发）
    var title = $('q-title');
    title.textContent = q.q;
    title.classList.remove('q-anim');
    void title.offsetWidth;
    title.classList.add('q-anim');

    var box = $('q-options');
    box.innerHTML = '';
    [q.a, q.b].forEach(function (text, i) {
      var btn = document.createElement('button');
      btn.className = 'option';
      btn.textContent = text;
      btn.style.animationDelay = (120 + i * 90) + 'ms'; // slide-up stagger
      btn.addEventListener('click', function () { choose(i, btn); });
      box.appendChild(btn);
    });
  }

  function choose(i, btn) {
    var list = questionList(currentMode);
    var q = list[idx];
    if (q.dim) { scores[q.dim] += (i === 0 ? -1 : 1); }

    btn.classList.add('selected');
    $('q-options').querySelectorAll('.option').forEach(function (b) { b.disabled = true; });

    setTimeout(function () {
      idx++;
      if (idx < list.length) {
        saveProgress();
        renderQuestion();
      } else {
        finishQuiz();
      }
    }, 260);
  }

  // 答完当前模式的题：快测 → 快测结果页（保留进度可升级）；其余 → 完整结果
  function finishQuiz() {
    if (currentMode === MODE_QUICK) {
      track('快测完成');
      saveQuickDone();
    } else {
      if (currentMode === MODE_UPGRADE) { track('升级完成'); }
      else { track('完成测试'); }
      clearProgress();
      currentMode = MODE_FULL; // 升级/完整版完成后按完整版渲染（稀有度徽章出现）
    }
    showPage('page-loading');
    $('loading-main').textContent =
      LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
    setTimeout(function () { showResult(true); }, 1500); // 1.5s 仪式感
  }

  // ---------- 结果 ----------

  function computeCode() {
    var code = '';
    DIMS.forEach(function (d) {
      code += scores[d] > 0 ? RIGHT_LABEL[d] : LEFT_LABEL[d];
    });
    return code;
  }

  // 二维码带 ?src=qr 参数：扫码进入的访客可单独统计（转发代理指标之一）
  function qrUrl() {
    var u = shareUrl();
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'src=qr';
  }

  function makeQR() {
    var qr = $('qrcode');
    qr.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qr, { text: qrUrl(), width: 84, height: 84, colorDark: '#2B2F36' });
    }
  }

  function renderScales() {
    var box = $('r-scales');
    box.innerHTML = '';
    DIMS.forEach(function (d) {
      var s = scores[d];
      var ratio = Math.abs(s) / 7;          // 偏向强度 0..1
      var width = Math.max(6, 50 * ratio);  // 最小可见宽度 6%

      var row = document.createElement('div');
      row.className = 'scale';
      row.innerHTML =
        '<div class="scale-label"><span>' + LEFT_LABEL[d] + '</span><span>' + RIGHT_LABEL[d] + '</span></div>' +
        '<div class="scale-track">' +
          '<div class="scale-fill" style="left:' + (s > 0 ? '50%' : 'calc(50% - ' + width + '%)') + ';width:' + width + '%;"></div>' +
        '</div>';
      box.appendChild(row);
    });
  }

  // 稀有度：按答题极端度计算（Social Currency：炫耀点）
  // 满 7 分极端 = SSR，6 = SR，5 = R，其余 = N
  function rarityOf() {
    var max = 0;
    DIMS.forEach(function (d) { max = Math.max(max, Math.abs(scores[d])); });
    if (max === 7) { return 'SSR · 稀有物种'; }
    if (max >= 6) { return 'SR · 稀缺物种'; }
    if (max >= 5) { return 'R · 常见物种'; }
    return 'N · 满大街都是';
  }

  // 人格图标：单文件构建版使用内联 EMBED_ICONS（data URI），
  // 源码版回退到本地 assets/animals/ 路径
  function iconUrl(code) {
    if (window.EMBED_ICONS && EMBED_ICONS[code]) { return EMBED_ICONS[code]; }
    return 'assets/animals/' + code + '.svg';
  }

  function setIcon(img, code) {
    var url = iconUrl(code);
    if (url) {
      img.src = url;
      img.style.display = 'block';
      img.onerror = function () { this.style.display = 'none'; };
    } else {
      img.style.display = 'none';
    }
  }

  function renderType(t, mine) {
    setIcon($('r-icon'), t.code);
    $('r-name').textContent = t.name;
    $('r-animal').textContent = '官方认证动物：' + t.animal;
    $('r-conflict').textContent = t.conflict;
    $('r-judgment').textContent = t.judgment;

    var ol = $('r-prescription');
    ol.innerHTML = '';
    t.prescription.forEach(function (line) {
      var li = document.createElement('li');
      li.textContent = line;
      ol.appendChild(li);
    });

    $('r-file').textContent = t.file;
    $('r-easter').textContent = '彩蛋：' + t.easter;

    // 日常触发（Triggers）：高频生活场景，让人在生活里反复想起它
    $('r-trigger').textContent = t.trigger + '，想想自己是哪种东西';

    // 转发对象（Practical Value）：窄受众 = 更愿意转发
    $('give-text').textContent = t.giveTo;

    // 稀有度徽章：仅完整版（快测版无极端度，显示会失真）
    var rarity = $('r-rarity');
    var showRarity = mine && currentMode !== MODE_QUICK;
    rarity.classList.toggle('hidden', !showRarity);
    if (showRarity) { rarity.textContent = rarityOf(); }

    // 转发挑战：只有"我的结果"才显示
    $('share-challenge').classList.toggle('hidden', !mine);
    if (mine) {
      $('sc-text').textContent = '我测出来是「' + t.name + '·' + t.animal + '」，你是什么东西？ ' + shareUrl();
    }
  }

  // 盖章动画（全站签名时刻）：每次结果渲染重触发
  function stampResult() {
    var stamp = document.querySelector('#result-card .stamp');
    if (stamp) {
      stamp.classList.remove('stamp-strike');
      void stamp.offsetWidth;
      stamp.classList.add('stamp-strike');
    }
  }

  function showResult(mine) {
    var code = mine ? computeCode() : viewingCode;
    if (mine) {
      myCode = code;
      bumpArchives();
      renderArchiveCount();
    }
    viewingCode = code;

    renderType(TYPES[code], mine);
    renderScales();

    // 查看他人档案时刻度显示 0（无得分信息）
    if (!mine) {
      $('r-scales').querySelectorAll('.scale-fill').forEach(function (f) { f.style.display = 'none'; });
    }

    // 快测注记 + 升级按钮（仅"我的结果"且处于快测态）
    var isQuick = mine && currentMode === MODE_QUICK;
    $('r-quick-note').classList.toggle('hidden', !isQuick);
    $('btn-upgrade').classList.toggle('hidden', !isQuick);

    $('btn-back-mine').classList.toggle('hidden', mine);
    showPage('page-result');
    makeQR(); // 页面可见后再生成二维码
    stampResult();
  }

  // ---------- 全部人格 ----------

  function renderGallery() {
    var grid = $('gallery-grid');
    grid.innerHTML = '';
    GALLERY_ORDER.forEach(function (code) {
      var t = TYPES[code];
      var card = document.createElement('div');
      card.className = 'g-card' + (code === myCode ? ' mine' : '');
      card.innerHTML =
        '<img class="g-icon" src="' + iconUrl(code) + '" onerror="this.style.display=\'none\'">' +
        '<div class="g-name">' + t.name + '</div>' +
        (code === myCode ? '<span class="g-badge">就是你</span>' : '');
      card.addEventListener('click', function () {
        viewingCode = code;
        renderType(TYPES[code], false);
        renderScales();
        $('r-scales').querySelectorAll('.scale-fill').forEach(function (f) { f.style.display = 'none'; });
        $('btn-back-mine').classList.remove('hidden');
        showPage('page-result');
        makeQR();
        stampResult();
      });
      grid.appendChild(card);
    });
  }

  // ---------- 事件绑定 ----------

  function startQuiz(mode) {
    clearProgress();
    currentMode = mode;
    idx = 0;
    initScores();
    renderQuestion();
    showPage('page-quiz');
  }

  $('btn-start').addEventListener('click', function () {
    startQuiz(MODE_FULL);
  });

  $('btn-start-quick').addEventListener('click', function () {
    track('开始快测');
    startQuiz(MODE_QUICK);
  });

  // 断点续答
  $('btn-resume').addEventListener('click', function () {
    var p = readProgress();
    if (!p) { renderResume(); return; }
    track('恢复进度');
    currentMode = p.mode;
    scores = p.scores; // 恢复已得分数（快测分保留给补测累加）
    if (p.done && p.mode === MODE_QUICK) {
      // 快测已完成 → 直接进入补测阶段
      currentMode = MODE_UPGRADE;
      idx = 0;
      saveProgress();
    } else {
      idx = p.idx || 0;
    }
    renderQuestion();
    showPage('page-quiz');
  });

  // 快测结果页 → 补 18 题升级完整档案
  $('btn-upgrade').addEventListener('click', function () {
    track('升级补测');
    currentMode = MODE_UPGRADE;
    idx = 0;
    saveProgress(); // scores 已含快测分，继续累加
    renderQuestion();
    showPage('page-quiz');
  });

  $('btn-restart').addEventListener('click', function () {
    startQuiz(MODE_FULL);
  });

  $('btn-back-mine').addEventListener('click', function () {
    showResult(true);
  });

  $('btn-gallery').addEventListener('click', function () {
    renderGallery();
    showPage('page-gallery');
  });

  $('btn-gallery-back').addEventListener('click', function () {
    showResult(true);
  });

  // 渲染分享卡片（截图源）：居中卡片式分享图
  // 内容 = 印章 + 动物大图 + 人格名 + 稀有度 + 地狱判决首句 + 二维码
  function renderShareCard() {
    var t = TYPES[viewingCode];
    setIcon($('sc-icon'), viewingCode);
    $('sc-name').textContent = t.name;
    $('sc-animal').textContent = '官方认证动物：' + t.animal;
    // 稀有度仅"我的结果"完整版显示（快测版无极端度，显示会失真）
    var rarity = $('sc-rarity');
    var showRarity = viewingCode === myCode && currentMode !== MODE_QUICK;
    rarity.classList.toggle('hidden', !showRarity);
    if (showRarity) { rarity.textContent = rarityOf(); }
    // 地狱判决取第一句（开篇句通常最狠，也保证卡片内放得下）
    var first = t.judgment.split('。')[0];
    $('sc-quote').textContent = first + '。';
    // 二维码：带 ?src=qr 参数统计扫码回流（canvas 承载，html2canvas 对 canvas 渲染正常）
    var qr = $('sc-qr');
    qr.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qr, { text: qrUrl(), width: 112, height: 112, colorDark: '#2B2F36' });
    }
  }

  // 等卡片内的动物图标真正加载完再截图（避免截到空白；加载失败也继续，不阻塞）
  function waitIconLoaded(done) {
    var img = $('sc-icon');
    if (img.complete) { done(); return; }
    img.onload = function () { done(); };
    img.onerror = function () { done(); };
  }

  // 生成分享卡片（等标题字体加载完再截，避免截到 fallback 字体）
  $('btn-capture').addEventListener('click', function () {
    if (!window.html2canvas) {
      alert('图片库加载失败，请检查网络后重试');
      return;
    }
    var btn = this;
    btn.disabled = true;
    btn.textContent = '正在盖章…';
    renderShareCard(); // 先填充卡片内容（含二维码）
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    fontsReady.then(function () {
      return new Promise(function (resolve) { waitIconLoaded(resolve); });
    }).then(function () {
      // 白底画布 + 屏幕外渲染的居中圆角卡片
      return html2canvas($('share-card'), { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' });
    }).then(function (canvas) {
      track('保存长图');
      var img = $('captured-img');
      img.src = canvas.toDataURL('image/png');
      $('btn-download').href = img.src;
      // 微信内置浏览器会拦截 <a download>（提示"在浏览器中打开下载"），
      // 改为引导长按图片保存——微信长按 <img> 可直接存相册
      if (IS_WECHAT) {
        $('btn-download').classList.add('hidden');
        $('save-hint').classList.remove('hidden');
        $('overlay-actions').classList.add('single'); // 单按钮态：「关闭」居中显示
      } else {
        $('btn-download').classList.remove('hidden');
        $('save-hint').classList.add('hidden');
        $('overlay-actions').classList.remove('single');
      }
      $('overlay').classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = '生成分享卡片';
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = '生成分享卡片';
    });
  });

  $('btn-close').addEventListener('click', function () {
    $('overlay').classList.add('hidden');
  });

  // 通用复制：优先 Clipboard API，失败回退 execCommand
  function copyToClipboard(text, done) {
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done(ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }

  // 复制挑战文案（微信里贴给朋友）
  $('btn-copy').addEventListener('click', function () {
    track('复制转发文案');
    var text = $('sc-text').textContent;
    var btn = this;
    copyToClipboard(text, function (ok) {
      btn.textContent = ok ? '已复制，去发给 TA' : '复制失败，请长按上方文字复制';
      setTimeout(function () { btn.textContent = '复制挑战文案'; }, 2200);
    });
  });

  // 复制"这张档案适合发给"的转发文案
  $('btn-give').addEventListener('click', function () {
    track('复制发给TA');
    var t = TYPES[viewingCode];
    var btn = this;
    copyToClipboard(
      '这份「' + t.name + '·' + t.animal + '」的档案，我觉得写的就是你：' + shareUrl(),
      function (ok) {
        btn.textContent = ok ? '已复制，去发给 TA' : '复制失败，请长按上方文字复制';
        setTimeout(function () { btn.textContent = '复制并发给 TA'; }, 2200);
      }
    );
  });

  // ---------- 初始化 ----------

  initScores();
  // 扫码进入：二维码带 ?src=qr 参数，统计二维码渠道访客
  if (location.search.indexOf('src=qr') >= 0) { track('扫码进入'); }
  $('sc-tip').textContent = IS_WECHAT
    ? '点右上角 ··· 转发给朋友，让 TA 也测一下'
    : '把上方文案发给朋友，或在微信里打开本页后转发';
  renderTeaser();
  setInterval(cycleTeaser, 4200);
  renderArchiveCount();
  renderAnimalStrip();
  renderResume();
  showPage('page-start');
})();
