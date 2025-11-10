require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');

const DISCORD_WEBHOOK_URL15 = "https://discord.com/api/webhooks/1434892460206850069/1NdbPDfxmmBSV_6kvoYR7qT8wZbeWAtI8wuXFmaDt30eDaVK3_a7eDf-yDNzq8wAJMMn";
const BINANCE_WS_BASE = 'wss://fstream.binance.com/stream?streams=';

const matches = [];
let neutralCount = 0;

function log(msg) {
    const taipeiTime = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Taipei',
    });
    console.log(`[${taipeiTime}] ${msg}`);
}

function classifyCandle(c) {
    const { open, high, low, close } = c;
    const body = Math.abs(close - open);
    const upperShadow = high - Math.max(open, close);
    const lowerShadow = Math.min(open, close) - low;
    const totalRange = high - low;

    if (lowerShadow > 2 * body && upperShadow <= 1.5 * body) {
        if (close > open) return 'hammer';
        else if (close < open) return 'hanging_man';
    }

    if (upperShadow > 2 * body && lowerShadow <= 1.5 * body) {
        if (close > open) return 'inverted_hammer';
        else if (close < open) return 'shooting_star';
    }

    const bodyRatio = body / totalRange;
    if (close > open && bodyRatio >= 0.7) return 'big_green';
    if (close < open && bodyRatio >= 0.7) return 'big_red';

    if (close > open && bodyRatio >= 0.5) return 'small_green';
    if (close < open && bodyRatio >= 0.5) return 'small_red';

    return 'neutral';
}

async function fetchBinancePerpSymbols() {
    const url = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
    const resp = await axios.get(url, { timeout: 30000 });
    return (resp.data.symbols || [])
        .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
        .map(s => s.symbol.toLowerCase());
}

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
        const formattedTime = new Date(m.curr.openTime).toLocaleString('en-US', {
            timeZone: 'Asia/Taipei',
        });
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
        'big_green',
        'small_green',
        'hammer',
        'doji',
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
            return deltaB - deltaA; // descending order (largest positive first)
        });

        const rows = sortedSymbols
            .map(e => {
                const changePercent = ((e.close - e.open) / e.open) * 100;
                const rangePercent = ((e.high - e.low) / e.open) * 100;

                const changeStr = changePercent >= 0
                    ? `+${changePercent.toFixed(2)}%`
                    : `${changePercent.toFixed(2)}%`;

                return `${e.symbol}\nO:${e.open} | H:${e.high} | L:${e.low} | C:${e.close} | Δ:${changeStr} | R:${rangePercent.toFixed(2)}%`;
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
}

function scheduleDiscordSend() {
    const now = new Date();

    const taipeiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    const nextTargetTaipei = new Date(taipeiNow);
    nextTargetTaipei.setUTCHours(0, 0, 0, 0); // reset to 00:00 Taipei
    nextTargetTaipei.setUTCDate(taipeiNow.getUTCDate()); // start from today
    nextTargetTaipei.setUTCHours(8, 0, 0, 0); // set to 08:00 (Taipei local)

    // If current time already past 08:00 in Taipei, move to next day
    if (taipeiNow.getUTCHours() >= 8) {
        nextTargetTaipei.setUTCDate(nextTargetTaipei.getUTCDate() + 1);
    }

    // --- Compute time difference (milliseconds) ---
    const msToNext8AM = nextTargetTaipei.getTime() - taipeiNow.getTime();

    setTimeout(async () => {
        if (matches.length) {
            await sendDiscordEmbed([...matches]);
            matches.length = 0;
            neutralCount = 0;
        }
        scheduleDiscordSend();
    }, msToNext8AM + 60000);

    const hoursLeft = Math.floor(msToNext8AM / (1000 * 60 * 60));
    const minutesLeft = Math.floor((msToNext8AM % (1000 * 60 * 60)) / (1000 * 60));
    log(`Wait ${Math.round(hoursLeft)}-hour ${Math.round(minutesLeft)}-min for the next candle`);
}

function startWebSocketConnection(symbolsChunk, index) {
    const streamPath = symbolsChunk.map(s => `${s}@kline_1d`).join('/');
    const wsUrl = BINANCE_WS_BASE + streamPath;
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => log(`WebSocket [${index}] opened for ${symbolsChunk.length} symbols`));

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
        if (type === 'neutral') {
            neutralCount += 1;
        } else {
            matches.push({ symbol: k.s, type, curr: candle });
        }
    });

    ws.on('close', () => {
        log(`WebSocket [${index}] closed. Reconnecting in 5s...`);
        setTimeout(() => startWebSocketConnection(symbolsChunk, index), 5000);
    });

    ws.on('error', (err) => log(`WebSocket error: ${err.message}`));
}

async function startWebSocketScan() {
    const symbols = await fetchBinancePerpSymbols();
    log(`Fetched ${symbols.length} perpetual USDT symbols.`);

    const chunkSize = Math.ceil(symbols.length / 3);
    for (let i = 0; i < symbols.length; i += chunkSize) {
        const chunk = symbols.slice(i, i + chunkSize);
        const wsIndex = i / chunkSize + 1;
        startWebSocketConnection(chunk, wsIndex);
    }

    scheduleDiscordSend();
}

(async () => {
    log('Starting Binance Perpetual Daily Candle Bot');
    await startWebSocketScan();
})();
