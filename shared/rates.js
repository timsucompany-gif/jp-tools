/* ============================================================
   日本費用計算器 — 費率資料
   ------------------------------------------------------------
   [切點] 這個檔案未來會變成 data/*.json。
   目前做成 .js 是因為草稿要能用 file:// 雙擊開啟，
   而 file:// 下 fetch() 讀 JSON 會被 CORS 擋掉；
   <script src> 則不受限制。

   ⚠️ 所有費率目前都是「未查證的合理估計值」，verified 全部為 false。
      上線前必須逐項查官方來源，並填入 source。
   ============================================================ */
(function (global) {
  "use strict";

  global.JP_RATES = {
    updated: "2026-09-10",
    next_review: "2026-12-10",
    verified: false,

    /* 匯率預設值（可被使用者覆寫）
       正式部署時若接 GitHub Actions，會產生 shared/fx.js 覆寫這一格 */
    fxDefault: 0.205,

    /* ---------- 租車：車種 ---------- */
    car: {
      kei:    { label: "軽自動車",   perDay: 5500,  kmPerL: 20, hwyPerKm: 22, verified: false },
      normal: { label: "普通車",     perDay: 7500,  kmPerL: 15, hwyPerKm: 27, verified: false },
      suv:    { label: "休旅／廂型", perDay: 12000, kmPerL: 11, hwyPerKm: 32, verified: false }
    },

    cdwPerDay: 1100,     /* 免責補償 CDW */
    nocPerDay: 550,      /* NOC 安心補償 */
    dropOffFee: 12000,   /* 異地還車，實際依距離級距，v1 用單一估計值 */
    parking: { city: 2500, rural: 500 },   /* ¥／晚 */

    /* ⚠️ 日本汽油暫定稅率近期有變動，這一格務必查最新 */
    fuelPerL: 175,

    /* ---------- 地區 ---------- */
    region: {
      hokkaido: { label: "北海道",     km: 180, hwyRatio: 0.50, park: "rural", railPerDay: 2500, taxCity: "sapporo", localPerDay: 1500 },
      tohoku:   { label: "東北",       km: 150, hwyRatio: 0.55, park: "rural", railPerDay: 3000, taxCity: "none", localPerDay: 1200 },
      kanto:    { label: "關東",       km: 100, hwyRatio: 0.50, park: "city",  railPerDay: 1800, taxCity: "tokyo", localPerDay: 800 },
      chubu:    { label: "中部・北陸", km: 140, hwyRatio: 0.60, park: "rural", railPerDay: 3200, taxCity: "kanazawa", localPerDay: 1500 },
      kansai:   { label: "關西",       km: 110, hwyRatio: 0.50, park: "city",  railPerDay: 1800, taxCity: "kyoto", localPerDay: 800 },
      chugoku:  { label: "中國・四國", km: 140, hwyRatio: 0.60, park: "rural", railPerDay: 3500, taxCity: "none", localPerDay: 1200 },
      kyushu:   { label: "九州",       km: 150, hwyRatio: 0.60, park: "rural", railPerDay: 3000, taxCity: "fukuoka", localPerDay: 1200 },
      okinawa:  { label: "沖繩",       km: 90,  hwyRatio: 0.15, park: "rural", railPerDay: 1200, taxCity: "none", localPerDay: 1000 }
    },

    /* ---------- Expressway Pass ----------
       key = 天數，null = 該地區無面向外國旅客的通用方案
       ⚠️ 價格全為估計值，各家方案每年調整 */
    pass: {
      hokkaido: { name: "Hokkaido Expressway Pass",              price: { 2: 8700, 3: 11300, 4: 13600, 5: 15600, 6: 17300, 7: 18700 } },
      tohoku:   { name: "Tohoku Expressway Pass",                price: { 2: 5500, 3: 7000,  4: 8300,  5: 9500,  6: 10500, 7: 11400 } },
      kanto:    null,
      chubu:    { name: "Central Nippon Expressway Pass",        price: { 2: 5400, 3: 7200,  4: 8800,  5: 10300, 6: 11700, 7: 12900 } },
      kansai:   { name: "Kansai Expressway Pass",                price: { 2: 3600, 3: 4800,  4: 5900,  5: 6900,  6: 7800,  7: 8600 } },
      chugoku:  { name: "San'in-Setouchi-Shikoku Expressway Pass", price: { 2: 4500, 3: 6000, 4: 7300, 5: 8500, 6: 9600, 7: 10600 } },
      kyushu:   { name: "Kyushu Expressway Pass",                price: { 2: 3500, 3: 4300,  4: 5000,  5: 5600,  6: 6200,  7: 6800 } },
      okinawa:  null
    },

    /* ---------- 住宿（perNight = ¥／人／晚，簡單模式用）----------
       defaultPricing 是這類住宿「通常怎麼計價」：
       商務／中價位飯店按房，青旅與日式旅館按人頭。
       台灣人最常踩的坑就是把旅館的「一人 ¥25,000」看成一間房的價錢。 */
    /* ---------- 住宿 ----------
       兩種計價家族，差別是事實上的，不是為了方便：

       basis "unit"   → 一間房／一個房源的價錢，人數只在超過標準時才加錢。
                        商務旅館、中價位飯店、Airbnb 都屬於這類。
                        base = 一個人住的價，perExtraPerson = 每多一人加多少，
                        capacity = 一間最多幾人（超過就要再開一間）。
       basis "person" → 真的按人頭賣。青旅是一個床位，
                        溫泉旅館一泊二食本來就是每人報價 —— 這個區別要留著，
                        因為「一泊 ¥25,000」被看成一間房的價是台灣人最常見的誤解。

       ✅ 價格以使用者實際住過的資料校準（2026-09）：
          · APA 一間 ¥11,000／晚（2 人）→ base 8,500 + 2,500 = 11,000 ✓
          · Airbnb 2 人整間 NT$1,800–2,400 ≒ ¥8,100–10,800 → 取 9,500
          · Airbnb 3 人常見不加價 → perExtraPerson 0
       這比查來的行情表更貼近真的會用這個工具的人。 */
    lodging: {
      hostel: {
        label: "青年旅館／膠囊", basis: "person", perNight: 3500,
        defaultPricing: "person", service: 0, cleaning: 0
      },
      airbnb: {
        label: "Airbnb／民泊", basis: "unit",
        base: 9500, perExtraPerson: 0, capacity: 4,
        defaultPricing: "room", service: 0, cleaning: 0, unitWord: "整間"
      },
      business: {
        label: "商務旅館", basis: "unit",
        base: 8500, perExtraPerson: 2500, capacity: 3,
        defaultPricing: "room", service: 0, cleaning: 0, unitWord: "間"
      },
      mid: {
        label: "中價位飯店", basis: "unit",
        base: 13000, perExtraPerson: 5000, capacity: 4,
        defaultPricing: "room", service: 0.10, cleaning: 0, unitWord: "間"
      },
      ryokan: {
        label: "溫泉旅館", basis: "person", perNight: 25000,
        defaultPricing: "person", service: 0.15, cleaning: 0
      }
    },

    /* Airbnb 清潔費預設 0：2026 年起清潔費多半已攤進顯示的每晚價格，
       旅客看到的就是含清潔費的價。再加一筆是重複計算。
       欄位保留著，結帳頁真的另外列一筆時可以自己填。

       Airbnb 平台服務費：預設 0，理由見下。
       2025 年底起 Airbnb 推行「房東單一負擔 15.5%」的模式，
       旅客看到的價格就是最終價、結帳時不再另加。
       但官方說明頁顯示舊的分離模式（房東 3%＋旅客 14.1～16.5%）仍然存在，
       適用哪一種要看房源。所以預設 0 並在畫面上講清楚，讓使用者自己對結帳頁。
       ⚠️ 這一條處於過渡期，是季更新時最該重查的一項。 */
    airbnbServiceDefault: 0,

    /* ---------- 宿泊稅 ----------
       按「每人每晚的住宿費級距」課徵，各自治體自訂，逐年還在增加。
       tiers 由低到高，取符合條件的最高一階；rate 則是定率型。
       ⚠️ 全部未查證，尤其京都市 2026 年改制過，級距與上限務必重查。 */
    lodgingTax: {
      none: { label: "其他地區（免徵）", tiers: [], minpaku: false, verified: false },

      /* ✅ 已查證（2026-09）：現行為 10,000～15,000 未滿 100 円、15,000 以上 200 円，
         未滿 10,000 免稅。民泊目前「不」課徵。
         ⚠️ 2026-07-01 已公布改正條例，2027-04-01 起改為一律 3% 定率、
            免稅點 13,000 円，且課稅對象擴大到簡易宿所與民泊。
            上線前若已接近該日期，要同時提供新舊制。 */
      tokyo: {
        label: "東京都", verified: true, minpaku: false,
        tiers: [{ min: 10000, amt: 100 }, { min: 15000, amt: 200 }],
        note: "2027-04-01 起改為一律 3%、免稅點 13,000 円，並開始對民泊課徵"
      },

      /* 大阪府：民泊自始即為課稅對象（已查證方向，級距數字未逐項核對） */
      osaka: {
        label: "大阪府", verified: false, minpaku: true,
        tiers: [{ min: 7000, amt: 100 }, { min: 15000, amt: 200 }, { min: 20000, amt: 300 }]
      },

      /* ✅ 已查證（2026-09）：2026-03-01 起適用的新級距。
         課稅基礎是「不含餐費與消費稅的住宿費」，按人按晚。
         舊制只有三階（未滿 20,000→200、20,000～50,000→500、50,000 以上→1,000），
         新制細分成五階、上限拉到 10,000 円。民泊同為課稅對象。 */
      kyoto: {
        label: "京都市", verified: true, minpaku: true,
        tiers: [
          { min: 0,      amt: 200 },
          { min: 6000,   amt: 400 },
          { min: 20000,  amt: 1000 },
          { min: 50000,  amt: 4000 },
          { min: 100000, amt: 10000 }
        ]
      },

      sapporo:  { label: "札幌市", verified: false, minpaku: true, tiers: [{ min: 0, amt: 200 }] },
      fukuoka:  { label: "福岡市", verified: false, minpaku: true, tiers: [{ min: 0, amt: 200 }] },
      kanazawa: { label: "金沢市", verified: false, minpaku: true, tiers: [{ min: 0, amt: 200 }, { min: 20000, amt: 500 }] },
      kutchan:  { label: "倶知安町（定率 2%）", verified: false, minpaku: true, rate: 0.02 }
    },

    /* 入湯稅：泡湯的話另課，¥／人／晚 */
    bathTax: 150,

    /* ---------- 含餐 ----------
       cover = 這個方案涵蓋了每日餐費的多少比例。
       這一格會回饋給「餐食」分類自動折抵 ——
       訂了一泊二食卻還照常編餐費，是重複計算。 */
    meals: {
      none: { label: "純住宿",   cover: 0 },
      bf:   { label: "含早餐",   cover: 0.25 },
      half: { label: "一泊二食", cover: 0.65 }
    },

    /* ---------- 鐵路：常見區間單程票價（¥／人，指定席）----------
       region 用來判斷地區版 Pass 適不適用；"cross" 代表跨區。
       ⚠️ 票價全部未查證。 */
    /* ---------- 鐵路：常見區間單程票價（¥／人）----------
       ✅ 已查證（2026-09）：普通車指定席、通常期，運賃＋特急料金的合計。
       指定席在閑散期 −200、繁忙期 +200、最繁忙期 +400，這裡一律用通常期。
       region 用來判斷地區版 Pass 適不適用；"cross" 代表跨區。
       ⚠️ region 標記是粗略的：東京→長野實際上 JR East 的 Pass 有涵蓋，
          但本表的地區版資料還不夠細，先保守標成 cross（只讓全國版適用），
          寧可少推薦，不要推薦到用不了的 Pass。 */
    railLegs: {
      nrt_tokyo:        { label: "成田機場 → 東京市區",   fare: 3070,  region: "kanto",    verified: true, note: "N'EX：乘車券 1,340 ＋ 特急券 1,730" },
      kix_osaka:        { label: "關西機場 → 大阪市區",   fare: 1210,  region: "kansai",   verified: true, note: "關空快速" },
      tokyo_nagano:     { label: "東京 → 長野",           fare: 8450,  region: "cross",    verified: true, note: "北陸新幹線。かがやき／はくたか／あさま 同價" },
      tokyo_nagoya:     { label: "東京 → 名古屋",         fare: 11300, region: "cross",    verified: true },
      tokyo_sendai:     { label: "東京 → 仙台",           fare: 11630, region: "cross",    verified: true },
      tokyo_kyoto:      { label: "東京 → 京都",           fare: 14170, region: "cross",    verified: true },
      tokyo_kanazawa:   { label: "東京 → 金沢",           fare: 14600, region: "cross",    verified: true },
      tokyo_osaka:      { label: "東京 → 新大阪",         fare: 14720, region: "cross",    verified: true },
      tokyo_hakata:     { label: "東京 → 博多",           fare: 23810, region: "cross",    verified: true },
      osaka_hiroshima:  { label: "新大阪 → 廣島",         fare: 10950, region: "chugoku",  verified: true },
      hakata_kagoshima: { label: "博多 → 鹿児島中央",     fare: 10640, region: "kyushu",   verified: true, note: "みずほ／さくら／つばめ 同價" },
      sapporo_hakodate: { label: "札幌 → 函館",           fare: 9770,  region: "hokkaido", verified: true, note: "特急北斗，全車指定席" }
    },

    /* ---------- 當地交通 ----------
       JR Pass 蓋不到的那一段：私鐵、路線巴士、纜車。
       買了 Pass 以為全包，到現場才發現要另外付錢 —— 這是很典型的漏算。

       localPerDay（在 region 表裡）是地鐵、市內巴士這種零星移動的每日概估：
       都市 800（相當於一張地鐵一日券），山區與度假區 1,500（一趟巴士就不只這個數）。
       ⚠️ 這個每日值是估計，非逐項查證。

       ✅ 已查證的參考價（2026-09），放在畫面提示裡讓使用者自己抓額外項目：
         · 長野電鉄 長野 → 湯田中（地獄谷）單程 1,660
         · 長電巴士 長野 → 地獄谷猴子公園 單程 1,160
         · アルピコ交通 長野 → 白馬 單程 3,500
         · 觀光纜車／ゴンドラ 來回 2,000–3,000
           （石打丸山 2,000、箱根 2,500、野沢温泉長坂 2,500）*/
    localExamples: [
      { label: "長野電鉄 長野→湯田中（地獄谷）", fare: 1660, kind: "私鐵單程" },
      { label: "長電巴士 長野→猴子公園",         fare: 1160, kind: "巴士單程" },
      { label: "長野→白馬",                      fare: 3500, kind: "度假區巴士單程" },
      { label: "觀光纜車／ゴンドラ",             fare: 2500, kind: "來回" }
    ],

    /* ---------- 鐵路 Pass ----------
       scope: "all" 全國版；否則是該地區專用。
       ⚠️ 價格未查證，且 JR Pass 這幾年調過好幾次，務必重查。 */
    railPass: {
      all7:      { days: 7, label: "全國版 7 日",      price: 50000,  scope: "all" },
      all14:     { days: 14, label: "全國版 14 日",     price: 80000,  scope: "all" },
      all21:     { days: 21, label: "全國版 21 日",     price: 100000, scope: "all" },
      tohoku5:   { days: 5, label: "JR 東日本東北 5 日", price: 30000, scope: "tohoku" },
      kansai5:   { days: 5, label: "關西廣域 5 日",    price: 12000,  scope: "kansai" },
      kyushu5:   { days: 5, label: "JR 九州全區 5 日", price: 22500,  scope: "kyushu" },
      hokkaido7: { days: 7, label: "JR 北海道 7 日",   price: 27000,  scope: "hokkaido" },
      chugoku5:  { days: 7, label: "山陽山陰 7 日",    price: 23000,  scope: "chugoku" }
    },

    /* ---------- 餐食（¥／人／日）---------- */
    food: {
      thrifty: { label: "超商、平價為主", perDay: 3000 },
      normal:  { label: "一般",           perDay: 5000 },
      foodie:  { label: "講究餐廳",       perDay: 9000 }
    },

    /* ---------- 估算信心度（±%）----------
       這是「這個數字有多可信」的量化。
       簡單模式用區間平均值，誤差大；詳細模式逐項計算，誤差小。
       餐食即使精算也不會準，因為它完全取決於個人 —— 所以永遠維持高誤差，
       這是誠實，不是偷懶。 */
    confidence: {
      simple: 0.40,
      detail: 0.10,
      food:   0.35
    }
  };
})(window);
