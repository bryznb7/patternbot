require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');

const DISCORD_WEBHOOK_URL15 = "https://discord.com/api/webhooks/1432708910602518618/M_14YE_pqVD1kdf8uOaeo0fysJ0Nkyktx50MuDI3lldScwxXEoN1tztk9S6ct71YDYBC";
const BINANCE_WS_BASE = 'wss://fstream.binance.com/stream?streams=';

const matches = [];
let neutralCount = 0;

const VOLUME_WINDOW = 13;
const volumeHistory = {};

const EMA_LEVELS = [12, 21, 30, 50, 100, 200];
const emaState = {};

// ---------------- SQLite Setup ----------------
const sqlite3 = require('sqlite3').verbose(); // load sqlite3
const db = new sqlite3.Database('./database/bot_fifteen.db');
db.run(`
CREATE TABLE IF NOT EXISTS candles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT,
    timeframe TEXT,
    open_time TEXT,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    avg_volume REAL,
    volume_spike REAL,
    ema_hit TEXT,
    candle_type TEXT
)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_symbol_timeframe_open ON candles(symbol, timeframe, open_time)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_timeframe ON candles(timeframe)`);

function log(msg) {
  const taipeiTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
  console.log(`[${taipeiTime}] ${msg}`);
}

// ---------------- Save matches to SQLite ----------------
function saveMatchesToDB(matches, timeframe = '15m') {
  const stmt = db.prepare(`
    INSERT INTO candles
    (symbol, timeframe, open_time, open, high, low, close, volume, avg_volume, volume_spike, ema_hit, candle_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();

  matches.forEach(e => {
    const volumeM = (e.curr.volume / 1_000_000).toFixed(2);
    const avgM = (e.avgVolume / 1_000_000).toFixed(2);
    const datecandle = new Date(e.curr.openTime).toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
    stmt.run(
      e.symbol,
      timeframe,
      datecandle,
      e.curr.open,
      e.curr.high,
      e.curr.low,
      e.curr.close,
      volumeM,
      avgM,
      e.volumeSpike.toFixed(2),
      e.emaHit?.join(',') || '',
      e.type
    );
  });

  stmt.finalize();
}


// ---------------- Candlestick Classification ----------------
function classifyCandle(c) {
  const { open, high, low, close } = c;
  const body = Math.abs(close - open);
  const upperShadow = high - Math.max(open, close);
  const lowerShadow = Math.min(open, close) - low;
  const totalRange = high - low;

  if (lowerShadow > 0.7 * body && upperShadow < 0.5 * body) {
    if (close > open) return 'hammer';
    else if (close < open) return 'hanging_man';
  }

  if (upperShadow > 0.7 * body && lowerShadow < 0.5 * body) {
    if (close > open) return 'inverted_hammer';
    else if (close < open) return 'shooting_star';
  }

  const bodyRatio = body / totalRange;
  if (close > open && bodyRatio >= 0.7) return 'big_green';
  if (close < open && bodyRatio >= 0.7) return 'big_red';

  if (close > open && bodyRatio >= 0.48) return 'small_green';
  if (close < open && bodyRatio >= 0.48) return 'small_red';

  return 'neutral';
}

// ---------------- EMA Calculation ----------------
function calculateEMA(symbol, close) {
  if (!emaState[symbol]) {
    emaState[symbol] = {};
    EMA_LEVELS.forEach(len => {
      emaState[symbol][len] = close; // initialize with first close
    });
  }

  EMA_LEVELS.forEach(len => {
    const k = 2 / (len + 1);
    emaState[symbol][len] = close * k + emaState[symbol][len] * (1 - k);
  });

  return { ...emaState[symbol] };
}

// ---------------- Wick Hit Detection ----------------
function detectWickTouch(candle, symbol) {
  if (!emaState[symbol]) return [];

  const open = candle.open;
  const close = candle.close;
  const high = candle.high;
  const low = candle.low;
  const bodyHigh = Math.max(open, close);
  const bodyLow = Math.min(open, close);

  const hitEMAs = [];

  EMA_LEVELS.forEach(ema => {
    const emaValue = emaState[symbol][ema];
    if (!emaValue) return;

    // Upper wick hit
    if (high >= emaValue && emaValue >= bodyHigh) hitEMAs.push(ema);

    // Lower wick hit
    if (low <= emaValue && emaValue <= bodyLow) hitEMAs.push(ema);
  });

  return hitEMAs; // return array of all EMAs hit
}

// ---------------- Fetch Symbols ----------------
async function fetchBinancePerpSymbols() {
  const url = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
  const resp = await axios.get(url, { timeout: 30000 });
  return (resp.data.symbols || [])
    .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
    .map(s => s.symbol.toLowerCase());
}

// ---------------- Text Chunking for Discord ----------------
function chunkTextByLine(text, maxLength = 1024) {
  const lines = text.split('\n');
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + line + '\n').length > maxLength) {
      chunks.push(currentChunk.trimEnd());
      currentChunk = '';
    }
    currentChunk += line + '\n';
  }

  if (currentChunk) chunks.push(currentChunk.trimEnd());
  return chunks;
}

// ---------------- Discord Embed ----------------
async function sendDiscordEmbed(matches) {
  if (!DISCORD_WEBHOOK_URL15 || !matches.length) return;

  const candleEmojiMap = {
    hammer: '🔨',
    hanging_man: '⚒️',
    inverted_hammer: '🔧',
    shooting_star: '🌟',
    big_green: '🟢',
    big_red: '🔴',
    small_green: '🟩',
    small_red: '🟥'
  };

  const colorMap = {
    big_green: 0x00FF2F,
    small_green: 0x00FF2F,
    big_red: 0xFF0000,
    small_red: 0xFF0000,
    hammer: 0x00FF2F,
    hanging_man: 0xFF0000,
    inverted_hammer: 0x00FF2F,
    shooting_star: 0xFF0000,
  };

  log(`Neutral candlestick count: ${neutralCount}`);
  log(`Total detected candlestick symbols: ${matches.length}`);

  const grouped = {};
  const typeOpenTime = {};
  for (const m of matches) {
    const formattedTime = new Date(m.curr.openTime).toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
    if (!grouped[m.type]) grouped[m.type] = [];
    grouped[m.type].push({
      symbol: m.symbol.toUpperCase(),
      open: m.curr.open,
      high: m.curr.high,
      low: m.curr.low,
      close: m.curr.close,
      volume: m.curr.volume,
      avgVolume: m.avgVolume || 0,
      volumeSpike: m.volumeSpike || 1.0,
      emaHit: m.emaHit
    });
    if (!typeOpenTime[m.type]) typeOpenTime[m.type] = formattedTime;
  }

  const candleOrder = [
    'inverted_hammer',
    'big_green',
    'small_green',
    'hammer',
    'shooting_star',
    'big_red',
    'small_red',
    'hanging_man',
  ];

  for (const type of candleOrder) {
    if (!grouped[type]) continue;

    const sortedSymbols = grouped[type].sort((a, b) => {
      const deltaA = (a.close - a.open) / a.open;
      const deltaB = (b.close - b.open) / b.open;
      return deltaB - deltaA;
    });

    const rows = sortedSymbols
      .map(e => {
        const changePercent = ((e.close - e.open) / e.open) * 100;
        const rangePercent = ((e.high - e.low) / e.open) * 100;
        const changeStr = changePercent >= 0
          ? `+${changePercent.toFixed(2)}%`
          : `${changePercent.toFixed(2)}%`;
        const volumeM = e.volume / 1_000_000.0;
        const avgM = e.avgVolume / 1_000_000.0;
        const spikeStr = e.volumeSpike ? `${e.volumeSpike.toFixed(2)}x` : '1.00x';
        const emaInfo = (e.emaHit && e.emaHit.length > 1) ? `EMA Hit: ${e.emaHit.join(', ')}` : '';

        return `**${e.symbol}**\nVol: ${volumeM.toFixed(2)}M (Avg ${avgM.toFixed(2)}M) | Spike: ${spikeStr}\nChange: ${changeStr} | Range: ${rangePercent.toFixed(2)}%${emaInfo ? '\n' + emaInfo : ''}`;
      })
      .join('\n');

    const chunks = chunkTextByLine(rows, 1024);
    for (let i = 0; i < chunks.length; i++) {
      const embed = {
        title: i === 0 ? `${candleEmojiMap[type] || '❓'} — ${type.toUpperCase()}` : undefined,
        description: i === 0 ? `There are ${grouped[type].length} symbols.` : undefined,
        timestamp: i === chunks.length - 1 ? new Date().toISOString() : undefined,
        color: colorMap[type],
        fields: [{
          name: i === 0 ? `${typeOpenTime[type]}` : '\u200B',
          value: chunks[i],
          inline: false
        }]
      };
      try {
        await axios.post(DISCORD_WEBHOOK_URL15, { embeds: [embed] });
      } catch (err) {
        log(`Failed Discord webhook: ${err.message}`);
      }
    }
  }
  saveMatchesToDB(matches, '15m');
}

// ---------------- Volume Spike ----------------
function recordVolumeAndComputeSpike(symbol, quoteVolume) {
  const s = symbol.toUpperCase();
  if (!volumeHistory[s]) volumeHistory[s] = [];
  volumeHistory[s].push(quoteVolume);
  if (volumeHistory[s].length > VOLUME_WINDOW) {
    volumeHistory[s].shift();
  }

  const arr = volumeHistory[s];
  const sum = arr.reduce((a, b) => a + b, 0);
  const avg = arr.length ? sum / arr.length : 0;
  return { avgVolume: avg, currentVolume: quoteVolume, volumeSpike: avg > 0 ? (quoteVolume / avg) : 1.0 };
}

// ---------------- Preload Volume & EMA History ----------------
async function preloadVolumeHistory(symbol) {
  const s = symbol.toUpperCase();
  if (!volumeHistory[s]) volumeHistory[s] = [];

  try {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=15m&limit=${VOLUME_WINDOW}`;
    const resp = await axios.get(url, { timeout: 30000 });
    const klines = resp.data;
    const volumes = klines.slice(0, -1).map(k => parseFloat(k[7]));
    volumeHistory[s] = volumes;
  } catch (err) {
    log(`Failed to preload volume history for ${s}: ${err.message}`);
  }
}

async function preloadEMAHistory(symbol) {
  const s = symbol.toUpperCase();
  try {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=15m&limit=${Math.max(...EMA_LEVELS)}`;
    const resp = await axios.get(url, { timeout: 30000 });
    const klines = resp.data;
    klines.forEach(k => {
      const close = parseFloat(k[4]);
      calculateEMA(s, close);
    });
  } catch (err) {
    log(`Failed to preload EMA for ${s}: ${err.message}`);
  }
}

// ---------------- WebSocket ----------------
function startWebSocketConnection(symbolsChunk, index) {
  const streamPath = symbolsChunk.map(s => `${s}@kline_15m`).join('/');
  const wsUrl = BINANCE_WS_BASE + streamPath;
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => log(`WebSocket [${index}] opened for ${symbolsChunk.length} symbols`));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!data.data?.k) return;
      const k = data.data.k;
      if (!k.x) return;

      const candle = {
        openTime: k.t,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.q)
      };

      const symbol = k.s;
      const { avgVolume, volumeSpike } = recordVolumeAndComputeSpike(symbol, candle.volume);
      calculateEMA(symbol, candle.close); // Update EMA
      const type = classifyCandle(candle);
      const emaHit = detectWickTouch(candle, symbol);

      if (type === 'neutral') {
        neutralCount += 1;
      } else {
        matches.push({
          symbol,
          type,
          curr: candle,
          avgVolume,
          volumeSpike,
          emaHit
        });
      }
    } catch (err) {
      log('Error parsing WS message: ' + (err.message || err));
    }
  });

  ws.on('close', () => {
    log(`WebSocket [${index}] closed. Reconnecting in 5s...`);
    setTimeout(() => startWebSocketConnection(symbolsChunk, index), 5000);
  });

  ws.on('error', (err) => log(`WebSocket [${index}] error: ${err.message}`));
}

// ---------------- Discord Scheduler ----------------
function scheduleDiscordSend() {
  const now = new Date();
  const taipeiMinutes = (now.getUTCMinutes() + 8 * 60) % 60;
  const msToNext15 = (15 - (taipeiMinutes % 15)) * 60 * 1000
    - now.getUTCSeconds() * 1000
    - now.getUTCMilliseconds();

  setTimeout(async () => {
    const start = Date.now();  // Start timing

    if (matches.length) {
      await sendDiscordEmbed([...matches]);
      matches.length = 0;
      neutralCount = 0;
    } else {
      log('No matches found.');
    }

    const elapsed = Date.now() - start;  // milliseconds
    const dynamicDelay = elapsed + 1000; // +1s buffer
    log(`Processing took ${(elapsed / 1000).toFixed(2)}s. Adding delay: ${(dynamicDelay / 1000).toFixed(2)}s`);
    neutralCount = 0;
    // Now schedule next run using dynamic delay
    setTimeout(() => {
      scheduleDiscordSend();
    }, dynamicDelay);
  }, msToNext15 + 120000);

  log(`Wait ${Math.round(msToNext15 / (1000 * 60))}-min for the next candle`);
}

// ---------------- Start Bot ----------------
async function startWebSocketScan() {
  const symbols = await fetchBinancePerpSymbols();
  log(`Fetched ${symbols.length} perpetual USDT symbols.`);

  // Preload volume and EMA history in batches
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    await Promise.all(batch.map(s => preloadVolumeHistory(s)));
    await Promise.all(batch.map(s => preloadEMAHistory(s)));
  }

  const chunkSize = Math.ceil(symbols.length / 3);
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    const wsIndex = i / chunkSize + 1;
    startWebSocketConnection(chunk, wsIndex);
  }

  scheduleDiscordSend();
}

// ---------------- Main ----------------
(async () => {
  log('Starting Binance Perpetual 15m Candle Bot');
  await startWebSocketScan();
})();