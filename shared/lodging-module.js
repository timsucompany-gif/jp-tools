/* ============================================================
   住宿詳細模組 —— 一份程式碼，兩個入口
   ------------------------------------------------------------
   （A）standalone: true   → /calc/lodging-tax/ 獨立頁（SEO 入口：宿泊稅）
   （B）standalone: false  → wizard 的「住宿 → 精算」展開區

   跟租車模組同一套介面（mount / setContext / getResult），
   所以 wizard 加第三、第四個分類時不用再想架構。
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

  function opts_(obj, sel) {
    return Object.keys(obj).map(function (k) {
      return '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" +
             obj[k].label + "</option>";
    }).join("");
  }

  function mount(host, opts) {
    opts = opts || {};
    var standalone = opts.standalone !== false;

    var ownFields = !standalone ? "" :
      '<div class="grid g2">' +
        '<div><label class="fld" for="lm-people">幾個人</label>' +
          '<input type="number" id="lm-people" min="1" max="9" step="1" value="2" inputmode="numeric"></div>' +
        '<div><label class="fld" for="lm-nights">住幾晚</label>' +
          '<input type="number" id="lm-nights" min="1" max="30" step="1" value="4" inputmode="numeric"></div>' +
      "</div>";

    var form = el(
      "<div>" + ownFields +
      '<div class="grid g2" style="' + (standalone ? "margin-top:14px" : "") + '">' +
        '<div><label class="fld" for="lm-type">住宿類型</label>' +
          '<select id="lm-type">' + opts_(R.lodging, "airbnb") + "</select></div>" +
        /* 預設給一個「真的有課稅」的城市。預設成免徵的話，
           頁面一打開四筆隱形費用全是 ¥0，等於沒展示出自己的價值。 */
        '<div><label class="fld" for="lm-city">住在哪個城市</label>' +
          '<select id="lm-city">' + opts_(R.lodgingTax, "kyoto") + "</select>" +
          '<p class="hint">宿泊稅是各市自訂的，不是全國統一。</p></div>' +
      "</div>" +

      '<div class="grid g2" style="margin-top:16px">' +
        '<div><label class="fld" for="lm-rate" id="lm-rateLbl">每晚價（¥）</label>' +
          '<input type="number" id="lm-rate" min="0" step="500" value="0" inputmode="numeric">' +
          '<p class="hint" id="lm-rateHint"></p></div>' +
        '<div><label class="fld" for="lm-rooms" id="lm-roomsLbl">訂幾間</label>' +
          '<input type="number" id="lm-rooms" min="1" max="9" step="1" value="1" inputmode="numeric">' +
          '<p class="hint" id="lm-roomsHint"></p></div>' +
      "</div>" +

      '<div class="grid g2" style="margin-top:16px" id="lm-airbnbRow" hidden>' +
        '<div><label class="fld" for="lm-clean">清潔費（¥，一次性）</label>' +
          '<input type="number" id="lm-clean" min="0" step="500" value="0" inputmode="numeric">' +
          '<p class="hint" id="lm-cleanHint"></p></div>' +
        '<div><label class="fld" for="lm-svc">平台服務費（%）</label>' +
          '<input type="number" id="lm-svc" min="0" max="30" step="0.5" value="0" inputmode="decimal">' +
          '<p class="hint">2025 年底起多數房源改由房東吸收，顯示價就是最終價。' +
          '若你的結帳頁另外加了 14～16%，填進來。</p></div>' +
      "</div>" +

      '<div class="grid g2" style="margin-top:16px">' +
        '<div><span class="fld">有泡湯嗎（入湯稅）</span><div class="segs">' +
          '<input type="radio" name="lm-onsen" id="lm-onsen-no" value="no" checked><label for="lm-onsen-no">沒有</label>' +
          '<input type="radio" name="lm-onsen" id="lm-onsen-yes" value="yes"><label for="lm-onsen-yes">有</label>' +
        "</div></div>" +
        '<div><label class="fld" for="lm-meals">含餐方案</label>' +
          '<select id="lm-meals">' + opts_(R.meals, "none") + "</select>" +
          '<p class="hint" id="lm-mealHint"></p></div>' +
      "</div></div>"
    );

    var out = el(
      "<div>" +
        (opts.showHero === false ? "" :
        '<div class="hero" style="margin-top:20px">' +
          '<div class="row"><span class="k">自己估的話（房價 × 晚數）</span><span class="v" id="lm-naive">—</span></div>' +
          '<div class="row"><span class="k">實際大約要付</span><span class="v" id="lm-real">—</span></div>' +
          '<div class="row gap"><span class="k">你會少估</span><span class="v" id="lm-gap">—</span></div>' +
          '<p class="why">多出來的是宿泊稅、入湯稅、服務費 — 這幾筆通常不在訂房網站顯示的價格裡，到現場才付。</p>' +
        "</div>") +
        '<h3 style="font-size:15px;margin:18px 0 6px">錢花在哪</h3>' +
        '<ul class="bd" id="lm-break"></ul>' +
      "</div>"
    );

    host.appendChild(form);
    host.appendChild(out);

    var $ = function (id) { return document.getElementById(id); };
    var radio = function (n) {
      var e = document.querySelector('input[name="' + n + '"]:checked');
      return e ? e.value : null;
    };
    var num = function (id, fb) {
      var e = $(id); if (!e) return fb || 0;
      var v = Number(e.value);
      return (isFinite(v) && v >= 0) ? v : (fb || 0);
    };

    var ctx = { people: 2, nights: 4 };
    var lastType = null, rateTouched = false, roomsTouched = false, cityTouched = false, result = null;

    C.moneyRegister($("lm-rate"), 0);
    C.moneyRegister($("lm-clean"), 0);
    $("lm-rate").addEventListener("input", function () { rateTouched = true; });
    $("lm-city").addEventListener("change", function () { cityTouched = true; });
    $("lm-rooms").addEventListener("input", function () { roomsTouched = true; });

    function run(external) {
      if (!external) C.beginAnim(["stay", "total"]);
      if (standalone) {
        ctx.people = Math.max(1, Math.round(num("lm-people", 2)));
        ctx.nights = Math.max(0, Math.round(num("lm-nights", 4)));
      }

      var typeKey = $("lm-type").value;
      var L = R.lodging[typeKey];
      var isAirbnb = (typeKey === "airbnb");
      var byUnit   = (L.basis === "unit");
      $("lm-airbnbRow").hidden = !isAirbnb;

      /* 換住宿類型 → 房間數與房價都重算，因為計價方式整個不一樣 */
      if (typeKey !== lastType) {
        lastType = typeKey;
        rateTouched = false;
        $("lm-rooms").value = C.lodgingUnits(typeKey, ctx.people);
      }

      var autoUnits = C.lodgingUnits(typeKey, ctx.people);
      if (!roomsTouched) $("lm-rooms").value = autoUnits;
      var rooms = Math.max(1, Math.round(num("lm-rooms", autoUnits)));

      var split    = C.lodgingSplit(typeKey, ctx.people);
      var autoRate = byUnit
        ? C.lodgingRoomPrice(typeKey, Math.ceil(ctx.people / rooms))
        : L.perNight;

      if (!rateTouched || C.moneyYen($("lm-rate")) === 0) C.moneySet($("lm-rate"), autoRate);
      var rate = C.moneyYen($("lm-rate")) || autoRate;

      /* 計價方式現在由住宿類型決定，不讓使用者去選 —— 那本來就不是他的選擇。
         但要把「這一類是怎麼賣的」講清楚，因為誤會就發生在這裡。 */
      var unitWord = L.unitWord || "間";
      var sign = C.curSign();
      $("lm-rateLbl").textContent = byUnit
        ? "每晚價（" + sign + "／" + unitWord + "）"
        : "每晚價（" + sign + "／人）";
      var cleanLbl = document.querySelector('label[for="lm-clean"]');
      if (cleanLbl) cleanLbl.textContent = "清潔費（" + sign + "，一次性）";
      $("lm-roomsLbl").textContent = isAirbnb ? "訂幾個房源" : "訂幾間房";
      $("lm-rooms").disabled = !byUnit;
      $("lm-roomsHint").textContent = byUnit
        ? ctx.people + " 人自動配成 " + split.join("＋") + " 人，最多 " + (L.capacity || 4) + " 人一" + unitWord
        : "按人計價，不需要填。";

      if (byUnit) {
        $("lm-rateHint").innerHTML = isAirbnb
          ? "<b>整間計價</b> —— 一個房源的價錢。多帶一個人常常不加價，所以人越多每人越便宜。"
          : "<b>按房計價</b> —— 一間 " + C.yen(L.base) + " 起，每多住一人加 " +
            C.yen(L.perExtraPerson || 0) + "。住兩個人不是一個人的兩倍。";
      } else {
        $("lm-rateHint").innerHTML =
          "<b>按人計價</b> —— 看到「一泊 " + C.yen(L.perNight) + "」是<b>一個人</b>的價錢，" +
          "兩個人就是兩倍。這是台灣人最常估錯的一格。";
      }

      if (isAirbnb) {
        var cl = C.moneyYen($("lm-clean"));
        var n  = Math.max(1, ctx.nights);
        $("lm-cleanHint").textContent = cl > 0
          ? "一次性費用。住 " + n + " 晚的話，攤下來每晚多 " + C.yen(cl / n) +
            "　—— 住越少晚越吃虧。"
          : "預設 0：2026 年起清潔費多半已攤進顯示的每晚價，再加一筆是重複計算。" +
            "結帳頁若真的另外列一筆，填進來。";
      }

      var mealKey = $("lm-meals").value;
      $("lm-mealHint").textContent = R.meals[mealKey].cover > 0
        ? "會自動從「餐食」扣掉約 " + Math.round(R.meals[mealKey].cover * 100) + "%，避免重複計算。"
        : "餐費另計。";

      result = C.lodgingDetail({
        type: typeKey,
        city: $("lm-city").value,
        people: ctx.people,
        nights: ctx.nights,
        rooms: rooms,
        rateOverride: rateTouched ? rate : 0,
        cleaning: isAirbnb ? C.moneyYen($("lm-clean")) : null,
        serviceRate: isAirbnb ? (num("lm-svc", 0) / 100) : null,
        onsen: radio("lm-onsen") === "yes",
        meals: mealKey
      });

      render();
      if (opts.onChange) opts.onChange(result, ctx);
    }

    function render() {
      if ($("lm-naive")) {
        C.setAmt($("lm-naive"), result.naive, null, "stay:naive");
        C.setAmt($("lm-real"),  result.total,  null, "stay:real");
        C.setAmt($("lm-gap"),   result.missed, null, "stay:gap");
      }
      var ul = $("lm-break");
      ul.innerHTML = "";
      result.items.forEach(function (it) {
        var li = document.createElement("li");
        li.className = (it.miss ? "miss " : "") + (it.amt === 0 ? "zero" : "");
        var nm = document.createElement("span");
        nm.className = "nm";
        nm.appendChild(document.createTextNode(it.nm));
        if (it.miss && it.amt > 0) {
          var tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "容易漏掉";
          nm.appendChild(tag);
        }
        var em = document.createElement("em");
        em.textContent = it.note;
        nm.appendChild(em);
        li.appendChild(nm);
        li.appendChild(C.amtNode(it.amt, "amt", "stay:" + it.key));
        ul.appendChild(li);
      });
    }

    ["lm-people", "lm-nights", "lm-type", "lm-city", "lm-rate", "lm-rooms", "lm-meals", "lm-clean", "lm-svc"].forEach(function (id) {
      var e = $(id); if (!e) return;
      e.addEventListener("input", run);
      e.addEventListener("change", run);
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="lm-onsen"]'), function (e) {
      e.addEventListener("change", function () { run(); });
    });

    run();

    return {
      setContext: function (c) {
        if (c.people !== undefined) ctx.people = c.people;
        if (c.nights !== undefined) ctx.nights = c.nights;
        /* wizard 已經問過地區了，順手帶出該地區的代表城市。
           使用者自己改過就不再覆寫 —— 他可能住在同一地區的其他城市。 */
        if (c.city !== undefined && !cityTouched && R.lodgingTax[c.city]) {
          $("lm-city").value = c.city;
        }
        run(true);
      },
      getResult: function () { return result; }
    };
  }

  global.JPLodgingModule = { mount: mount };
})(window);
