require('dotenv').config();
const axios = require('axios');

const DISCORD_WEBHOOK_URL15 = "https://discord.com/api/webhooks/1432708910602518618/M_14YE_pqVD1kdf8uOaeo0fysJ0Nkyktx50MuDI3lldScwxXEoN1tztk9S6ct71YDYBC";
if (!DISCORD_WEBHOOK_URL15) {
  console.warn('DISCORD_WEBHOOK_URL15 not set. Set it before running to send Discord messages.');
}

const BINANCE_FAPI = 'https://fapi.binance.com';
const REQUEST_DELAY_MS = parseInt(process.env.REQUEST_DELAY_MS || '50', 10); 
const KLIMIT = 2; 

function log(msg) {
  const taipeiTime = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Taipei',
      month: 'short',  
    });
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
  const url = `${BINANCE_FAPI}/fapi/v1/exchangeInfo`;
  const resp = await axios.get(url, { timeout: 30000 });
  return (resp.data.symbols || [])
    .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
    .map(s => s.symbol);
}

async function fetchBinanceKlines(symbol, interval = '15m', limit = KLIMIT) {
  const url = `${BINANCE_FAPI}/fapi/v1/klines`;
  try {
    const resp = await axios.get(url, { params: { symbol, interval, limit }, timeout: 20000 });
    return resp.data.map(k => ({
      openTime: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (err) {
    if (err.response) log(`Kline fetch error for ${symbol}: ${err.response.status}`);
    else log(`Kline fetch error for ${symbol}: ${err.message}`);
    return null;
  }
}

async function sendDiscordEmbed(matches) {
  if (!DISCORD_WEBHOOK_URL15) { 
    log('No webhook configured — skipping Discord send.'); 
    return; 
  }

  if (!matches.length) {
    await axios.post(DISCORD_WEBHOOK_URL15, { embeds: [embed] });
    log('Sent Discord "none found" embed.');
    return;
  }

  const candleEmojiMap = {
    hammer: '🔨',
    hanging_man: '⚒️',
    inverted_hammer: '🔧',
    shooting_star: '🌟',
    long_green: '🟢',
    long_red: '🔴',
    doji: '⚪'
  };

  const grouped = {};
  const typeOpenTime = {};
  for (const m of matches) {
    const formattedTime = new Date(m.curr.openTime).toLocaleString('en-US', {
      timeZone: 'Asia/Taipei',
      month: 'short',  
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
    if (!grouped[m.type]) grouped[m.type] = [];
      grouped[m.type].push({
        symbol: m.symbol,
        open: m.curr.open,
        high: m.curr.high,
        low: m.curr.low,
        close: m.curr.close
      });

    if (!typeOpenTime[m.type]) typeOpenTime[m.type] = formattedTime;
  }

  const colorMap = {
    long_green: 0x00FF2F,
    long_red: 0xFF0000,
    hammer: 0x00FF2F,
    hanging_man: 0xFF0000,
    inverted_hammer: 0x00FF2F,
    shooting_star: 0xFF0000,
    doji: 0xFFFFFF
  };

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

    const openTimeLabel = typeOpenTime[type];

    const embed = {
      title: `${candleEmojiMap[type] || '❓'} — ${type.toUpperCase()}`,
      description: `There are ${grouped[type].length} symbols.`,
      timestamp: new Date().toISOString(),
      color: colorMap[type],
      fields: [
        {
          name: `${openTimeLabel}`,
          value: rows.slice(0, 1024), 
          inline: false
        }
      ]
    };

    try {
      await axios.post(DISCORD_WEBHOOK_URL15, { embeds: [embed] });
      log(`Sent Discord embed for type ${type} with ${grouped[type].length} symbol(s).`);
    } catch (err) {
      log(`Failed to send Discord webhook for type ${type}: ${err.message}`);
    }
  }
}

const BATCH_SIZE = 45; 

async function scanBinancePerps() {
  log('Starting 15-minute scan...');
  
  let symbols;
  try {
    symbols = await fetchBinancePerpSymbols();
  } catch (err) {
    log(`Failed to fetch symbols: ${err.message}`);
    return;
  }
  log(`Fetched ${symbols.length} Binance USDT symbols.`);

  const matches = [];
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (sym) => {
      const klines = await fetchBinanceKlines(sym, '15m', 2); 
      const curr = klines[klines.length - 1]; 
      lastProcessedTime[sym] = curr.openTime;
      const typ = classifyCandle(curr);
      if (typ && typ !== 'neutral') {
        matches.push({ symbol: sym, type: typ, curr });
      }
    });

    await Promise.allSettled(batchPromises);
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS)); 
  }

  log(`Scan complete. Found ${matches.length} candle pattern(s).`);
  await sendDiscordEmbed(matches);
}

function msUntilNext15MinTaipei() {
  const now = new Date();
  const taipeiMinute = (now.getUTCMinutes() + 8 * 60) % 60;
  const next = new Date(now.getTime());
  next.setUTCMinutes(now.getUTCMinutes() + (15 - (taipeiMinute % 15)));
  next.setUTCSeconds(0, 0);
  return next.getTime() - now.getTime();
}

async function startScheduler() {
  async function runOnceAndReschedule() {
    try {
      await scanBinancePerps();
    } catch (err) {
      log(`Scan failed: ${err.message}`);
    }

    const waitMs = msUntilNext15MinTaipei();
    log(`Next scan scheduled in ${Math.round(waitMs / (1000 * 60))}-min`);
    setTimeout(runOnceAndReschedule, waitMs);
  }

  const initialDelay = msUntilNext15MinTaipei();
  log(`Sleeping ${Math.round(initialDelay / (1000 * 60))}-min until next candle...`);
  setTimeout(runOnceAndReschedule, initialDelay);
}

(async () => {
  log('Binance Perpetual 15m Engulfing Bot starting...');
  await startScheduler();
})();
