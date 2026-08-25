"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const CATALOG_URL = "https://vavoo.to/vto-cluster/mediahubmx-catalog.json";
const GROUP = "Turkey";
const M3U_FILE = path.join(__dirname, "nernur.txt");
const FETCH_TIMEOUT_MS = 20000;
const MAX_RETRIES = 5;

// -- Proxy Ayrıştırma Ve Temizleme Fonksiyonu ------------------------------
function parseProxies(envVal) {
  if (!envVal || !envVal.trim()) return [];
  
  return envVal
    .split(/[\s,]+/)
    .map((p) => p.trim().replace(/\/+$/, ""))
    .filter((p) => p.startsWith("http://") || p.startsWith("https://"));
}

const ENV_PROXIES = parseProxies(process.env.PROXY_BASE);

// Yedek liste
const FALLBACK_PROXIES = [
  "https://halil.bilalkamera20.workers.dev",
  "https://adam.bilalkamera20.workers.dev",
  "https://ner.bilalkamera20.workers.dev",
  "https://nur.bilalkamera20.workers.dev",
  "https://vavoo-iptv-proxy.bilalkamera20.workers.dev",
  "https://nernur.bilalkamera20.workers.dev",
  "https://balkica.bilalkamera20.workers.dev",
  "https://bilal.bilalkamera20.workers.dev",
  "https://vav20.bilalkamera20.workers.dev",
  "https://hmeb.bilalkamera20.workers.dev"
];

const PROXY_LIST = ENV_PROXIES.length > 0 ? ENV_PROXIES : FALLBACK_PROXIES;
let proxyIndex = 0;

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  accept: "application/json",
  "user-agent": "MediaHubMX/3.0.2",
  "x-mediahubmx-signature": "",
  connection: "keep-alive"
};

function buildBody(cursor) {
  return JSON.stringify({
    language: "tr",
    region: "TR",
    catalogId: "iptv",
    id: "iptv",
    adult: false,
    search: "",
    sort: "",
    filter: { group: GROUP },
    clientVersion: "3.0.2",
    cursor: cursor || 0,
  });
}

// Timeout kontrolü için güvenli fetch yardımcısı
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === "AbortError") {
      throw new Error(`Zaman aşımı (${timeoutMs}ms)`);
    }
    throw error;
  }
}

async function fetchPage(cursor) {
  const body = buildBody(cursor);
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(CATALOG_URL, {
        method: "POST",
        headers: HEADERS,
        body,
      }, FETCH_TIMEOUT_MS);

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const data = await res.json();
      if (data && data.error) throw new Error(`Vavoo hatası: ${data.error}`);

      return data;
    } catch (err) {
      lastErr = err;
      const wait = 1000 * attempt;
      console.warn(
        `Deneme ${attempt}/${MAX_RETRIES} başarısız (${err.message}). ${wait}ms sonra tekrar deneniyor...`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function fetchAll() {
  const items = [];
  let cursor = 0;
  let page = 0;
  const MAX_PAGES = 200;

  do {
    page++;
    const data = await fetchPage(cursor);

    if (Array.isArray(data.items) && data.items.length > 0) {
      items.push(...data.items);
    }

    console.log(
      `Sayfa ${page}: ${data.items?.length ?? 0} kanal çekildi, nextCursor=${data.nextCursor ?? "null"}`
    );

    cursor = data.nextCursor ?? null;

    if (page >= MAX_PAGES) {
      console.warn(`Maksimum sayfa sınırına ulaşıldı (${MAX_PAGES}).`);
      break;
    }
  } while (cursor !== null && cursor !== undefined);

  return items;
}

// -- Kanal İsmi Temizleme ve Kategorilendirme -----------------------------

function cleanChannelName(name) {
  if (!name) return "Bilinmeyen Kanal";
  let s = String(name);
  s = s.replace(/^\s*(?:4K\s*)?TR\s*:\s*/i, "");
  s = s.replace(/\s*\.[bcs]\b/gi, "");
  s = s.replace(/\s+(?:4K|UHD|FHD|HD\+|HD|SD|HEVC|RAW|H265|H\.265|FEED)(?=\s|$)/gi, "");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}

function normalizeForCategory(name) {
  let s = cleanChannelName(name);

  const search = [
    /\bT RK\b/g, /\bT RKIYEM\b/g, /\bBENG\b/g, /\bBENGT\b/g, /\bAK T\b/g, 
    /\bS NEMA\b/g, /\bM N KA\b/g, /\bOCUK\b/g, /\bM Z K\b/g, /\bS ZC\b/g, 
    /\bSZC\b/g, /\bLKE\b/g, /\bYE IL AM\b/g, /\bYE IL[ ]?CAM\b/g, /\bT[ÜU]RK\b/gi
  ];
  const replace = [
    'TURK', 'TURKIYEM', 'BENGU', 'BENGUT', 'AKIT', 
    'SINEMA', 'MINIKA', 'COCUK', 'MUZIK', 'SOZCU', 
    'SOZCU', 'ULKE', 'YESILCAM', 'YESILCAM', 'TURK'
  ];

  for (let i = 0; i < search.length; i++) {
    s = s.replace(search[i], replace[i]);
  }

  return s;
}

const CATEGORY_RULES = [
  {
    name: "Radyo",
    re: /\b(RADIO|RADYO)\b|\b(FM|MBAT FM|EFKAR FM|FMTV|F ?M)\b(?!\s*TV)|POWERTURK|POWER FM|SHOW RADYO|ALEM (?:FM|RADYO)|BABA RADYO|KRAL POP RADYO|PAL STATION|X NOSTALJI|RADIO ROCK|STANBUL FM/i,
  },
  {
    name: "Çocuk",
    re: /CARTOON|BOOMERANG|DISNEY|NICK(?:ELODEON|TOONS|JR|JUNIOR|\b)|BABY ?TV|BABYTV|M[İI]?N ?KA|MINIKA|POKEMON|POKÉMON|ANIMATION|ANIMASYON|TRT ?[ÇC]?OCUK|OCUK HD|\bCOCUK\b|\b[ÇC]OCUK\b|BEN ?10|ANGRY BIRDS|CAILLOU|PEPPA|PEPE|HEIDI|SIRINLER|TOM & JERRY|S[ÜU]NGER|SPIDERMAN|BARBIE|PIJAMA|PIRIL|RAFADAN|KELOGLAN|KUKULI|KUKILI|KOSTEBEK|CHICKY|BOOBA|WAKFU|GABBY|TAYO|NILOYA|PISI|LEYLEK|MASAL|CANIM KARDESIM|ADIBESA|MOMO|ALVIN|VIKINGLER|TRANSFORMERS|TROL AVCILARI|SMART COCUK|ILAHI COCUK|CILGIN ORMAN|KRAL SAKIR|SERCE KUS|ITFAYECI SAM|MUFFETIS|MAYMUNLAR|ELIF VE|ELIFIN|MIMOCAN|HAPSUU|RUYA TRENI|MASA KOCAAYI|PAK PIRPIR|LIMON ZEYTIN|GONCA TV|NASREDDIN|SEKER HOCA|SEVIMLI DOSTLAR|PAW PETROL|OSCAR COLLERDE|SL NILOYA|CBEEBIES|DUCK TV|JIM ?JAM|ENGLISH CLUB TV|EBA TV|TAV[SŞ]AN|PATRON BEBEK|D[İI]YARI|BAHA\b|SEF ROKKA|BULMACA KULESI|AKILLI TAV[SŞ]AN|AKLILI|CANIM KARDESIM|DA VINC KIDS|DA VINCI KIDS|DINAMIK ANIMASYON|DREAM ANIMASYON|MAX ANIMASYON|ENO ANIMASYON|BEST ANIMASYON|YILDIZ KIZ|KONU[SŞ]AN TOM|JURASSIC WORLD|MONTAG/i,
  },
  {
    name: "Belgesel",
    re: /DISCOVERY|NATIONAL GEOGRAPHIC|NAT ?GEO|\bHISTORY\b|ANIMAL PLANET|DA VINCI(?! KIDS)|VIASAT|BBC EARTH|LOVE NATURE|TRT BELGESEL|EPIC DRAMA|TARIH TV|TARIM TV|TGRT BELGESEL|INVESTIGATION|DMAX|DOCUBOX|DOCU SCREEN|SCIENCE|\bIZ TV\b|YABAN|OUTDOOR|CHASSE|ANIMAUX|AGRO TV|CIFTCI TV|REDBULL TV|\bTLC\b/i,
  },
  {
    name: "Spor",
    re: /BEIN SPO[RT]{0,3}S?|\bBEIN 1\b|S[- ]?SPORTS?|\bS SPORT\b|SPOR SMART|EUROSPORT|\bNBA\b|TJK TV|TIVIBU ?SPOR|TIVIBUSPOR|TRT SPOR|TABII SPOR|EXXEN SPO[RT]?|\bHT SPOR\b|EKOL SPOR|SPORTS TV|IDMAN TV|GALATASARAY TV|\bFB TV\b|\bGS TV\b|SARAN SPORT|SMART SPOR|\bSPOR\b|\bSPORT\b/i,
  },
  {
    name: "Film",
    re: /SINEMA|S[İI]NEMA|S NEMA|CINEMA|SINEMAX|SINEVIZYON|\bMOVIES?\b|MOVIEMAX|MOVIESMART|BEIN MOVIES|BEIN BOX|BOX OFFICE|\bFX\b|FX HD|YESILCAM|YE ?I ?L ?[ÇC] ?AM|YE ?I ?L ?AM|YEŞ?[İI]LC?AM|GLOBAL BOX|PROTURK|FIX CINEMA|KINGBOX|ARENA BOX|SHOWMAX|SHOW MAX|REAL BOX|SMART BOX|BEST (?:AKSIYON|BILIMKURGU|DRAM|HABABAM|IMBD|KOMEDI|KORKU|LOCA|NETFLIX|SALON|SAVAS|TURK|WESTERN|YESILCAM)|MAX (?:007|AKSIYON|GOLD|ORJINAL|PREMIER|STAR WARS|TURK|VIZYON|WESTERN)|DINAMIK (?:AKSIYON|BILIMKURGU|DRAM|IMBD|KOMEDI|KORKU|TURK|VIZYON|WESTERN|YESILCAM)|DREAM (?:AKSIYON|BEIN OFFICE|BOX|DRAM|KEMAL|KOMEDI|KORKU|LOCA|NETFLIX|SAVAS|WESTERN)|ULTRA (?:AKSIYON|BILIMKURGU|IMBD|KEMAL|KOMEDI|KORKU|TURK)|ENO (?:AKSIYON|VIZYON|WESTERN)|\bLOCA\b|\bSALON\b|\bVIZYON\b|AKSIYON|AKS[İIY]?YON|AKS YON|KOMED[İI]|\bKORKU\b|\bDRAM\b|WESTERN|BILIM ?KURGU|\bSAVAS\b|\bIMBD\b|\bIMDB\b|\bFILM\b|FILMBOX|HORROR|OSCAR|KEMAL SUNAL|\b007\b|\bCINE ?1\b|SIFIR TV|SON C BOOM|\bYERL[İI]\b|SPIDERMAN(?! TV)|ARENA BOX|MOVIE SMART|\bM ?T[UÜ]RK TV\b|\bM TURK TV\b|\bM T RK TV\b/i,
  },
  {
    name: "Dizi",
    re: /SER[İI]ES|\bDIZI\b|BEIN SERIES|D[İI]Z[İI] ?SMART|DIZISMART/i,
  },
  {
    name: "Müzik",
    re: /POWER T[UÜ]RK|POWER ?TV|POWERTURK|POWER (?:DANCE|LOVE|HD)|\bPOWER\b|KRAL POP|KRAL ?TV|\bKRAL\b|TRT M[UÜ]?Z[İI]?K|TRT MUZIK|NR ?1|NUMBER ?1|NUMBER ONE|DAMAR|ARABESK|AKUS ?T[İI]K|AHMET KAYA|IBRAHIM ERKAL|IBRAHIM TATLISES|\bTATLISES\b|ZERRIN OZER|SEZEN AKSU|TARKAN|SELDA BAGCAN|CENGIZ KURTOGLU|MAHSUN KIRMIZIGUL|MUSLUM GURSES|YILDIZ TILBE|FERDI TAYFUR|DURSUN AL|MTV LIVE|VINTAGE MUSIC|RETRO T ?RK|RETRO TURK|T[UÜ]?RK ?E POP|T RK E POP|T RK E KLASIK|SLOW KARADENIZ|\bSLOW\b|\bZARA\b|\bSONER ARICA\b|M[UÜ]Z[İI]K|\bFM TV\b|\bFMTV\b|REDBOX/i,
  },
  {
    name: "Haber",
    re: /\bHABER\b|\bNEWS\b|BLOOMBERG|\bCNN\b|EKOTURK|\bEKO ?T[UÜ]RK\b|\bEKOL\b|A ?PARA|APARA|PARANIN|HALK TV|TELE ?1|SOZCU|S ZC|\bSZC\b|BENGU ?T[UÜ]RK|BENGUTURK|TRT WORLD|\bDHA\b|LIDER HABER|FLASH HABER|MEDYA HABER|GLOBAL HABER|TRABZON HABER|BEIN SPORTS HABER|T[UÜ]RKHABER|HABERT[UÜ]RK|HABERT RK|\bARTI TV\b/i,
  },
  {
    name: "Dini",
    re: /D[İI]YANET|\bAK[İIY]?T\b|MEHTAP|H[İI]LAL|KUDUS|KUDÜS|KUD S|SEMERKAND|LALEGUL|LÂLEGÜL|L[AÂ]LEG[UÜ]L|MERCAN TV|VUSLAT|KARDELEN|DIYAR TV|\bDOST TV\b|\bYOL TV\b|\bKANAL 7\b|HAYAT|HAYIRLI|HZ MERYEM|HZ OMER|HZ YUSUF|MAM EBU|ASHABI KEHF|HASAN VE HUSEYIN|SAT ?7 T[UÜ]RK|TVNET|TRT DIYANET|\bTV ?5\b|\bTV5\b|REHBER|ILAHI|ILKE TV|MESAJ TV|SURELER|T[UÜ]RK ?E MEAL|DURSUN AL ERZINCANLI|YUNUS EMRE|CEM TV|BARBAROS TV|ASLAN TV|TYT TURK|SATRAN[ÇC]|FASIL/i,
  },
  {
    name: "Yaşam",
    re: /24 KITCHEN|GURME|BEIN GURME|LIFESTYLE|\bLIFE TV\b|FASHION|WM TV|EGE ILE GAGA|24 RAW|\bTVEM\b|\bTV EM\b|AUTOMOTO|LINE TV|BILGILENDIRME|WOMAN|TELEGRAM/i,
  },
  {
    name: "Ulusal",
    re: /^24$|\bTRT\b|\bTRT 1\b|\bTRT ?2\b|TRT2|\bTRT 3\b|TRT AVAZ|TRT T[UÜ]RK|TRT TURK|TRT KURD[İI]?|TRT WORLD|TRT 4K|TRT EBA|\bKANAL D\b|\bATV\b|ATV AVRUPA|ATV EUROPA|STAR TV|\bSTAR\b|STAR HD|SHOW TV|SHOW T[UÜ]RK|\bSHOW\b|\bFOX\b|NOW ?TV|\bNOW\b|TV ?8|TV8[.,]5|BEYAZ TV|BEYAZ HD|\bBEYAZ\b|\b360\b|24 TV|\bA2\b|A HABER|A NEWS|A PARA|A SPOR|TV ?100|TV ?4|FLASH TV|TEVE ?2|TEVE2|CNN T[UÜ]RK|CNN TURK|\bKRT\b|ULUSAL KANAL|DREAM T[UÜ]RK|DREAM TURK|\bDREAM TV\b|\bBRT ?[0-9]|\bBRTV\b|EURO ?D|EURO ?STAR|\bNTV\b|EXXEN TV|TIVI ?T[UÜ]RK|TABII|OLAY T[UÜ]RK|OLAY TURK|24 HD|24 HABER|24 KITCHEN|LKE ?TV|[UÜ]LKE ?TV|ULKE ?TV|ULKETV|TV DEN|TVDEN|KANAL AVRUPA|KANAL 7 (?:AVRUPA|EUROPA)|LKE TV|EURO D|EURO STAR|SHOW TV EUROPA|BENGU ?T[UÜ]RK|BENGU TURK|BENGUTURK|TGRT EU|D ?[ĞG] ?N TV|\bTBMM\b|TV NET|\bTV 1\b|TVO TV|BEIN IZ|\bMAX\b/i,
  },
  {
    name: "Yerel",
    re: /ADANA|AD[İI]YAMAN|AFYON|AKSARAY|ALANYA|ANAKKALE|\bANKARA\b|ANKA TV|ANKARA T[UÜ]RKIYEM|ANLIURFA|ANTALYA|\bBURSA\b|ELAZIG|ERCIS|ERZURUM|ESK[İI]SEHIR|ESK EH R|\bES TV\b|\bER TV\b|ETV KAYSERI|ETV MANISA|GAZIANTEP|\bICEL\b|K[İI]MARAS|KAHRAMANMARA|K MARAS|KAYSERI|KOCAELI|KON TV|KONYA|MALATYA|MERSIN|ORDU|ALTAS TV|SIVAS|TRABZON|TUNCELI|DERSIM|\bURFA\b|IZMIR TV|TON TV|KIBRIS|EDIRNE|DENIZLI|\bKAY TV\b|KENT T[UÜ]RK|KENT T RK|HUNAT|\bOBB\b|KANAL 12|KANAL 15|KANAL 23|KANAL 24|KANAL 26|KANAL 3\b|KANAL 32|KANAL 33|KANAL 34|KANAL 360|KANAL 42|KANAL 58|KANAL 68|KANAL FIRAT|KANAL URFA|KANAL V\b|\bKANAL Z\b|KANAL T\b|KANAL HAYAT|KANAL 68|KARADENIZ|GUNEYDOGU|GÜNEYDOĞU|\bEGE\b|MELTEM|CAY TV|TEK RUMEL|YENI KOCAELI|OLAY TV|\bGRT\b|SUN RTV|SUN TV|\bK[ÖO]Y TV\b|IZMIR|TIVI 6|TV 41|TV 42|TV 52|TV 264|KOZA TV|MC EU|MERCAN|KADIRGA|\bFANATIK\b|AS TV|ISVI|GURBET24|T\.A\.Y|TAY TV|\bTAY\b|\bTMB\b|AV TV|MAVI KARADENIZ|EGE ILE GAGA|GAZIANTEP GRT|VIYANA TV|LUYS|EDESSA|BIR TV|ANA[DK]OLU|B[İI]R TV|D[İI]YAR|ERTV|HRT|SIVAS|VIZYON 58|ADA TV|CAN TV|DEHA|SIFIR|EKIN T[UÜ]RK|AFROTURK|ARAS|ARKADAG|VATAN|D[ÖO]RU|AKSU TV|KARE TV|ON 4|ON 6|PAMUKKALE|UCANKUS|64 KARE|DENIZ POSTASI/i,
  },
];

function categorize(name) {
  const s = normalizeForCategory(name);
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(s)) return rule.name;
  }
  return "Diğer";
}

// -- M3U Dosyası Oluşturma ------------------------------------------------

function escapeAttr(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/"/g, "'");
}

function toStreamUrl(item) {
  const vavooId = item.ids?.id || item.id;
  if (!vavooId) return "";

  const targetUrl = `https://vavoo.to/vavoo-iptv/play/${vavooId}`;

  if (PROXY_LIST.length > 0) {
    const currentProxy = PROXY_LIST[proxyIndex];
    proxyIndex = (proxyIndex + 1) % PROXY_LIST.length;

    return `${currentProxy}/?url=${encodeURIComponent(targetUrl)}&master&transport=http&.m3u8`;
  }

  return targetUrl;
}

function deduplicateItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || item.type !== "iptv" || !item.url) return false;
    const vavooId = item.ids?.id || item.id;
    if (!vavooId) return false;
    
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function toM3U(items) {
  const lines = ["#EXTM3U"];
  for (const it of items) {
    const rawName = it.name ?? "Bilinmeyen Kanal";
    const cleanName = cleanChannelName(rawName);
    if (!cleanName) continue;

    const logo = it.logo ? ` tvg-logo="${escapeAttr(it.logo)}"` : "";
    const rawGroup = it.group ?? "";
    const group = (rawGroup.toLowerCase() === "turkey" || !rawGroup) 
      ? categorize(cleanName) 
      : rawGroup;
      
    const streamUrl = toStreamUrl(it);
    if (!streamUrl) continue;

    lines.push(
      `#EXTINF:-1 group-title="${escapeAttr(group)}"${logo},${cleanName}`
    );
    lines.push(streamUrl);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  console.log(`Veri çekiliyor: ${CATALOG_URL} ...`);
  console.log(`Algılanan ve Kullanılacak Aktif Proxy Sayısı: ${PROXY_LIST.length}`);

  const rawItems = await fetchAll();
  console.log(`Toplam ham kanal sayısı: ${rawItems.length}`);

  const items = deduplicateItems(rawItems);
  if (rawItems.length !== items.length) {
    console.log(`Mükerrer yayınlar temizlendi. Kalan kanal sayısı: ${items.length}`);
  }

  const m3u = toM3U(items);
  await fs.writeFile(M3U_FILE, m3u, "utf8");
  console.log(`Başarıyla oluşturuldu: ${M3U_FILE} (${items.length} kanal)`);
}

main().catch((err) => {
  console.error("Kritik Hata:", err);
  process.exit(1);
});
