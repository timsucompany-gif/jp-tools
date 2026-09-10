/* ============================================================
   日本費用計算器 — 共用計算核心
   ------------------------------------------------------------
   [切點] 未來的 assets/calc.js。

   設計原則：這個檔案裡沒有任何 DOM 操作。
   全部都是「吃參數、吐資料」的純函式，所以同一份邏輯可以同時給
   （A）獨立的租車計算器頁面 —— SEO 入口
   （B）wizard 的交通詳細模組
   使用，不需要複製任何一行。

   這正是先把架構定下來的理由：五個計算器各寫各的，之後就湊不起來。
   ============================================================ */
(function (global) {
  "use strict";

  var R = global.JP_RATES;
  var nf = new Intl.NumberFormat("zh-TW");

  function yen(n) { return "¥" + nf.format(Math.round(n)); }
  function twd(n) { return "NT$" + nf.format(Math.round(n)); }

  /* ------------------------------------------------------------
     匯率
     ------------------------------------------------------------
     三層設計，任何一層失敗都不會讓頁面壞掉：
       ① 靜態預設值（rates.js）—— 離線、file:// 直接開都能用
       ② 線上即時匯率，主要來源 jsDelivr CDN（實測 ~47ms）
       ③ 備援來源 open.er-api.com（實測 ~216ms）
     抓不到就靜靜留在預設值，只是不顯示「即時」字樣。

     ⚠️ 這些都是中間匯率（mid-market），不是你實際換得到的價格。
        現鈔、刷卡、海外提款各有 1～3% 的價差 —— 頁面上要講清楚。
     ------------------------------------------------------------ */
  var _fx = R.fxDefault;

  function setFx(v) { _fx = (v > 0) ? v : 0; }
  function getFx()  { return _fx; }

  /* ------------------------------------------------------------
     幣別
     ------------------------------------------------------------
     內部一律以「日圓」為準值。原因：日本的價格本來就是日圓標的，
     匯率變動不該讓房價跟著變。使用者選台幣時，只是換一層顯示與輸入，
     存進模型的仍然是日圓。

     切換幣別會連輸出一起換 —— 輸入台幣卻看到日圓當主數字會很錯亂。
     另一個幣別永遠留在底下的小字，資訊不會消失。
     ------------------------------------------------------------ */
  var _cur = "JPY";
  function setCurrency(c) { _cur = (c === "TWD") ? "TWD" : "JPY"; }
  function getCurrency() { return _cur; }
  /* 給輸入欄標籤用的符號，會跟著幣別切換 */
  function curSign() { return (_cur === "TWD") ? "NT$" : "¥"; }

  /* 主顯示：依目前幣別 */
  function fmtMain(yenAmt) {
    return (_cur === "TWD" && _fx > 0) ? twd(yenAmt * _fx) : yen(yenAmt);
  }
  /* 副顯示：另一個幣別的小字 */
  function subSmall(yenAmt) {
    if (_cur === "TWD") {
      return yen(yenAmt);
    }
    return (_fx > 0) ? "NT$" + nf.format(Math.round(yenAmt * _fx)) : null;
  }

  function twdSmall(n) {
    var txt = subSmall(n);
    if (!txt) return null;
    var s = document.createElement("span");
    s.className = "twd";
    s.textContent = "≈" + txt;
    return s;
  }

  /* ---------- 金額輸入欄 ----------
     欄位顯示的是使用者選的幣別，但 _yen 才是真值。
     切換幣別時只換顯示，不動真值 —— 所以來回切換不會因為四捨五入越滾越歪。 */
  var _moneyInputs = [];

  function moneyRegister(el, yenValue) {
    if (!el) return;
    el.__yen = yenValue || 0;
    _moneyInputs.push(el);
    moneyPaint(el);
    el.addEventListener("input", function () {
      var v = Number(el.value) || 0;
      el.__yen = (_cur === "TWD" && _fx > 0) ? v / _fx : v;
    });
  }

  function moneyPaint(el) {
    var v = (_cur === "TWD" && _fx > 0) ? el.__yen * _fx : el.__yen;
    el.value = Math.round(v);
    el.step = (_cur === "TWD") ? 50 : 500;
  }

  /* 由模型算出來的建議值：寫入真值再依幣別顯示 */
  function moneySet(el, yenValue) {
    if (!el) return;
    el.__yen = yenValue || 0;
    moneyPaint(el);
  }

  /* 讀回日圓真值 */
  function moneyYen(el) {
    if (!el) return 0;
    return el.__yen || 0;
  }

  function moneyRepaintAll() {
    _moneyInputs.forEach(moneyPaint);
  }

  /* ------------------------------------------------------------
     數字變化動畫
     ------------------------------------------------------------
     三條規則：
       ① 只有「被改動到的那一組」跑動畫，其他數字直接更新
          —— 全部一起跳的話反而看不出是哪裡變了
       ② 新舊值相同也要跑。使用者改了東西就該看到那格有反應，
          「沒動」和「壞掉」在畫面上長得一樣
       ③ 1.5 秒封頂；系統關閉動畫效果時直接跳到結果

     每個金額都有一個穩定的 key，格式是 "群組:名稱"。
     用 key 而不是用元素，是因為明細列每次都會整批重建 ——
     元素是新的，但「上一次的值」必須留著才有東西可以動畫。
     ------------------------------------------------------------ */
  var ANIM_MS = 1500;
  var _lastVals = Object.create(null);
  var _animGroups = null;
  var _reduceMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* 呼叫端在觸發重畫「之前」宣告這次動到哪幾組 */
  function beginAnim(groups) {
    if (!groups || !groups.length) { _animGroups = null; return; }
    _animGroups = Object.create(null);
    groups.forEach(function (g) { _animGroups[g] = 1; });
  }
  function endAnim() { _animGroups = null; }

  function shouldAnim(key) {
    if (_reduceMotion || !_animGroups || !key) return false;
    return !!_animGroups[String(key).split(":")[0]];
  }

  /* suffix 可以是字串，也可以是 (n) => 字串。
     傳函式的話，括號裡的附註會跟著主數字一起滾 ——
     不然動畫中會出現「¥56,000（一晚 ¥50,000）」這種自相矛盾的畫面。 */
  function paintAmt(el, n, suffix) {
    el.textContent = fmtMain(n);
    var sfx = (typeof suffix === "function") ? suffix(n) : suffix;
    if (sfx) {
      var sm = document.createElement("small");
      sm.textContent = sfx;
      el.appendChild(sm);
    }
    var t = twdSmall(n);
    if (t) el.appendChild(t);
  }

  function stopAnim(el) {
    if (el.__raf) { cancelAnimationFrame(el.__raf); el.__raf = 0; }
    if (el.__fin) { clearTimeout(el.__fin); el.__fin = 0; }
  }

  function runCount(el, from, to, suffix) {
    stopAnim(el);
    el.classList.add("amt-bump");

    /* 立刻畫出起點，不等第一個 rAF —— 否則分頁在背景時
       rAF 被凍結，數字會整個停在上一次的值。 */
    paintAmt(el, from, suffix);

    function finish() {
      stopAnim(el);
      paintAmt(el, to, suffix);        /* 收尾一定要落在精確值 */
      el.classList.remove("amt-bump");
    }

    var t0 = 0;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / ANIM_MS);
      if (p >= 1) { finish(); return; }
      var e = 1 - Math.pow(1 - p, 3);  /* easeOutCubic：先快後慢 */
      paintAmt(el, from + (to - from) * e, suffix);
      el.__raf = requestAnimationFrame(step);
    }
    el.__raf = requestAnimationFrame(step);

    /* 保險：rAF 若被節流到不跑（背景分頁、隱藏視窗），
       時間到了還是要把正確的數字補上。 */
    el.__fin = setTimeout(finish, ANIM_MS + 400);
  }

  /* 把既有元素的內容換成「日圓大字 ＋ 台幣小字」 */
  function setAmt(elm, n, suffix, key) {
    if (!elm) return;
    var k = key || elm.id;

    if (!shouldAnim(k)) {
      stopAnim(elm);
      elm.classList.remove("amt-bump");
      if (k) _lastVals[k] = n;
      paintAmt(elm, n, suffix);
      return;
    }

    var prev = (k in _lastVals) ? _lastVals[k] : n;
    _lastVals[k] = n;

    /* 值沒變的話從低一點的地方滾上來，digits 才有東西可以動（規則②）。
       但 ¥0 的列不能往下滾 —— 會在畫面上閃出「¥-1」。 */
    var from = (prev === n)
      ? n - Math.max(1, Math.round(Math.abs(n) * 0.06))
      : prev;
    if (n >= 0 && from < 0) from = 0;

    runCount(elm, from, n, suffix);
  }

  /* 金額節點：日圓大字 ＋ 台幣小字。三個頁面共用同一個寫法 */
  function amtNode(n, cls, key) {
    var s = document.createElement("span");
    s.className = cls || "amt";
    setAmt(s, n, null, key);
    return s;
  }

  var FX_SOURCES = [
    { name: "currency-api",
      url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jpy.json",
      pick: function (j) { return j && j.jpy && j.jpy.twd; },
      when: function (j) { return j.date || ""; } },
    { name: "open.er-api",
      url: "https://open.er-api.com/v6/latest/JPY",
      pick: function (j) { return j && j.rates && j.rates.TWD; },
      when: function (j) { return (j.time_last_update_utc || "").slice(5, 16); } }
  ];

  /* 匯率列的完整行為，三個頁面共用：
     先用靜態預設值把畫面填滿（不等網路），再背景抓即時匯率覆蓋上去。
     抓不到就留在預設值，只是徽章顯示「預設值」而不是「即時」。 */
  function initFx(inputId, badgeId, onChange) {
    var input = document.getElementById(inputId);
    var badge = document.getElementById(badgeId);
    if (!input) return;

    function mark(cls, txt) { if (badge) { badge.className = cls; badge.textContent = txt; } }

    input.value = R.fxDefault;
    setFx(R.fxDefault);
    mark("fx-live stale", "預設值");

    /* onChange(userEdit)：
       true  = 使用者自己改了匯率 → 該播動畫
       false = 背景抓到即時匯率   → 不是使用者的操作，安靜換掉就好
       這個區分很重要：不然頁面一載入、匯率一回來，整頁數字全部跳一次。 */
    input.addEventListener("input", function () {
      setFx(Number(input.value) || 0);
      mark("fx-live stale", "自訂");
      if (onChange) onChange(true);
    });

    fetchFx(function (res) {
      if (!res) { mark("fx-live stale", "預設值（抓不到即時匯率）"); return; }
      input.value = Number(res.rate.toFixed(4));
      setFx(res.rate);
      mark("fx-live", "即時 " + (res.when || ""));
      if (onChange) onChange(false);
    });
  }

  /* 幣別切換列。三個頁面共用。
     切換時：① 換所有金額輸入欄的顯示 ② 重畫所有輸出 */
  function initCurrency(hostId, onChange) {
    var host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML =
      '<input type="radio" name="cur" id="cur-jpy" value="JPY" checked>' +
      '<label for="cur-jpy">¥ 日圓</label>' +
      '<input type="radio" name="cur" id="cur-twd" value="TWD">' +
      '<label for="cur-twd">NT$ 台幣</label>';
    Array.prototype.forEach.call(host.querySelectorAll('input[name="cur"]'), function (r) {
      r.addEventListener("change", function () {
        setCurrency(r.value);
        moneyRepaintAll();
        if (onChange) onChange();
      });
    });
  }

  function fetchFx(cb) {
    var i = 0;
    (function next() {
      if (i >= FX_SOURCES.length) { cb(null); return; }
      var s = FX_SOURCES[i++];
      fetch(s.url)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (j) {
          var v = s.pick(j);
          if (v > 0) cb({ rate: v, when: s.when(j), name: s.name });
          else next();
        })
        .catch(next);
    })();
  }

  /* ------------------------------------------------------------
     租車總成本
     opts = { region, days, people, car, kmPerDay, dropAway, park, cdw, rentalOverride }
     回傳 { items, total, naive, missed, hwyCost, suggestedRental }

     items[].naive = true  表示「使用者自己估預算時會算到的項目」
     items[].miss  = true  表示「使用者自己估時最常整筆忘掉的項目」
     ------------------------------------------------------------ */
  function rental(opts) {
    var reg  = R.region[opts.region];
    var car  = R.car[opts.car];
    var days = Math.max(1, Math.round(opts.days || 1));
    var kmDay = Math.max(0, opts.kmPerDay || 0);
    var totalKm = kmDay * days;
    var nights = Math.max(0, days - 1);          /* 租 3 天 = 停 2 晚 */
    var parkKey = opts.park || reg.park;

    var suggested = car.perDay * days;
    var rentalFee = (opts.rentalOverride > 0) ? opts.rentalOverride : suggested;

    var items = [
      {
        key: "rental", nm: "租車費", naive: true,
        note: car.label + " × " + days + " 天",
        amt: rentalFee
      },
      {
        key: "cdw", nm: "免責補償 CDW ＋ NOC", miss: true,
        note: opts.cdw
          ? "(" + yen(R.cdwPerDay) + " ＋ " + yen(R.nocPerDay) + ") × " + days + " 天"
          : "選擇不保",
        amt: opts.cdw ? (R.cdwPerDay + R.nocPerDay) * days : 0
      },
      {
        key: "fuel", nm: "油錢", naive: true,
        note: nf.format(totalKm) + " km ÷ " + car.kmPerL + " km/L × " + yen(R.fuelPerL) + "/L",
        amt: car.kmPerL > 0 ? (totalKm / car.kmPerL) * R.fuelPerL : 0
      },
      {
        key: "hwy", nm: "高速公路費", miss: true,
        note: "以 " + Math.round(reg.hwyRatio * 100) + "% 里程走高速估算（" +
              car.label + " 約 " + yen(car.hwyPerKm) + "/km）",
        amt: totalKm * reg.hwyRatio * car.hwyPerKm
      },
      {
        key: "park", nm: "停車費", miss: true,
        note: nights > 0
          ? (parkKey === "city" ? "市區" : "郊區") + " " + yen(R.parking[parkKey]) + " × " + nights + " 晚"
          : "當天來回，不過夜",
        amt: R.parking[parkKey] * nights
      },
      {
        key: "drop", nm: "異地還車費", miss: true,
        note: opts.dropAway ? "跨區還車加收" : "原地還車，不加收",
        amt: opts.dropAway ? R.dropOffFee : 0
      }
    ];

    var total = 0, naive = 0;
    items.forEach(function (it) {
      total += it.amt;
      if (it.naive) naive += it.amt;
    });

    return {
      items: items,
      total: total,
      naive: naive,
      missed: total - naive,
      hwyCost: items.filter(function (i) { return i.key === "hwy"; })[0].amt,
      suggestedRental: suggested
    };
  }

  /* ------------------------------------------------------------
     Expressway Pass 該不該買
     回傳 { kind, passCost, diff, name, capped, maxDay }
     kind: "none"（此區無方案）/ "buy" / "skip" / "tie"
     ------------------------------------------------------------ */
  function passVerdict(regionKey, days, hwyCost) {
    var P = R.pass[regionKey];
    if (!P) return { kind: "none" };

    var maxDay = 0;
    for (var d in P.price) { if (Number(d) > maxDay) maxDay = Number(d); }

    var useDay = Math.min(Math.max(days, 2), maxDay);
    var passCost = P.price[useDay];
    var diff = hwyCost - passCost;

    return {
      kind: Math.abs(diff) < 1000 ? "tie" : (diff > 0 ? "buy" : "skip"),
      passCost: passCost,
      diff: diff,
      name: P.name,
      useDay: useDay,
      capped: days > maxDay,
      maxDay: maxDay
    };
  }

  /* ------------------------------------------------------------
     簡單模式：住宿 / 餐食 / 鐵路交通
     這幾個是「一兩題就給粗估」用的，誤差大，但快。
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     住宿計價
     ------------------------------------------------------------
     手算驗證案例（改動後請重跑，數字來自使用者實際住過的行情）：
       APA 商務旅館 1 人 → 8,500          2 人 → 11,000   3 人 → 13,500
       Airbnb        1 人 → 9,500          2 人 →  9,500   3 人 →  9,500
                     5 人 → 19,000（超過 capacity 4，開兩間）
       青旅          1 人 → 3,500          2 人 →  7,000
     ------------------------------------------------------------ */

  /* 要開幾間（房源／房間） */
  function lodgingUnits(levelKey, people) {
    var L = R.lodging[levelKey];
    people = Math.max(1, people || 1);
    if (L.basis !== "unit") return people;
    return Math.max(1, Math.ceil(people / (L.capacity || 4)));
  }

  /* 每一間各住幾人。5 個人開兩間是 3+2，不是 3+3 ——
     用 ceil 一路乘下去會把不存在的第 6 個人也算錢。 */
  function lodgingSplit(levelKey, people) {
    var units = lodgingUnits(levelKey, people);
    people = Math.max(1, people || 1);
    var base = Math.floor(people / units), rem = people % units, out = [];
    for (var i = 0; i < units; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  /* 一間住 n 人的每晚價：基準價 ＋ 每多一人加價 */
  function lodgingRoomPrice(levelKey, n) {
    var L = R.lodging[levelKey];
    if (L.basis !== "unit") return L.perNight;
    return L.base + (L.perExtraPerson || 0) * Math.max(0, n - 1);
  }

  /* 全部房間一晚的合計 */
  function lodgingUnitPrice(levelKey, people) {
    var L = R.lodging[levelKey];
    if (L.basis !== "unit") return L.perNight * Math.max(1, people || 1);
    var sum = 0;
    lodgingSplit(levelKey, people).forEach(function (n) {
      sum += lodgingRoomPrice(levelKey, n);
    });
    return sum;
  }

  /* 簡單模式的住宿費 */
  function lodging(levelKey, people, nights) {
    var L = R.lodging[levelKey];
    return lodgingUnitPrice(levelKey, people) * nights +
           (L.cleaning || 0) * lodgingUnits(levelKey, people);
  }

  /* ------------------------------------------------------------
     住宿詳細
     opts = { type, city, pricing, nightlyRate, rooms, people, nights, onsen, meals }
     回傳 { items, total, naive, missed, perPersonNight, mealCover }

     使用者自己估住宿只會算「房價 × 晚數」。算不出來的是：
       ① 宿泊稅 —— 各市不同，還分房價級距
       ② 入湯稅 —— 泡湯另課
       ③ 服務費 —— 中價位以上常見 10～15%
       ④ 按人頭還是按房間 —— 日式旅館按人頭，看錯就差一倍
     ------------------------------------------------------------ */
  function lodgingTaxPerPersonNight(cityKey, perPersonNight) {
    var t = R.lodgingTax[cityKey];
    if (!t) return 0;
    if (t.rate) return perPersonNight * t.rate;
    var amt = 0;
    (t.tiers || []).forEach(function (tier) {
      if (perPersonNight >= tier.min) amt = tier.amt;
    });
    return amt;
  }

  function lodgingDetail(opts) {
    var L = R.lodging[opts.type];
    var people = Math.max(1, opts.people || 1);
    var nights = Math.max(0, opts.nights || 0);
    var byUnit = (L.basis === "unit");

    var units = Math.max(1, opts.rooms || lodgingUnits(opts.type, people));
    var split = lodgingSplit(opts.type, people);

    /* rateOverride 的意思隨計價方式改變：
       整間／整室 → 每間每晚；按人 → 每人每晚。 */
    var autoRate = byUnit
      ? lodgingRoomPrice(opts.type, Math.ceil(people / units))
      : L.perNight;
    var rate = (opts.rateOverride > 0) ? opts.rateOverride : autoRate;

    var roomFee;
    if (byUnit) {
      roomFee = (opts.rateOverride > 0)
        ? rate * units * nights                       /* 使用者填了實際房價 */
        : lodgingUnitPrice(opts.type, people) * nights; /* 用模型算，房間人數分配才精確 */
    } else {
      roomFee = rate * people * nights;
    }

    var City = R.lodgingTax[opts.city] || {};

    /* 民泊不是每個自治體都課宿泊稅。
       例如東京都現行制度就「不」對民泊課徵（2027-04-01 才擴大到民泊）。
       把這條漏掉的話，Airbnb 的估算會憑空多出一筆稅。 */
    var isMinpaku = (opts.type === "airbnb");
    var taxApplies = !isMinpaku || City.minpaku !== false;

    /* 宿泊稅的級距看的是「每人每晚」的住宿費，不是整筆總額 */
    var perPN = (people > 0 && nights > 0) ? roomFee / people / nights : 0;
    var taxPN = taxApplies ? lodgingTaxPerPersonNight(opts.city, perPN) : 0;

    var svcRate = (opts.serviceRate !== undefined && opts.serviceRate !== null)
      ? opts.serviceRate : (L.service || 0);
    var cleaning = (opts.cleaning !== undefined && opts.cleaning !== null)
      ? opts.cleaning : (L.cleaning || 0);

    var cleanFee = cleaning * (byUnit ? units : 1);
    var service  = roomFee * svcRate;
    var stayTax  = taxPN * people * nights;
    var bath     = opts.onsen ? R.bathTax * people * nights : 0;

    var cityLabel = City.label || "—";
    var items = [
      {
        key: "room", nm: "住宿費", naive: true,
        note: (byUnit
                ? units + (L.unitWord === "整間" ? " 個房源" : " 間") +
                  "（住 " + split.join("＋") + " 人）× " + yen(rate) + "／晚"
                : people + " 人 × " + yen(rate) + "／人／晚") + " × " + nights + " 晚",
        amt: roomFee
      },
      {
        key: "clean", nm: "清潔費", miss: true,
        note: cleanFee > 0
          ? "一次性 " + yen(cleaning) + (units > 1 ? " × " + units : "") +
            "　攤到每晚約 " + yen(nights > 0 ? cleanFee / nights : cleanFee)
          : (isMinpaku ? "多數房源已把清潔費攤進顯示的每晚價" : "此類型通常不收"),
        amt: cleanFee
      },
      {
        key: "service", nm: "平台服務費", miss: true,
        note: svcRate > 0
          ? "以 " + Math.round(svcRate * 1000) / 10 + "% 計"
          : (isMinpaku ? "多數房源已含在顯示價裡，結帳頁若另加再自行填入" : "此類型通常不收"),
        amt: service
      },
      {
        key: "staytax", nm: "宿泊稅", miss: true,
        note: !taxApplies
          ? cityLabel + "　目前不對民泊課徵"
          : (taxPN > 0
              ? cityLabel + "　每人每晚 " + yen(taxPN) + "（依 " + yen(perPN) + "／人／晚 級距）"
              : cityLabel + "　不課徵"),
        amt: stayTax
      },
      {
        key: "bathtax", nm: "入湯稅", miss: true,
        note: opts.onsen ? yen(R.bathTax) + " × " + people + " 人 × " + nights + " 晚" : "未泡湯，不課徵",
        amt: bath
      }
    ];

    var total = 0, naive = 0;
    items.forEach(function (it) { total += it.amt; if (it.naive) naive += it.amt; });

    return {
      items: items, total: total, naive: naive, missed: total - naive,
      perPersonNight: perPN,
      perNightAll: nights > 0 ? total / nights : total,
      units: units, split: split, autoRate: autoRate, byUnit: byUnit,
      isMinpaku: isMinpaku, taxApplies: taxApplies,
      mealCover: R.meals[opts.meals] ? R.meals[opts.meals].cover : 0
    };
  }

  /* yen 在上面已定義，這裡取個內部別名避免順序問題 */
  function C_yen(n) { return yen(n); }
  function food(levelKey, people, days) {
    return R.food[levelKey].perDay * people * days;
  }

  /* ------------------------------------------------------------
     混搭：一趟旅行不會每天都一樣
     ------------------------------------------------------------
     真實的行程是「兩天吃普通、一天吃好」「三晚商務旅館、一晚溫泉」。
     用單一等級套整趟一定會失真，但逐日填表又會毀掉「3 分鐘」的承諾。

     折衷是「分配天數」：欄位數量跟原本的單選一樣多，但表達得出混搭。
     mix = { 等級key: 天數 }
     ------------------------------------------------------------ */
  function mixDays(mix) {
    var n = 0;
    Object.keys(mix || {}).forEach(function (k) { n += Math.max(0, mix[k] || 0); });
    return n;
  }

  function foodMix(mix, people) {
    var sum = 0;
    Object.keys(mix || {}).forEach(function (k) {
      if (!R.food[k]) return;
      sum += R.food[k].perDay * people * Math.max(0, mix[k] || 0);
    });
    return sum;
  }

  function lodgingMix(mix, people) {
    var sum = 0;
    Object.keys(mix || {}).forEach(function (k) {
      if (!R.lodging[k]) return;
      var nights = Math.max(0, mix[k] || 0);
      if (nights > 0) sum += lodging(k, people, nights);
    });
    return sum;
  }

  /* 混搭後的「代表等級」：晚數／天數最多的那一個，拿來當文案主詞 */
  function mixDominant(mix) {
    var best = null, bestN = -1;
    Object.keys(mix || {}).forEach(function (k) {
      var n = mix[k] || 0;
      if (n > bestN) { bestN = n; best = k; }
    });
    return best;
  }
  function railSimple(regionKey, people, days) {
    return R.region[regionKey].railPerDay * people * days;
  }

  /* ------------------------------------------------------------
     鐵路詳細：逐次購票 vs 各種 Pass
     legs = { legKey: 趟數 }（1 = 單程，2 = 來回）
     回傳 { items, ticketTotal, options, best, kind }

     跟 Expressway Pass 同一套邏輯：不是叫人買，是算出「哪個最便宜」，
     包含「都不要買」這個答案。
     ------------------------------------------------------------ */
  function rail(opts) {
    var people = Math.max(1, opts.people || 1);
    var legs = opts.legs || {};
    var items = [], ticketTotal = 0;
    var regionsUsed = {};

    Object.keys(legs).forEach(function (k) {
      var trips = legs[k];
      if (!trips) return;
      var L = R.railLegs[k];
      if (!L) return;
      var amt = L.fare * trips * people;
      regionsUsed[L.region] = true;
      items.push({
        key: k, nm: L.label, naive: true,
        note: yen(L.fare) + " × " + (trips === 2 ? "來回" : "單程") + " × " + people + " 人",
        amt: amt
      });
      ticketTotal += amt;
    });

    /* 地區版 Pass 只有在「所有區間都落在同一地區」時才適用。
       跨區的新幹線一進來，就只剩全國版可選。 */
    var used = Object.keys(regionsUsed);
    var singleRegion = (used.length === 1 && used[0] !== "cross") ? used[0] : null;

    var tripDays = Math.max(0, opts.tripDays || 0);

    var options = [];
    Object.keys(R.railPass).forEach(function (k) {
      var P = R.railPass[k];
      if (P.scope !== "all" && P.scope !== singleRegion) return;
      /* 天數蓋不完整趟行程的方案，標出來，而且不能拿來當推薦解 ——
         推薦一張 7 日券給 14 天的行程，等於叫人少算一半的車票。 */
      var short = tripDays > 0 && P.days > 0 && P.days < tripDays;
      options.push({
        key: k, label: P.label, days: P.days,
        cost: P.price * people,
        diff: ticketTotal - P.price * people,
        short: short
      });
    });
    options.sort(function (a, b) { return a.cost - b.cost; });

    /* 最佳解包含「不買」，且排除天數蓋不完的方案 */
    var best = null;
    options.forEach(function (o) {
      if (!o.short && o.cost < ticketTotal && (!best || o.cost < best.cost)) best = o;
    });

    /* ---------- 當地交通 ----------
       私鐵、路線巴士、纜車，JR Pass 一律蓋不到。
       所以這一段【不能】進 Pass 的比較（比進去會讓 Pass 顯得比實際划算），
       但【必須】進總額。這兩件事分開處理是這個模組最重要的一條規則。 */
    var localDays  = tripDays || 0;
    var localRate  = (opts.localPerDay !== undefined && opts.localPerDay !== null)
      ? opts.localPerDay
      : ((R.region[opts.region] || {}).localPerDay || 0);
    var localDaily = localRate * people * localDays;
    var localExtra = (opts.localExtra || 0) * people;
    var localTotal = localDaily + localExtra;

    var localItems = [
      {
        key: "localDaily", nm: "當地交通（地鐵、市內巴士）", noPass: true,
        note: localDays > 0
          ? yen(localRate) + " ／人／日 × " + people + " 人 × " + localDays + " 天"
          : "未填行程天數",
        amt: localDaily
      },
      {
        key: "localExtra", nm: "私鐵、接駁巴士、纜車", noPass: true,
        note: localExtra > 0
          ? yen(opts.localExtra) + " ／人 × " + people + " 人"
          : "未加入。JR Pass 蓋不到這些，有的話要自己填",
        amt: localExtra
      }
    ];

    var jrCost = best ? best.cost : ticketTotal;

    return {
      items: items,
      localItems: localItems,
      ticketTotal: ticketTotal,     /* 只含 JR 長程，供 Pass 比較用 */
      localTotal: localTotal,
      jrCost: jrCost,
      total: jrCost + localTotal,   /* 總額才含當地交通 */
      options: options,
      best: best,
      kind: !ticketTotal ? "empty" : (best ? "buy" : "skip"),
      tripDays: tripDays,
      singleRegion: singleRegion
    };
  }

  /* ------------------------------------------------------------
     信心區間
     parts = [{ amt, conf }]  conf 是 ±比例
     回傳 { low, high, pct } —— pct 是加權後的整體 ± 比例

     為什麼要有這個：wizard 的總數會被「最不準的那一格」拖累，
     但使用者只會記得總數。把不確定性顯示出來，
     一方面是誠實，一方面也讓「點開詳細」這件事有明確回報。
     ------------------------------------------------------------ */
  function confidence(parts) {
    var total = 0, spread = 0;
    parts.forEach(function (p) {
      total += p.amt;
      spread += p.amt * p.conf;
    });
    return {
      low: total - spread,
      high: total + spread,
      pct: total > 0 ? spread / total : 0,
      total: total
    };
  }

  global.JPCalc = {
    nf: nf,
    yen: yen,
    twd: twd,
    setFx: setFx,
    setCurrency: setCurrency,
    getCurrency: getCurrency,
    curSign: curSign,
    fmtMain: fmtMain,
    moneyRegister: moneyRegister,
    moneySet: moneySet,
    moneyYen: moneyYen,
    moneyRepaintAll: moneyRepaintAll,
    getFx: getFx,
    twdSmall: twdSmall,
    setAmt: setAmt,
    beginAnim: beginAnim,
    endAnim: endAnim,
    amtNode: amtNode,
    fetchFx: fetchFx,
    initFx: initFx,
    initCurrency: initCurrency,
    rental: rental,
    passVerdict: passVerdict,
    lodging: lodging,
    lodgingUnits: lodgingUnits,
    lodgingUnitPrice: lodgingUnitPrice,
    lodgingRoomPrice: lodgingRoomPrice,
    lodgingSplit: lodgingSplit,
    lodgingDetail: lodgingDetail,
    lodgingTaxPerPersonNight: lodgingTaxPerPersonNight,
    food: food,
    foodMix: foodMix,
    lodgingMix: lodgingMix,
    mixDays: mixDays,
    mixDominant: mixDominant,
    railSimple: railSimple,
    rail: rail,
    confidence: confidence
  };
})(window);
