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

  var _seq = 0;

  function mount(host, opts) {
    opts = opts || {};
    var standalone = opts.standalone !== false;

    /* 每個實例一組獨立的 id 前綴。
       改成可以多開，是因為簡單模式支援混搭（3 晚 Airbnb ＋ 1 晚溫泉），
       精算卻只能算一種 —— 精算比簡單模式表達力還弱，那是設計缺陷。
       更關鍵的是兩段住宿常常在不同城市，宿泊稅完全不一樣，非拆不可。 */
    var P = opts.id || ("lm" + (++_seq));
    function ID(name) { return P + "-" + name; }
    var fixedType = opts.fixedType || null;

    var ownFields = !standalone ? "" :
      '<div class="grid g2">' +
        '<div><label class="fld" for="' + ID("people") + '">幾個人</label>' +
          '<input type="number" id="' + ID("people") + '" min="1" max="9" step="1" value="2" inputmode="numeric"></div>' +
        '<div><label class="fld" for="' + ID("nights") + '">住幾晚</label>' +
          '<input type="number" id="' + ID("nights") + '" min="1" max="30" step="1" value="4" inputmode="numeric"></div>' +
      "</div>";

    var form = el(
      "<div>" + ownFields +
      '<div class="grid g2" style="' + (standalone ? "margin-top:14px" : "") + '">' +
        (fixedType
          ? '<div hidden><select id="' + ID("type") + '">' +
              '<option value="' + fixedType + '" selected>' + R.lodging[fixedType].label +
            "</option></select></div>"
          : '<div><label class="fld" for="' + ID("type") + '">住宿類型</label>' +
            '<select id="' + ID("type") + '">' + opts_(R.lodging, "airbnb") + "</select></div>") +
        /* 預設給一個「真的有課稅」的城市。預設成免徵的話，
           頁面一打開四筆隱形費用全是 ¥0，等於沒展示出自己的價值。 */
        '<div><label class="fld" for="' + ID("city") + '">住在哪個城市</label>' +
          '<select id="' + ID("city") + '">' + opts_(R.lodgingTax, "kyoto") + "</select>" +
          '<p class="hint">宿泊稅是各市自訂的，不是全國統一。</p></div>' +
      "</div>" +

      '<div class="grid g2" style="margin-top:16px">' +
        '<div><label class="fld" for="' + ID("rate") + '" id="' + ID("rateLbl") + '">每晚價（¥）</label>' +
          '<input type="number" id="' + ID("rate") + '" min="0" step="500" value="0" inputmode="numeric">' +
          '<p class="hint" id="' + ID("rateHint") + '"></p></div>' +
        '<div><label class="fld" for="' + ID("rooms") + '" id="' + ID("roomsLbl") + '">訂幾間</label>' +
          '<input type="number" id="' + ID("rooms") + '" min="1" max="9" step="1" value="1" inputmode="numeric">' +
          '<p class="hint" id="' + ID("roomsHint") + '"></p></div>' +
      "</div>" +

      '<div class="grid g2" style="margin-top:16px" id="' + ID("airbnbRow") + '" hidden>' +
        '<div><label class="fld" for="' + ID("clean") + '">清潔費（¥，一次性）</label>' +
          '<input type="number" id="' + ID("clean") + '" min="0" step="500" value="0" inputmode="numeric">' +
          '<p class="hint" id="' + ID("cleanHint") + '"></p></div>' +
        '<div><label class="fld" for="' + ID("svc") + '">平台服務費（%）</label>' +
          '<input type="number" id="' + ID("svc") + '" min="0" max="30" step="0.5" value="0" inputmode="decimal">' +
          '<p class="hint">2025 年底起多數房源改由房東吸收，顯示價就是最終價。' +
          '若你的結帳頁另外加了 14～16%，填進來。</p></div>' +
      "</div>" +

      '<div class="grid g2" style="margin-top:16px">' +
        '<div><span class="fld">有泡湯嗎（入湯稅）</span><div class="segs">' +
          '<input type="radio" name="' + ID("onsen") + '" id="' + P + '-onsen-no" value="no" checked><label for="' + P + '-onsen-no">沒有</label>' +
          '<input type="radio" name="' + ID("onsen") + '" id="' + P + '-onsen-yes" value="yes"><label for="' + P + '-onsen-yes">有</label>' +
        "</div></div>" +
        '<div><label class="fld" for="' + ID("meals") + '">含餐方案</label>' +
          '<select id="' + ID("meals") + '">' + opts_(R.meals, "none") + "</select>" +
          '<p class="hint" id="' + ID("mealHint") + '"></p></div>' +
      "</div></div>"
    );

    var out = el(
      "<div>" +
        (opts.showHero === false ? "" :
        '<div class="hero" style="margin-top:20px">' +
          '<div class="row"><span class="k">自己估的話（房價 × 晚數）</span><span class="v" id="' + ID("naive") + '">—</span></div>' +
          '<div class="row"><span class="k">實際大約要付</span><span class="v" id="' + ID("real") + '">—</span></div>' +
          '<div class="row gap"><span class="k">你會少估</span><span class="v" id="' + ID("gap") + '">—</span></div>' +
          '<p class="why">多出來的是宿泊稅、入湯稅、服務費 — 這幾筆通常不在訂房網站顯示的價格裡，到現場才付。</p>' +
        "</div>") +
        '<h3 style="font-size:15px;margin:18px 0 6px">錢花在哪</h3>' +
        '<ul class="bd" id="' + ID("break") + '"></ul>' +
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

    C.moneyRegister($(ID("rate")), 0);
    C.moneyRegister($(ID("clean")), 0);
    $(ID("rate")).addEventListener("input", function () { rateTouched = true; });
    $(ID("city")).addEventListener("change", function () { cityTouched = true; });
    $(ID("rooms")).addEventListener("input", function () { roomsTouched = true; });

    function run(external) {
      if (!external) C.beginAnim(["stay", "total"]);
      if (standalone) {
        ctx.people = Math.max(1, Math.round(num(ID("people"), 2)));
        ctx.nights = Math.max(0, Math.round(num(ID("nights"), 4)));
      }

      var typeKey = $(ID("type")).value;
      var L = R.lodging[typeKey];
      var isAirbnb = (typeKey === "airbnb");
      var byUnit   = (L.basis === "unit");
      $(ID("airbnbRow")).hidden = !isAirbnb;

      /* 換住宿類型 → 房間數與房價都重算，因為計價方式整個不一樣 */
      if (typeKey !== lastType) {
        lastType = typeKey;
        rateTouched = false;
        $(ID("rooms")).value = C.lodgingUnits(typeKey, ctx.people);
      }

      var autoUnits = C.lodgingUnits(typeKey, ctx.people);
      if (!roomsTouched) $(ID("rooms")).value = autoUnits;
      var rooms = Math.max(1, Math.round(num(ID("rooms"), autoUnits)));

      var split    = C.lodgingSplit(typeKey, ctx.people);
      var autoRate = byUnit
        ? C.lodgingRoomPrice(typeKey, Math.ceil(ctx.people / rooms))
        : L.perNight;

      if (!rateTouched || C.moneyYen($(ID("rate"))) === 0) C.moneySet($(ID("rate")), autoRate);
      var rate = C.moneyYen($(ID("rate"))) || autoRate;

      /* 計價方式現在由住宿類型決定，不讓使用者去選 —— 那本來就不是他的選擇。
         但要把「這一類是怎麼賣的」講清楚，因為誤會就發生在這裡。 */
      var unitWord = L.unitWord || "間";
      var sign = C.curSign();
      $(ID("rateLbl")).textContent = byUnit
        ? "每晚價（" + sign + "／" + unitWord + "）"
        : "每晚價（" + sign + "／人）";
      var cleanLbl = document.querySelector('label[for="' + ID("clean") + '"]');
      if (cleanLbl) cleanLbl.textContent = "清潔費（" + sign + "，一次性）";
      $(ID("roomsLbl")).textContent = isAirbnb ? "訂幾個房源" : "訂幾間房";
      $(ID("rooms")).disabled = !byUnit;
      $(ID("roomsHint")).textContent = byUnit
        ? ctx.people + " 人自動配成 " + split.join("＋") + " 人，最多 " + (L.capacity || 4) + " 人一" + unitWord
        : "按人計價，不需要填。";

      if (byUnit) {
        $(ID("rateHint")).innerHTML = isAirbnb
          ? "<b>整間計價</b> —— 一個房源的價錢。多帶一個人常常不加價，所以人越多每人越便宜。"
          : "<b>按房計價</b> —— 一間 " + C.yen(L.base) + " 起，每多住一人加 " +
            C.yen(L.perExtraPerson || 0) + "。住兩個人不是一個人的兩倍。";
      } else {
        $(ID("rateHint")).innerHTML =
          "<b>按人計價</b> —— 看到「一泊 " + C.yen(L.perNight) + "」是<b>一個人</b>的價錢，" +
          "兩個人就是兩倍。這是台灣人最常估錯的一格。";
      }

      if (isAirbnb) {
        var cl = C.moneyYen($(ID("clean")));
        var n  = Math.max(1, ctx.nights);
        $(ID("cleanHint")).textContent = cl > 0
          ? "一次性費用。住 " + n + " 晚的話，攤下來每晚多 " + C.yen(cl / n) +
            "　—— 住越少晚越吃虧。"
          : "預設 0：2026 年起清潔費多半已攤進顯示的每晚價，再加一筆是重複計算。" +
            "結帳頁若真的另外列一筆，填進來。";
      }

      var mealKey = $(ID("meals")).value;
      $(ID("mealHint")).textContent = R.meals[mealKey].cover > 0
        ? "會自動從「餐食」扣掉約 " + Math.round(R.meals[mealKey].cover * 100) + "%，避免重複計算。"
        : "餐費另計。";

      result = C.lodgingDetail({
        type: typeKey,
        city: $(ID("city")).value,
        people: ctx.people,
        nights: ctx.nights,
        rooms: rooms,
        rateOverride: rateTouched ? rate : 0,
        cleaning: isAirbnb ? C.moneyYen($(ID("clean"))) : null,
        serviceRate: isAirbnb ? (num(ID("svc"), 0) / 100) : null,
        onsen: radio(ID("onsen")) === "yes",
        meals: mealKey
      });

      render();
      if (opts.onChange) opts.onChange(result, ctx);
    }

    function render() {
      if ($(ID("naive"))) {
        C.setAmt($(ID("naive")), result.naive, null, "stay:naive");
        C.setAmt($(ID("real")),  result.total,  null, "stay:real");
        C.setAmt($(ID("gap")),   result.missed, null, "stay:gap");
      }
      var ul = $(ID("break"));
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

    [ID("people"), ID("nights"), ID("type"), ID("city"), ID("rate"), ID("rooms"), ID("meals"), ID("clean"), ID("svc")].forEach(function (id) {
      var e = $(id); if (!e) return;
      e.addEventListener("input", run);
      e.addEventListener("change", run);
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="' + ID("onsen") + '"]'), function (e) {
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
          $(ID("city")).value = c.city;
        }
        run(true);
      },
      getResult: function () { return result; }
    };
  }

  global.JPLodgingModule = { mount: mount };
})(window);
