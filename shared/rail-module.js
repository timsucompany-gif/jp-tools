/* ============================================================
   鐵路詳細模組（JR Pass 該不該買）—— 一份程式碼，兩個入口
   ------------------------------------------------------------
   （A）standalone: true   → /calc/jr-pass/ 獨立頁（SEO 入口）
   （B）standalone: false  → wizard 的「交通 → 鐵路 → 精算」

   介面跟租車、住宿模組完全一致（mount / setContext / getResult）。
   第三個模組寫下來幾乎沒有新的架構決定要做 —— 這就是先定架構的回報。
   ============================================================ */
(function (global) {
  "use strict";

  var R = global.JP_RATES;
  var C = global.JPCalc;

  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function mount(host, opts) {
    opts = opts || {};
    var standalone = opts.standalone !== false;

    var regionOpts = Object.keys(R.region).map(function (k) {
      return '<option value="' + k + '"' + (k === "kanto" ? " selected" : "") + ">" +
             R.region[k].label + "</option>";
    }).join("");

    var ownFields = !standalone ? "" :
      '<div class="grid g2" style="margin-bottom:16px">' +
        '<div><label class="fld" for="km-people">幾個人</label>' +
          '<input type="number" id="km-people" min="1" max="9" step="1" value="2" inputmode="numeric"></div>' +
        '<div><label class="fld" for="km-days">行程幾天</label>' +
          '<input type="number" id="km-days" min="1" max="30" step="1" value="7" inputmode="numeric">' +
          '<p class="hint">用來檢查 Pass 的效期蓋不蓋得完。</p></div>' +
      "</div>" +
      /* 地區只影響「每日當地交通」的預設值 —— 都市 800、山區度假區 1,500，
         差快一倍，用一個固定值會讓去長野、北海道的人低估。 */
      '<div class="grid g2" style="margin-bottom:16px">' +
        '<div><label class="fld" for="km-region">主要待在哪一區</label>' +
          '<select id="km-region">' + regionOpts + "</select>" +
          '<p class="hint">只影響下面「每日當地交通」的預設值。</p></div>' +
        "<div></div>" +
      "</div>";

    /* 每個區間一列：勾選 ＋ 單程／來回 */
    var rows = Object.keys(R.railLegs).map(function (k) {
      var L = R.railLegs[k];
      return '<li class="leg">' +
        '<label class="leg-pick">' +
          '<input type="checkbox" class="km-leg" data-leg="' + k + '">' +
          '<span class="leg-nm">' + L.label + '<em>' + C.yen(L.fare) + ' ／人／單程</em></span>' +
        "</label>" +
        '<select class="km-trips" data-leg="' + k + '" disabled>' +
          '<option value="1">單程</option><option value="2" selected>來回</option>' +
        "</select>" +
      "</li>";
    }).join("");

    var form = el(
      "<div>" + ownFields +
      '<span class="fld">這趟會搭哪些區間</span>' +
      '<ul class="legs">' + rows + "</ul>" +
      '<p class="hint">只列常見的長程區間。Pass 划不划算主要由長程決定，' +
      "所以當地的零星移動另外算（見下）。</p>" +

      '<div style="margin-top:20px;padding-top:16px;border-top:1px dashed var(--line)">' +
        '<span class="fld">到了當地之後</span>' +
        '<p class="hint" style="margin-top:0">' +
          '<b>JR Pass 蓋不到私鐵、路線巴士和纜車。</b>' +
          '很多人買了 Pass 以為全包，到現場才發現這些要另外付錢。' +
        "</p>" +
        '<div class="grid g2" style="margin-top:12px">' +
          '<div><label class="fld" for="km-local">每日當地交通（¥／人／日）</label>' +
            '<input type="number" id="km-local" min="0" step="100" value="0" inputmode="numeric">' +
            '<p class="hint" id="km-localHint"></p></div>' +
          '<div><label class="fld" for="km-extra">私鐵／接駁巴士／纜車（¥／人，全程合計）</label>' +
            '<input type="number" id="km-extra" min="0" step="100" value="0" inputmode="numeric">' +
            '<p class="hint" id="km-extraHint"></p></div>' +
        "</div>" +
      "</div></div>"
    );

    var out = el(
      "<div>" +
        '<h3 style="font-size:15px;margin:22px 0 8px">該不該買 Pass</h3>' +
        '<div id="km-verdict"></div>' +
        '<ul class="bd" id="km-opts"></ul>' +
        '<h3 style="font-size:15px;margin:22px 0 6px">JR 長程車票</h3>' +
        '<ul class="bd" id="km-break"></ul>' +
        '<h3 style="font-size:15px;margin:22px 0 6px">當地交通（Pass 蓋不到）</h3>' +
        '<ul class="bd" id="km-local-break"></ul>' +
      "</div>"
    );

    host.appendChild(form);
    host.appendChild(out);

    var $ = function (id) { return document.getElementById(id); };
    C.moneyRegister($("km-local"), 0);
    C.moneyRegister($("km-extra"), 0);
    var ctx = { people: 2, region: "kansai", tripDays: 0 };
    var lastRegion = null;
    var result = null;

    function readLegs() {
      var legs = {};
      Array.prototype.forEach.call(host.querySelectorAll(".km-leg"), function (cb) {
        var k = cb.getAttribute("data-leg");
        var sel = host.querySelector('.km-trips[data-leg="' + k + '"]');
        sel.disabled = !cb.checked;
        if (cb.checked) legs[k] = Number(sel.value) || 1;
      });
      return legs;
    }

    function run(external) {
      if (!external) C.beginAnim(["move", "total"]);
      if (standalone && $("km-people")) {
        ctx.people   = Math.max(1, Math.round(Number($("km-people").value) || 1));
        ctx.tripDays = Math.max(1, Math.round(Number($("km-days").value) || 1));
        ctx.region   = $("km-region").value;
      }
      /* 換地區時帶入該區的每日當地交通預設值（都市低、山區高） */
      var reg = R.region[ctx.region] || {};
      if (ctx.region !== lastRegion) {
        lastRegion = ctx.region;
        C.moneySet($("km-local"), reg.localPerDay || 0);
      }

      result = C.rail({
        people: ctx.people, legs: readLegs(), tripDays: ctx.tripDays,
        region: ctx.region,
        localPerDay: C.moneyYen($("km-local")),
        localExtra:  C.moneyYen($("km-extra"))
      });

      var sign = C.curSign();
      document.querySelector('label[for="km-local"]').textContent = "每日當地交通（" + sign + "／人／日）";
      document.querySelector('label[for="km-extra"]').textContent = "私鐵／接駁巴士／纜車（" + sign + "／人，全程合計）";

      $("km-localHint").textContent =
        "地鐵、市內巴士這類零星移動的概估。" +
        (reg.localPerDay >= 1500 ? "山區與度假區抓得比較高，一趟巴士常常就不只這個數。" : "都市大約等於一張地鐵一日券。");

      $("km-extraHint").innerHTML =
        "參考：長野電鉄 長野→湯田中 <b>1,660</b>／單程、長野→猴子公園巴士 <b>1,160</b>、" +
        "長野→白馬 <b>3,500</b>、觀光纜車來回 <b>2,000～3,000</b>。";
      render();
      if (opts.onChange) opts.onChange(result, ctx);
    }

    function render() {
      var box = $("km-verdict");

      if (result.kind === "empty") {
        box.className = "verdict none";
        box.innerHTML = '<p class="big">先勾幾個區間</p>' +
          '<p class="sm">勾好之後這裡會直接告訴你該買哪張，或是不用買。</p>';
      } else if (result.kind === "skip") {
        box.className = "verdict skip";
        box.innerHTML = '<p class="big">不用買，逐次購票就好</p>' +
          '<p class="sm">車票總共 ' + C.yen(result.ticketTotal) +
          '，比最便宜的 Pass 還低。你這趟的長程移動還不夠讓 Pass 回本。</p>';
      } else {
        box.className = "verdict buy";
        box.innerHTML = '<p class="big">買「' + result.best.label + '」，省 ' + C.yen(result.best.diff) + "</p>" +
          '<p class="sm">逐次購票要 ' + C.yen(result.ticketTotal) +
          '，這張只要 ' + C.yen(result.best.cost) + "（" + ctx.people + " 人份）。</p>";
      }

      /* 所有方案並排，包含比較貴的 —— 使用者要看得到我們沒有藏東西 */
      var ul = $("km-opts");
      ul.innerHTML = "";
      if (result.kind !== "empty") {
        var rowsData = [{
          label: "不買，逐次購票", cost: result.ticketTotal, diff: 0, plain: true
        }].concat(result.options);

        rowsData.forEach(function (o) {
          var li = document.createElement("li");
          var win = !o.plain && result.best && o.key === result.best.key;
          if (win) li.className = "miss";
          var nm = document.createElement("span");
          nm.className = "nm";
          nm.appendChild(document.createTextNode(o.label));
          if (win) {
            var t = document.createElement("span");
            t.className = "tag";
            t.textContent = "最便宜";
            nm.appendChild(t);
          }
          var em = document.createElement("em");
          if (o.plain) {
            em.textContent = "把勾選的區間逐段買票";
          } else if (o.short) {
            em.textContent = "只有 " + o.days + " 天，蓋不完你 " + result.tripDays +
                             " 天的行程，剩下幾天要另外買票";
            li.className = "zero";
          } else {
            em.textContent = o.diff > 0
              ? "比逐次購票省 " + C.yen(o.diff)
              : "比逐次購票多花 " + C.yen(-o.diff);
          }
          nm.appendChild(em);
          li.appendChild(nm);
          li.appendChild(C.amtNode(o.cost, "amt", "move:opt:" + (o.key || "plain")));
          ul.appendChild(li);
        });

        if (!result.singleRegion && result.options.length <= 3) {
          var note = document.createElement("li");
          note.className = "zero";
          var n = document.createElement("span");
          n.className = "nm";
          n.appendChild(document.createTextNode("地區版 Pass 不適用"));
          var ne = document.createElement("em");
          ne.textContent = "你勾的區間跨了不同地區，只有全國版能全程使用。";
          n.appendChild(ne);
          note.appendChild(n);
          ul.appendChild(note);
        }
      }

      var lb = $("km-local-break");
      lb.innerHTML = "";
      result.localItems.forEach(function (it) {
        var li = document.createElement("li");
        li.className = (it.amt > 0 ? "miss" : "zero");
        var nm = document.createElement("span");
        nm.className = "nm";
        nm.appendChild(document.createTextNode(it.nm));
        if (it.amt > 0) {
          var tg = document.createElement("span");
          tg.className = "tag";
          tg.textContent = "Pass 蓋不到";
          nm.appendChild(tg);
        }
        var e2 = document.createElement("em");
        e2.textContent = it.note;
        nm.appendChild(e2);
        li.appendChild(nm);
        li.appendChild(C.amtNode(it.amt, "amt", "move:local:" + it.key));
        lb.appendChild(li);
      });

      var bd = $("km-break");
      bd.innerHTML = "";
      result.items.forEach(function (it) {
        var li = document.createElement("li");
        var nm = document.createElement("span");
        nm.className = "nm";
        nm.appendChild(document.createTextNode(it.nm));
        var em = document.createElement("em");
        em.textContent = it.note;
        nm.appendChild(em);
        li.appendChild(nm);
        li.appendChild(C.amtNode(it.amt, "amt", "move:leg:" + it.key));
        bd.appendChild(li);
      });
    }

    Array.prototype.forEach.call(host.querySelectorAll(".km-leg, .km-trips"), function (e) {
      e.addEventListener("change", run);
    });
    ["km-people", "km-days", "km-region", "km-local", "km-extra"].forEach(function (id) {
      if (!$(id)) return;
      $(id).addEventListener("input", run);
      $(id).addEventListener("change", run);
    });

    /* 預設勾一個最常見的區間，讓頁面一打開就有結論可看 */
    var first = host.querySelector('.km-leg[data-leg="tokyo_osaka"]');
    if (first) { first.checked = true; }

    run();

    return {
      setContext: function (c) {
        if (c.people !== undefined) ctx.people = c.people;
        if (c.region !== undefined) ctx.region = c.region;
        if (c.tripDays !== undefined) ctx.tripDays = c.tripDays;
        run(true);
      },
      getResult: function () { return result; }
    };
  }

  global.JPRailModule = { mount: mount };
})(window);
