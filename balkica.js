const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

// ============================================================
//  SABİTLER VE PROXY TANIMLARI
// ============================================================
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
const CLIENT_VERSION = '3.1.4';
const CATALOG_URL = 'https://vavoo.to/mediahubmx-catalog.json';
const OUTPUT_FILE = 'nernur.txt';

// Gelişmiş Yedekli Worker Proxy Havuzu
const FALLBACK_PROXIES = [
    "https://1.vavturktv.workers.dev",
    "https://2.vavturktv.workers.dev",
    "https://3.vavturktv.workers.dev",
    "https://4.vavturktv.workers.dev",
    "https://5.vavturktv.workers.dev",
    "https://6.vavturktv.workers.dev",
    "https://7.vavturktv.workers.dev",
    "https://8.vavturktv.workers.dev",
    "https://9.vavturktv.workers.dev",
    "https://10.vavturktv.workers.dev",
    "https://11.vavturktv.workers.dev",
    "https://12.vavturktv.workers.dev",
    "https://13.vavturktv.workers.dev",
    "https://14.vavturktv.workers.dev",
    "https://15.vavturktv.workers.dev",
    "https://16.vavturktv.workers.dev",
    "https://17.vavturktv.workers.dev",
    "https://18.vavturktv.workers.dev",
    "https://19.vavturktv.workers.dev",
    "https://20.vavturktv.workers.dev",
    "https://21.vavturktv.workers.dev",
    "https://22.vavturktv.workers.dev",
    "https://23.vavturktv.workers.dev",
    "https://24.vavturktv.workers.dev",
    "https://25.vavturktv.workers.dev",
    "https://nur.bilalkamera20.workers.dev",
    "https://halil.bilalkamera20.workers.dev",
    "https://adam.bilalkamera20.workers.dev",
    "https://bilal.bilalkamera20.workers.dev",
    "https://balkica.bilalkamera20.workers.dev",
    "https://hmeb.bilalkamera20.workers.dev",
    "https://nernur.bilalkamera20.workers.dev",
    "https://vav20.bilalkamera20.workers.dev",
    "https://vavoo-iptv-proxy.bilalkamera20.workers.dev",
    "https://yaren.bilalkamera20.workers.dev",
    "https://denem.bilalkamera20.workers.dev",
    "https://20.bilalkamera20.workers.dev",
    "https://yw.bilalkamera20.workers.dev",
    "https://fb.bilalkamera20.workers.dev",
    "https://ner.bilalkamera20.workers.dev"
];

const PING_URLS = [
    'https://www.vypn.net/api/app/ping',
    'https://www.vavoo.tv/api/app/ping',
    'https://cache.vypn.net/api/app/ping',
];

const DEFAULT_GROUPS = [
    'Turkey'
];

// Ortam değişkeninden (ENV) PROXY_BASE değerini al ve ayrıştır
function parseEnvProxies() {
    const envProxy = process.env.PROXY_BASE;
    if (!envProxy) {
        return [];
    }
    const rawList = envProxy.split(/[,;\r\n]+/);
    const proxies = [];
    for (const item of rawList) {
        const trimmed = item.trim();
        if (trimmed) {
            proxies.push(trimmed.replace(/\/+$/, ''));
        }
    }
    return proxies;
}

const envProxies = parseEnvProxies();
const workerProxies = envProxies.length > 0 ? envProxies : FALLBACK_PROXIES;

// ============================================================
//  HTTP POST
// ============================================================
async function httpPost(url, payload, extraHeaders = {}) {
    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'User-Agent': UA,
                'Accept': '*/*',
                ...extraHeaders
            },
            timeout: 20000,
            validateStatus: () => true
        });

        return {
            ok: response.status >= 200 && response.status < 400,
            body: response.data,
            code: response.status,
            err: null
        };
    } catch (error) {
        return { ok: false, body: null, code: 0, err: error.message };
    }
}

// ============================================================
//  TOKEN (İmza Alımı)
// ============================================================
async function getSignature() {
    const uid = crypto.randomBytes(16).toString('hex');
    const ts = Date.now();
    const payload = {
        reason: 'app-focus', locale: 'de', theme: 'dark',
        metadata: {
            device:  { type: 'desktop', uniqueId: uid },
            os:      { name: 'win32', version: 'Windows 10 Pro', abis: ['x64'], host: 'PC' },
            app:     { platform: 'electron' },
            version: { package: 'net.vypn.app', binary: '3.1.0', js: '3.1.0' },
        },
        appFocusTime: 0, playerActive: false, playDuration: 0,
        devMode: false, hasAddon: true, castConnected: false,
        package: 'net.vypn.app', version: '3.1.0', process: 'app',
        firstAppStart: ts, lastAppStart: ts, ipLocation: null,
        adblockEnabled: true,
        proxy: { supported: ['ss'], engine: 'Mu', enabled: false, autoServer: true },
        iap:   { supported: false },
    };

    for (const u of PING_URLS) {
        const r = await httpPost(u, payload);
        if (r.ok && r.body) {
            const d = typeof r.body === 'object' ? r.body : JSON.parse(JSON.stringify(r.body));
            const sig = d.sig || d.addonSig || d.signature || d.token || null;
            if (sig) { return sig; }
        }
    }
    return null;
}

// ============================================================
//  TEMİZLEME VE KATEGORİZASYON FONKSİYONLARI
// ============================================================
function cleanChannelName(name) {
    if (!name) return "Bilinmeyen Kanal";

    let s = String(name);
    s = s.replace(/^\s*(?:4K\s*)?TR\s*:\s*/i, '');
    s = s.replace(/\s*\.[bcs]\b/i, '');
    s = s.replace(/\s+(?:4K|UHD|FHD|HD\+|HD|SD|HEVC|RAW|H265|H\.265|FEED)(?=\s|$)/i, '');
    s = s.replace(/S\s*[\x00-\x1F\x7F-\xFF\?\s]*NEMA/gi, 'SINEMA');
    s = s.replace(/DREAM\s*T\s*R\s*K/gi, 'DREAM TURK');
    s = s.replace(/MINICA/gi, 'MINIKA');
    s = s.replace(/\s+/g, ' ');

    return s.trim();
}

function normalizeForCategory(name) {
    let s = cleanChannelName(name);

    const charMap = {
        'Ç': 'C', 'ç': 'c',
        'Ğ': 'G', 'ğ': 'g',
        'İ': 'I', 'I': 'I', 'ı': 'i',
        'Ö': 'O', 'ö': 'o',
        'Ş': 'S', 'ş': 's',
        'Ü': 'U', 'ü': 'u'
    };
    s = s.replace(/[ÇçĞğİIıÖöŞşÜü]/g, match => charMap[match]);

    const search = [/\bT RK\b/gu, /\bT RKIYEM\b/gu, /\bBENG\b/gu, /\bBENGT\b/gu, /\bAK T\b/gu, /\bS\s*NEMA\b/gu, /\bM N KA\b/gu, /\bOCUK\b/gu, /\bM Z K\b/gu, /\bS ZC\b/gu, /\bSZC\b/gu, /\bLKE\b/gu, /\bYE IL AM\b/gu, /\bYE IL[ ]?CAM\b/gu, /\bT[ÜU]RK\b/gi];
    const replace = ['TURK', 'TURKIYEM', 'BENGU', 'BENGUT', 'AKIT', 'SINEMA', 'MINIKA', 'COCUK', 'MUZIK', 'SOZCU', 'SOZCU', 'ULKE', 'YESILCAM', 'YESILCAM', 'TURK'];

    for (let i = 0; i < search.length; i++) {
        s = s.replace(search[i], replace[i]);
    }
    return s;
}

function categorizeChannel(name) {
    const s = normalizeForCategory(name);

    if (/KARADENIZ\s*BRT|TRT\s*MUZIK/i.test(s)) {
        return 'TR Diğer';
    }

    const rules = {
        'TR Spor': /BEIN SPO[RT]{0,3}S?|\bBEIN 1\b|S[- ]?SPORTS?|\bS SPORT\b|SPOR SMART|EUROSPORT|\bNBA\b|TJK TV|TIVIBU ?SPOR|TIVIBUSPOR|TRT SPOR|TABII SPOR|EXXEN SPO[RT]?|\bHT SPOR\b|EKOL SPOR|SPORTS TV|IDMAN TV|GALATASARAY TV|\bFB TV\b|\bGS TV\b|SARAN SPORT|SMART SPOR|\bSPOR\b|\bSPORT\b/i,
        'TR Radyo': /\b(RADIO|RADYO)\b|\b(FM|MBAT FM|EFKAR FM|FMTV|F ?M)\b(?!\s*TV)|POWERTURK|POWER FM|SHOW RADYO|ALEM (?:FM|RADYO)|BABA RADYO|KRAL POP RADYO|PAL STATION|X NOSTALJI|RADIO ROCK|STANBUL FM/i,
        'TR Çocuk': /CARTOON|BOOMERANG|DISNEY|NICK(?:ELODEON|TOONS|JR|JUNIOR|\b)|BABY ?TV|BABYTV|MINIKA|MINICA|POKEMON|ANIMATION|ANIMASYON|TRT ?COCUK|COCUK HD|\bCOCUK\b|ANKA|BEN ?10|ANGRY BIRDS|CAILLOU|PEPPA|PEPE|HEIDI|SIRINLER|TOM & JERRY|SUNGER|SUNGER\s*BOB|SPIDERMAN|BARBIE|PIJAMA|PIRIL|RAFADAN|KELOGLAN|KUKULI|KUKILI|KOSTEBEK|CHICKY|BOOBA|WAKFU|GABBY|TAYO|NILOYA|PISI|LEYLEK|MASAL|CANIM KARDESIM|ADIBESA|MOMO|ALVIN|VIKINGLER|TRANSFORMERS|TROL AVCILARI|SMART\s*COCUK|COCUK\s*SMART|ILAHI COCUK|CILGIN ORMAN|KRAL SAKIR|SERCE KUS|ITFAYECI SAM|MUFFETIS|MAYMUNLAR|ELIF VE|ELIFIN|MIMOCAN|HAPSUU|RUYA TRENI|MASA KOCAAYI|PAK PIRPIR|LIMON ZEYTIN|GONCA TV|NASREDDIN|SEKER HOCA|SEVIMLI DOSTLAR|PAW PETROL|OSCAR COLLERDE|SL NILOYA|CBEEBIES|DUCK TV|JIM ?JAM|ENGLISH CLUB TV|EBA TV|TAVSAN|PATRON BEBEK|DIYARI|BAHA\b|SEF ROKKA|BULMACA KULESI|AKILLI TAVSAN|AKLILI|DA VINC KIDS|DA VINCI KIDS|DINAMIK ANIMASYON|BEST ANIMASYON|YILDIZ KIZ|KONUSAN TOM|JURASSIC WORLD|MONTAG|64\s*KARE/i,
        'TR Belgesel': /DISCOVERY|NATIONAL GEOGRAPHIC|NAT ?GEO|\bHISTORY\b|ANIMAL PLANET|DA VINCI(?! KIDS)|VIASAT|BBC EARTH|LOVE NATURE|TRT BELGESEL|EPIC DRAMA|TARIH TV|TARIM TV|TGRT BELGESEL|INVESTIGATION|DMAX|DOCUBOX|DOCU SCREEN|SCIENCE|\bIZ TV\b|YABAN|OUTDOOR|CHASSE|ANIMAUX|AGRO TV|CIFTCI TV|REDBULL TV|\bTLC\b/i,
        'TR Yaşam': /24 KITCHEN|GURME|BEIN GURME|LIFESTYLE|\bLIFE TV\b|FASHION|WM TV|EGE ILE GAGA|24 RAW|\bTVEM\b|\bTV EM\b|AUTOMOTO|LINE TV|BILGILENDIRME|WOMAN|TELEGRAM/i,
        'TR Haber': /\b24\s*TV\b|\bTV\s*24\b|\b24\s*HABER\b|^24$|\bHABER\b|\bNEWS\b|BLOOMBERG|\bCNN\b|EKOTURK|\bEKO ?TURK\b|\bEKOL\b|A ?PARA|APARA|PARANIN|HALK TV|TELE ?1|SOZCU|\bSZC\b|BENGU|BENGUTURK|TRT WORLD|TRT HABER|\bDHA\b|LIDER HABER|FLASH|FLASH HABER|MEDYA HABER|GLOBAL HABER|TRABZON HABER|BEIN SPORTS HABER|TURKHABER|HABERTURK|\bARTI TV\b|\bAKIT\b|TVNET|TV NET|MELTEM|A HABER|ULKE|A NEWS|KRT|ULUSAL/i,
        'TR Film': /DREAM|DINAMIK\s*TURK|SINEMA|CINEMA|SINEMAX|SINEVIZYON|\bMOVIES?\b|MOVIEMAX|MOVIESMART|BEIN MOVIES|BEIN BOX|BOX OFFICE|\bFX\b|FX HD|YESILCAM|GLOBAL BOX|PROTURK|FIX CINEMA|KINGBOX|ARENA BOX|SHOWMAX|SHOW MAX|REAL BOX|SMART BOX|BEST (?:AKSIYON|BILIMKURGU|DRAM|HABABAM|IMBD|KOMEDI|KORKU|LOCA|NETFLIX|SALON|SAVAS|TURK|WESTERN|YESILCAM)|MAX|\bLOCA\b|\bSALON\b|\bVIZYON\b|AKSIYON|KOMEDI|\bKORKU\b|\bDRAM\b|WESTERN|BILIM ?KURGU|\bSAVAS\b|\bIMBD\b|\bIMDB\b|\bFILM\b|FILMBOX|HORROR|OSCAR|KEMAL SUNAL|\b007\b|\bCINE ?1\b|SIFIR TV|SON C BOOM|\bYERLI\b|SPIDERMAN(?! TV)|ARENA BOX|MOVIE SMART|\bMTURK TV\b/i,
        'TR Ulusal': /\bTRT\b|\bTRT 1\b|\bTRT ?2\b|TRT2|\bTRT 3\b|TRT AVAZ|TRT TURK|TRT KURDI|TRT 4K|TRT EBA|\bKANAL D\b|\bATV\b|ATV AVRUPA|ATV EUROPA|STAR TV|\bSTAR\b|STAR HD|SHOW TV|SHOW TURK|\bSHOW\b|\bFOX\b|NOW ?TV|\bNOW\b|TV ?8|TV8[.,]5|BEYAZ TV|BEYAZ HD|\bBEYAZ\b|\b360\b|\bA2\b|TV ?100|TV ?4|TEVE ?2|TEVE2|CNN TURK|\bBRT ?[0-9]|\bBRTV\b|EURO ?D|EURO ?STAR|\bNTV\b|EXXEN TV|TIVITURK|TABII|OLAY TURK|KANAL AVRUPA|\bKANAL 7\b|KANAL 7 (?:AVRUPA|EUROPA)|EURO D|EURO STAR|SHOW TV EUROPA|TGRT EU|DUGUN TV|\bTBMM\b|\bTV 1\b|TVO TV|BEIN IZ/i,
        'TR Dizi': /SERIES|\bDIZI\b|BEIN SERIES|DIZISMART/i,
        'TR Müzik': /POWER TURK|POWER ?TV|POWERTURK|POWER (?:DANCE|LOVE|HD)|\bPOWER\b|KRAL POP|KRAL ?TV|\bKRAL\b|NR ?1|NUMBER ?1|NUMBER ONE|DAMAR|ARABESK|AKUSTIK|AHMET KAYA|IBRAHIM ERKAL|IBRAHIM TATLISES|\bTATLISES\b|ZERRIN OZER|SEZEN AKSU|TARKAN|SELDA BAGCAN|CENGIZ KURTOGLU|MAHSUN KIRMIZIGUL|MUSLUM GURSES|YILDIZ TILBE|FERDI TAYFUR|DURSUN AL|MTV LIVE|VINTAGE MUSIC|RETRO TURK|TURKCE POP|TURKCE KLASIK|SLOW KARADENIZ|\bSLOW\b|\bZARA\b|\bSONER ARICA\b|MUZIK|\bFM TV\b|\bFMTV\b|REDBOX/i,
        'TR Dini': /DIYANET|MEHTAP|HILAL|KUDUS|SEMERKAND|LALEGUL|MERCAN TV|VUSLAT|KARDELEN|DIYAR TV|\bDOST TV\b|\bYOL TV\b|HAYAT|HAYIRLI|HZ MERYEM|HZ OMER|HZ YUSUF|MAM EBU|ASHABI KEHF|HASAN VE HUSEYIN|SAT ?7 TURK|TRT DIYANET|\bTV ?5\b|\bTV5\b|REHBER|ILAHI|ILKE TV|MESAJ TV|SURELER|TURKCE MEAL|DURSUN AL ERZINCANLI|YUNUS EMRE|CEM TV|BARBAROS TV|ASLAN TV|TYT TURK|SATRANC|FASIL/i,
        'TR Yerel': /TVDEN|TV DEN|ADANA|ADIYAMAN|AFYON|AKSARAY|ALANYA|ANAKKALE|\bANKARA\b|ANKA TV|ANKARA TURKIYEM|SANLIURFA|ANTALYA|\bBURSA\b|ELAZIG|ERCIS|ERZURUM|ESKISEHIR|\bES TV\b|\bER TV\b|ETV KAYSERI|ETV MANISA|GAZIANTEP|\bICEL\b|KAHRAMANMARAS|KAYSERI|KOCAELI|KON TV|KONYA|MALATYA|MERSIN|ORDU|ALTAS TV|SIVAS|TRABZON|TUNCELI|DERSIM|\bURFA\b|IZMIR TV|TON TV|KIBRIS|EDIRNE|DENIZLI|\bKAY TV\b|KENT TURK|HUNAT|\bOBB\b|KANAL 12|KANAL 15|KANAL 23|KANAL 24|KANAL 26|KANAL 3\b|KANAL 32|KANAL 33|KANAL 34|KANAL 360|KANAL 42|KANAL 58|KANAL 68|KANAL FIRAT|KANAL URFA|KANAL V\b|\bKANAL Z\b|KANAL T\b|KANAL HAYAT|GUNEYDOGU|\bEGE\b|TEK RUMELI|YENI KOCAELI|OLAY TV|\bGRT\b|SUN RTV|SUN TV|\bKOY TV\b|IZMIR|TIVI 6|TV 41|TV 42|TV 52|TV 264|KOZA TV|MC EU|MERCAN|KADIRGA|\bFANATIK\b|AS TV|ISVI|GURBET24|T\.A\.Y|TAY TV|\bTAY\b|\bTMB\b|AV TV|MAVI KARADENIZ|EGE ILE GAGA|GAZIANTEP GRT|VIYANA TV|LUYS|EDESSA|BIR TV|ANADOLU|DIYAR|ERTV|HRT|VIZYON 58|ADA TV|CAN TV|DEHA|SIFIR|EKIN TURK|AFROTURK|ARAS|ARKADAG|VATAN|DORU|AKSU TV|KARE TV|ON 4|ON 6|PAMUKKALE|UCANKUS|DENIZ POSTASI/i
    };

    for (const [cat, pattern] of Object.entries(rules)) {
        if (pattern.test(s)) {
            return cat;
        }
    }

    return 'TR Diğer';
}

// ============================================================
//  KATALOG ÇEKME
// ============================================================
async function fetchCatalogGroup(group, signature) {
    let channels = [];
    let cursor = 0;

    for (let page = 0; page < 15; page++) {
        const payload = {
            language: 'tr', region: 'TR', catalogId: 'iptv', id: 'iptv',
            adult: false, search: '', sort: 'name',
            filter: { group: group },
            cursor: cursor, clientVersion: CLIENT_VERSION,
        };

        const r = await httpPost(CATALOG_URL, payload, { 'mediahubmx-signature': signature });
        if (!r.ok) break;

        const data = typeof r.body === 'object' ? r.body : JSON.parse(JSON.stringify(r.body));
        if (!data || typeof data !== 'object') break;

        const items = data.items || [];
        if (items.length === 0) break;

        for (const itm of items) {
            const rawName = itm.name || '';
            let name = cleanChannelName(rawName);
            if (!name) name = 'Isimsiz Kanal';

            const resolvedGroup = categorizeChannel(rawName);

            let chid = '';
            if (itm.ids && typeof itm.ids === 'object') {
                chid = itm.ids.id || '';
            }
            if (!chid) chid = itm.id || '';

            let url = itm.url || itm.play || '';
            if (!url && chid) {
                url = `https://vavoo.to/vavoo-iptv/play/${chid}`;
            } else if (url && url.includes('/play/') && !url.includes('/vavoo-iptv/')) {
                url = url.replace(/^https?:\/\/[^\/]+\/play\//, 'https://vavoo.to/vavoo-iptv/play/');
            }
            if (!url) continue;

            let logo = '';
            if (itm.images && typeof itm.images === 'object') {
                logo = itm.images.logo || itm.images.poster || '';
            }
            if (!logo) logo = itm.logo || itm.poster || '';

            let tvg = '';
            if (itm.ids && typeof itm.ids === 'object') {
                tvg = itm.ids.tvg || '';
            }

            channels.push({
                name: name,
                url: url,
                group: resolvedGroup,
                logo: logo,
                tvg_id: tvg,
            });
        }

        cursor = data.nextCursor || 0;
        if (!cursor) break;
    }
    return channels;
}

// ============================================================
//  M3U ÜRETİMİ
// ============================================================
function buildM3u(channels, proxies) {
    let out = ["#EXTM3U"];
    const proxyCount = proxies.length;
    let proxyIndex = 0;

    for (const ch of channels) {
        const logo = ch.logo ? ` tvg-logo="${ch.logo}"` : '';
        const tvg = ch.tvg_id ? ` tvg-id="${ch.tvg_id}"` : '';
        
        out.push(`#EXTINF:-1${tvg} tvg-name="${ch.name}"${logo} group-title="${ch.group}",${ch.name}`);
        
        const activeProxy = proxies[proxyIndex % proxyCount];
        proxyIndex++;

        out.push(`${activeProxy.replace(/\/+$/, '')}/?url=${encodeURIComponent(ch.url)}&master&transport=http&.m3u8`);
    }
    return out.join("\n") + "\n";
}

// ============================================================
//  ANA İŞLEM
// ============================================================
(async () => {
    const sig = await getSignature();
    if (!sig) {
        console.error("Hata: İmza alınamadı!");
        process.exit(1);
    }

    let allChannels = [];
    for (const g of DEFAULT_GROUPS) {
        const groupChannels = await fetchCatalogGroup(g, sig);
        allChannels = allChannels.concat(groupChannels);
    }

    if (allChannels.length === 0) {
        console.error("Hata: Kanal bulunamadı!");
        process.exit(1);
    }

    const m3uContent = buildM3u(allChannels, workerProxies);

    // Çıktıyı nernur.txt dosyasına yaz
    fs.writeFileSync(OUTPUT_FILE, m3uContent, 'utf-8');
    console.log(`Başarılı! ${allChannels.length} kanal işlendi ve '${OUTPUT_FILE}' dosyasına kaydedildi.`);
})();
