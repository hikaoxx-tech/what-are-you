// ============================================================
// 《你是什么东西》交互逻辑
// 计分规则（03 文档）：每题 A=-1 / B=+1，每维 7 题，-7..+7
// >0 判右极，<0 判左极；彩蛋题（dim=null）不计分
// ============================================================

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var DIMS = ['EI', 'SN', 'TF', 'JP'];
  var LEFT_LABEL = { EI: 'E', SN: 'S', TF: 'T', JP: 'J' };
  var RIGHT_LABEL = { EI: 'I', SN: 'N', TF: 'F', JP: 'P' };
  var GALLERY_ORDER = ['ESTJ','ESTP','ESFJ','ESFP','ENTJ','ENTP','ENFJ','ENFP',
                       'ISTJ','ISTP','ISFJ','ISFP','INTJ','INTP','INFJ','INFP'];

  var scores = {};        // 每维得分
  var idx = 0;            // 当前题下标
  var myCode = null;      // 我的结果代码
  var viewingCode = null; // 当前查看的人格代码
  var ARCHIVE_KEY = 'wa_archives';
  var IS_WECHAT = /MicroMessenger/i.test(navigator.userAgent);
  // 正式线上地址：分享/二维码一律用它。
  // location.href 在本地测试（file:// / localhost）时会生成别人打不开的链接，
  // 所以只有当前确实在正式域名上时才保留当前 URL（可带 ?v= 参数绕微信缓存）。
  var SHARE_URL = 'https://hikaoxx-tech.github.io/what-are-you/';
  function shareUrl() {
    return location.hostname === 'hikaoxx-tech.github.io' ? location.href : SHARE_URL;
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
    var q = QUESTIONS[idx];
    $('q-count').textContent = '第 ' + (idx + 1) + ' / ' + QUESTIONS.length + ' 题';
    $('q-bar').style.width = ((idx + 1) / QUESTIONS.length * 100) + '%';
    $('q-title').textContent = q.q;

    var box = $('q-options');
    box.innerHTML = '';
    [q.a, q.b].forEach(function (text, i) {
      var btn = document.createElement('button');
      btn.className = 'option';
      btn.textContent = text;
      btn.addEventListener('click', function () { choose(i, btn); });
      box.appendChild(btn);
    });
  }

  function choose(i, btn) {
    var q = QUESTIONS[idx];
    if (q.dim) { scores[q.dim] += (i === 0 ? -1 : 1); }

    btn.classList.add('selected');
    $('q-options').querySelectorAll('.option').forEach(function (b) { b.disabled = true; });

    setTimeout(function () {
      idx++;
      if (idx < QUESTIONS.length) {
        renderQuestion();
      } else {
        showPage('page-loading');
        $('loading-main').textContent =
          LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
        setTimeout(function () { showResult(true); }, 1500); // 1.5s 仪式感
      }
    }, 260);
  }

  // ---------- 结果 ----------

  function computeCode() {
    var code = '';
    DIMS.forEach(function (d) {
      code += scores[d] > 0 ? RIGHT_LABEL[d] : LEFT_LABEL[d];
    });
    return code;
  }

  function makeQR() {
    var qr = $('qrcode');
    qr.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qr, { text: shareUrl(), width: 84, height: 84, colorDark: '#2B2F36' });
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

    // 稀有度徽章只有"我的结果"才有（基于我的答题极端度）
    var rarity = $('r-rarity');
    rarity.classList.toggle('hidden', !mine);
    if (mine) { rarity.textContent = rarityOf(); }

    // 转发挑战：只有"我的结果"才显示
    $('share-challenge').classList.toggle('hidden', !mine);
    if (mine) {
      $('sc-text').textContent = '我测出来是「' + t.name + '·' + t.animal + '」，你是什么东西？ ' + shareUrl();
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

    $('btn-back-mine').classList.toggle('hidden', mine);
    showPage('page-result');
    makeQR(); // 页面可见后再生成二维码
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
      });
      grid.appendChild(card);
    });
  }

  // ---------- 事件绑定 ----------

  $('btn-start').addEventListener('click', function () {
    idx = 0;
    initScores();
    renderQuestion();
    showPage('page-quiz');
  });

  $('btn-restart').addEventListener('click', function () {
    idx = 0;
    initScores();
    renderQuestion();
    showPage('page-quiz');
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

  // 生成分享长图
  $('btn-capture').addEventListener('click', function () {
    if (!window.html2canvas) {
      alert('图片库加载失败，请检查网络后重试');
      return;
    }
    var btn = this;
    btn.disabled = true;
    btn.textContent = '正在盖章…';
    html2canvas($('result-card'), { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' })
      .then(function (canvas) {
        var img = $('captured-img');
        img.src = canvas.toDataURL('image/png');
        $('btn-download').href = img.src;
        $('overlay').classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = '生成分享长图';
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = '生成分享长图';
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
    var text = $('sc-text').textContent;
    var btn = this;
    copyToClipboard(text, function (ok) {
      btn.textContent = ok ? '已复制，去发给 TA' : '复制失败，请长按上方文字复制';
      setTimeout(function () { btn.textContent = '复制挑战文案'; }, 2200);
    });
  });

  // 复制"这张档案适合发给"的转发文案
  $('btn-give').addEventListener('click', function () {
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
  $('sc-tip').textContent = IS_WECHAT
    ? '点右上角 ··· 转发给朋友，让 TA 也测一下'
    : '把上方文案发给朋友，或在微信里打开本页后转发';
  renderTeaser();
  setInterval(cycleTeaser, 4200);
  renderArchiveCount();
  renderAnimalStrip();
  showPage('page-start');
})();
