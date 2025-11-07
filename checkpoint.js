/* SINGLE WS FIFTEEN TIMEFRAME
require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');

const DISCORD_WEBHOOK_URL15 = "https://discord.com/api/webhooks/1432708910602518618/M_14YE_pqVD1kdf8uOaeo0fysJ0Nkyktx50MuDI3lldScwxXEoN1tztk9S6ct71YDYBC";
const BINANCE_WS_BASE = 'wss://fstream.binance.com/stream?streams=';

const matches = []; // shared buffer for all symbols
const lastOpenTime = {}; // track last candle openTime to prevent duplicates

function log(msg) {
  const taipeiTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
  console.log(`[${taipeiTime}] ${msg}`);
}

function classifyCandle(c) {
  const { open, high, low, close } = c;
  const body = Math.abs(close - open);
  const upperShadow = high - Math.max(open, close);
  const lowerShadow = Math.min(open, close) - low;
  const totalRange = high - low;

  if (lowerShadow > 2 * body && upperShadow <= body) {
    if (close > open) return 'hammer';
    else if (close < open) return 'hanging_man';
    else return 'doji';
  }

  if (upperShadow > 2 * body && lowerShadow <= body) {
    if (close > open) return 'inverted_hammer';
    else if (close < open) return 'shooting_star';
    else return 'doji';
  }

  const bodyRatio = body / totalRange;
  if (close > open && bodyRatio >= 0.7) return 'long_green';
  if (close < open && bodyRatio >= 0.7) return 'long_red';

  return 'neutral';
}

async function fetchBinancePerpSymbols() {
  const url = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
  const resp = await axios.get(url, { timeout: 30000 });
  return (resp.data.symbols || [])
    .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
    .map(s => s.symbol.toLowerCase());
}

async function sendDiscordEmbed(matches) {
  if (!DISCORD_WEBHOOK_URL15 || !matches.length) return;

  const candleEmojiMap = {
    hammer: '🔨',
    hanging_man: '⚒️',
    inverted_hammer: '🔧',
    shooting_star: '🌟',
    long_green: '🟢',
    long_red: '🔴',
    doji: '⚪'
  };

  const colorMap = {
    long_green: 0x00FF2F,
    long_red: 0xFF0000,
    hammer: 0x00FF2F,
    hanging_man: 0xFF0000,
    inverted_hammer: 0x00FF2F,
    shooting_star: 0xFF0000,
    doji: 0xFFFFFF
  };

  // Log candlestick type breakdown
  const typeCount = matches.reduce((acc, m) => {
    acc[m.type] = (acc[m.type] || 0) + 1;
    return acc;
  }, {});
  log(`Total detected candlestick symbols: ${matches.length}`);
  log('Candlestick type breakdown:');
  for (const [type, count] of Object.entries(typeCount)) {
    log(`  ${type}: ${count}`);
  }

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
      close: m.curr.close
    });
    if (!typeOpenTime[m.type]) typeOpenTime[m.type] = formattedTime;
  }

  const candleOrder = [
    'inverted_hammer',
    'long_green',
    'hammer',
    'doji',
    'shooting_star',
    'long_red',
    'hanging_man',
  ];

  for (const type of candleOrder) {
    if (!grouped[type]) continue;
    const rows = grouped[type]
      .map(e => `${e.symbol}\nO:${e.open} | H:${e.high} | L:${e.low} | C:${e.close}`)
      .join('\n');
    const embed = {
      title: `${candleEmojiMap[type] || '❓'} — ${type.toUpperCase()}`,
      description: `There are ${grouped[type].length} symbols.`,
      timestamp: new Date().toISOString(),
      color: colorMap[type],
      fields: [{ name: typeOpenTime[type], value: rows.slice(0, 1024), inline: false }]
    };
    try { await axios.post(DISCORD_WEBHOOK_URL15, { embeds: [embed] }); }
    catch (err) { log(`Failed Discord webhook: ${err.message}`); }
  }
}

function scheduleDiscordSend() {
  const now = new Date();
  const taipeiMinutes = (now.getUTCMinutes() + 8 * 60) % 60;
  const msToNext15 = (15 - (taipeiMinutes % 15)) * 60 * 1000
                   - now.getUTCSeconds() * 1000
                   - now.getUTCMilliseconds();

  setTimeout(async () => {
    if (matches.length) {
      await new Promise(r => setTimeout(r, 10000));
      await sendDiscordEmbed([...matches]);
      matches.length = 0; // clear buffer
    }
    scheduleDiscordSend();
  }, msToNext15);
}

async function startWebSocketScan() {
  const symbols = await fetchBinancePerpSymbols();
  log(`Fetched ${symbols.length} perpetual USDT symbols.`);

  // Single WebSocket for all symbols
  const streams = symbols.map(s => `${s}@kline_15m`).join('/');
  const ws = new WebSocket(BINANCE_WS_BASE + streams);

  ws.on('open', () => log(`WebSocket opened for ${symbols.length} symbols`));

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (!data.data?.k) return;
    const k = data.data.k;
    if (!k.x) return; // only closed candles

    const candle = {
      openTime: k.t,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c)
    };

    const type = classifyCandle(candle);
    if (type && type !== 'neutral') {
      matches.push({ symbol: k.s, type, curr: candle });
    }
  });

  ws.on('close', () => {
    log('WebSocket closed. Reconnecting in 5s...');
    setTimeout(startWebSocketScan, 5000);
  });

  ws.on('error', (err) => log(`WebSocket error: ${err.message}`));

  scheduleDiscordSend();
}

// --- ENTRY POINT ---
(async () => {
  log('Starting Binance Perpetual 15m Candle Bot (Single WS)');
  await startWebSocketScan();
})();
*/