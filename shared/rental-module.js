/* ============================================================
   租車詳細模組 —— 一份程式碼，兩個入口
   ------------------------------------------------------------
   （A）standalone: true   → 獨立的 /calc/rental-car/ 頁面（SEO 入口）
                             自己擁有 地區／天數／人數 三個欄位
   （B）standalone: false  → wizard 的「交通 → 精算」展開區
                             這三個欄位由 wizard 的步驟 1 注入，模組不重複問

   這個 standalone 參數就是整個架構的重點。
   如果五個計算器各寫各的，每個都自己問一次天數人數，
   就永遠組不成 wizard —— 那才是之後真正貴的地方。
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

    /* ---------- 產生表單 ---------- */
    var regionOpts = Object.keys(R.region).map(function (k) {
      return '<option value="' + k + '"' + (k === "kyushu" ? " selected" : "") + '>' +
             R.region[k].label + "</option>";
    }).join("");

    var ownFields = !standalone ? "" :
      '<div class="grid g2">' +
        '<div><label class="fld" for="rm-region">地區</label>' +
          '<select id="rm-region">' + regionOpts + "</select></div>" +
        '<div><label class="fld" for="rm-days">租幾天</label>' +
          '<input type="number" id="rm-days" min="1" max="30" step="1" value="3" inputmode="numeric"></div>' +
      "</div>" +
      '<div class="grid g2" style="margin-top:14px">' +
        '<div><label class="fld" for="rm-people">幾個人分攤</label>' +
          '<input type="number" id="rm-people" min="1" max="9" step="1" value="2" inputmode="numeric"></div>' +
        '<div><label class="fld" for="rm-km">每天大約開幾公里</label>' +
          '<input type="number" id="rm-km" min="0" max="800" step="10" value="150" inputmode="numeric"></div>' +
      "</div>";

    var sharedKm = standalone ? "" :
      '<div><label class="fld" for="rm-km">每天大約開幾公里</label>' +
        '<input type="number" id="rm-km" min="0" max="800" step="10" value="150" inputmode="numeric"></div>';

    var form = el(
      "<div>" + ownFields +
      '<div style="margin-top:16px"><span class="fld">車種</span><div class="segs">' +
        '<input type="radio" name="rm-car" id="rm-car-kei" value="kei"><label for="rm-car-kei">軽自動車</label>' +
        '<input type="radio" name="rm-car" id="rm-car-normal" value="normal" checked><label for="rm-car-normal">普通車</label>' +
        '<input type="radio" name="rm-car" id="rm-car-suv" value="suv"><label for="rm-car-suv">休旅／廂型</label>' +
      "</div></div>" +
      '<div class="grid g2" style="margin-top:16px">' + sharedKm +
        '<div><span class="fld">還車地點</span><div class="segs">' +
          '<input type="radio" name="rm-drop" id="rm-drop-same" value="same" checked><label for="rm-drop-same">原地還</label>' +
          '<input type="radio" name="rm-drop" id="rm-drop-away" value="away"><label for="rm-drop-away">異地還</label>' +
        "</div></div>" +
        '<div><span class="fld">晚上停哪</span><div class="segs">' +
          '<input type="radio" name="rm-park" id="rm-park-city" value="city"><label for="rm-park-city">市區飯店</label>' +
          '<input type="radio" name="rm-park" id="rm-park-rural" value="rural" checked><label for="rm-park-rural">郊區／溫泉</label>' +
        "</div></div>" +
      "</div>" +
      '<div class="grid g2" style="margin-top:16px">' +
        '<div><label class="fld" for="rm-rental">租車報價（¥／全程，可覆寫）</label>' +
          '<input type="number" id="rm-rental" min="0" step="500" value="0" inputmode="numeric">' +
          '<p class="hint" id="rm-rentalHint"></p></div>' +
        '<div><span class="fld">免責補償 CDW ＋ NOC</span><div class="segs">' +
          '<input type="radio" name="rm-cdw" id="rm-cdw-yes" value="yes" checked><label for="rm-cdw-yes">要保</label>' +
          '<input type="radio" name="rm-cdw" id="rm-cdw-no" value="no"><label for="rm-cdw-no">不保</label>' +
        "</div>" +
        '<p class="hint">不保的話，擦撞自付額最高可能到數十萬日圓。</p></div>' +
      "</div></div>"
    );

    var out = el(
      "<div>" +
        (opts.showHero === false ? "" :
        '<div class="hero" style="margin-top:20px">' +
          '<div class="row"><span class="k">自己估的話（租車＋油錢）</span><span class="v" id="rm-naive">—</span></div>' +
          '<div class="row"><span class="k">實際大約要花</span><span class="v" id="rm-real">—</span></div>' +
          '<div class="row gap"><span class="k">你會少估</span><span class="v" id="rm-gap">—</span></div>' +
          '<p class="why">多出來的是保險、高速費、停車費、還車費 — 這四筆是自己估預算時最常整筆忘掉的。</p>' +
        "</div>") +
        '<h3 style="font-size:15px;margin:18px 0 6px">錢花在哪</h3>' +
        '<ul class="bd" id="rm-break"></ul>' +
        (opts.showPass === false ? "" :
        '<h3 style="font-size:15px;margin:22px 0 8px">Expressway Pass 該不該買</h3>' +
        '<div id="rm-verdict"></div>' +
        '<div class="cmp">' +
          '<div><span class="k">不買，逐次付高速費</span><span class="v" id="rm-nopass">—</span></div>' +
          '<div><span class="k">買 Pass</span><span class="v" id="rm-passcost">—</span></div>' +
        "</div>" +
        '<p class="hint" id="rm-passnote"></p>') +
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

    /* wizard 模式下由外部注入 */
    /* days   = 租車天數（決定租金、保險、停車晚數）
       tripDays = 整趟行程天數，只用來提醒「不是整趟都在開車」。
       兩者分開是因為很少有人整趟都租車 —— 混在一起會直接高估。 */
    var ctx = { region: "kyushu", days: 3, tripDays: 3, people: 2, fx: R.fxDefault };
    var lastRegion = null, lastDays = null, rentalTouched = false, result = null;

    C.moneyRegister($("rm-rental"), 0);
    $("rm-rental").addEventListener("input", function () { rentalTouched = true; });

    function read() {
      if (standalone) {
        ctx.region = $("rm-region").value;
        ctx.days   = Math.max(1, Math.round(num("rm-days", 1)));
        ctx.people = Math.max(1, Math.round(num("rm-people", 1)));
      }
      return ctx;
    }

    function run(external) {
      if (!external) C.beginAnim(["move", "total"]);
      read();
      var reg = R.region[ctx.region];

      /* 換地區 → 帶入該區預設里程與停車型態 */
      if (ctx.region !== lastRegion) {
        lastRegion = ctx.region;
        $("rm-km").value = reg.km;
        $("rm-park-" + reg.park).checked = true;
      }

      var carKey = radio("rm-car");
      var suggested = R.car[carKey].perDay * ctx.days;

      /* 天數變了 → 使用者填的「全程總價」要等比調整，
         否則改天數會靜靜地少算錢，違反這個工具存在的理由 */
      if (!rentalTouched || C.moneyYen($("rm-rental")) === 0) {
        C.moneySet($("rm-rental"), suggested);
      } else if (lastDays !== null && lastDays !== ctx.days && lastDays > 0) {
        C.moneySet($("rm-rental"),
          Math.round(C.moneyYen($("rm-rental")) * ctx.days / lastDays / 100) * 100);
      }
      lastDays = ctx.days;

      document.querySelector('label[for="rm-rental"]').textContent =
        "租車報價（" + C.curSign() + "／全程，可覆寫）";

      $("rm-rentalHint").textContent =
        "預設為 " + R.car[carKey].label + " × " + ctx.days + " 天的行情估計（" +
        C.yen(suggested) + "）。透過比價平台通常比直營官網便宜，有實際報價請直接覆寫。";

      result = C.rental({
        region: ctx.region, days: ctx.days, people: ctx.people, car: carKey,
        kmPerDay: num("rm-km", reg.km),
        dropAway: radio("rm-drop") === "away",
        park: radio("rm-park"),
        cdw: radio("rm-cdw") === "yes",
        rentalOverride: C.moneyYen($("rm-rental"))
      });

      render();
      if (opts.onChange) opts.onChange(result, ctx);
    }

    function render() {
      if ($("rm-naive")) {
        C.setAmt($("rm-naive"), result.naive, null, "move:naive");
        C.setAmt($("rm-real"),  result.total,  null, "move:real");
        C.setAmt($("rm-gap"),   result.missed, null, "move:gap");
      }

      var ul = $("rm-break");
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
        li.appendChild(C.amtNode(it.amt, "amt", "move:car:" + it.key));
        ul.appendChild(li);
      });

      if (!$("rm-verdict")) return;

      var v = C.passVerdict(ctx.region, ctx.days, result.hwyCost);
      var box = $("rm-verdict");
      C.setAmt($("rm-nopass"), result.hwyCost, null, "move:nopass");

      if (v.kind === "none") {
        box.className = "verdict none";
        box.innerHTML = '<p class="big">這個地區沒有適合的 Pass</p><p class="sm">' +
          R.region[ctx.region].label + '目前沒有面向外國旅客的通用 Expressway Pass 方案，逐次付高速費即可。</p>';
        $("rm-passcost").textContent = "—";
        $("rm-passnote").textContent = "";
        return;
      }

      C.setAmt($("rm-passcost"), v.passCost, null, "move:passcost");
      if (v.kind === "tie") {
        box.className = "verdict tie";
        box.innerHTML = '<p class="big">差不多，買不買都行</p><p class="sm">兩邊只差 ' +
          C.yen(Math.abs(v.diff)) + '。想省掉每次過收費站的麻煩就買，不然不買也沒差。</p>';
      } else if (v.kind === "buy") {
        box.className = "verdict buy";
        box.innerHTML = '<p class="big">建議買，省 ' + C.yen(v.diff) + '</p><p class="sm">' +
          v.name + "（" + v.useDay + " 日）比逐次付費划算。</p>";
      } else {
        box.className = "verdict skip";
        box.innerHTML = '<p class="big">不用買，買了會多花 ' + C.yen(-v.diff) + '</p><p class="sm">你這趟的高速里程還不夠讓 ' +
          v.name + " 回本。</p>";
      }
      $("rm-passnote").textContent =
        (v.capped ? "你的天數超過方案上限，以 " + v.maxDay + " 日價格計算，超出的天數要另外付費。" : "") +
        " Pass 多為外國旅客限定、需搭配指定租車公司與 ETC 卡，且各家方案每年調整 — 上線前務必查最新官方頁面。";
    }

    /* 綁定 */
    ["rm-region", "rm-days", "rm-people", "rm-km", "rm-rental"].forEach(function (id) {
      var e = $(id); if (!e) return;
      e.addEventListener("input", run);
      e.addEventListener("change", run);
    });
    ["rm-car", "rm-drop", "rm-park", "rm-cdw"].forEach(function (n) {
      Array.prototype.forEach.call(document.querySelectorAll('input[name="' + n + '"]'), function (e) {
        e.addEventListener("change", function () {
          if (n === "rm-car") rentalTouched = false;
          run();
        });
      });
    });

    run();

    return {
      /* wizard 用：把步驟 1 的共用設定推進來 */
      setContext: function (c) {
        if (c.region !== undefined) ctx.region = c.region;
        if (c.days     !== undefined) ctx.days     = c.days;
        if (c.tripDays !== undefined) ctx.tripDays = c.tripDays;
        if (c.people !== undefined) ctx.people = c.people;
        if (c.fx     !== undefined) ctx.fx     = c.fx;
        run(true);
      },
      getResult: function () { return result; }
    };
  }

  global.JPRentalModule = { mount: mount };
})(window);
