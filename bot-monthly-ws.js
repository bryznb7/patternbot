require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');

const DISCORD_WEBHOOK_URL15 = "https://discord.com/api/webhooks/1437124448473055274/TklUH8747c85jkreu65csUnNwq2QzDparKklEoyiJw4yBpNtg6gyP7cZC6xiEMVM-85y";
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
            close: m.curr.close,
            volume: m.curr.volume
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

                const volumeM = e.volume / 1000000.0;
                return `**${e.symbol}**\nVolume: ${volumeM.toFixed(2)}M | Change: ${changeStr} | Range: ${rangePercent.toFixed(2)}%`;
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

    // --- Build the next target time (1st day of next month, 08:00 Taipei) ---
    const nextTargetTaipei = new Date(taipeiNow);
    nextTargetTaipei.setUTCHours(8, 0, 0, 0); // 08:00 (Taipei local)
    nextTargetTaipei.setUTCDate(1); // set to 1st day of the month

    // If current time is already past 08:00 on the 1st, move to next month
    if (
        taipeiNow.getUTCDate() > 1 ||
        (taipeiNow.getUTCDate() === 1 && taipeiNow.getUTCHours() >= 8)
    ) {
        nextTargetTaipei.setUTCMonth(nextTargetTaipei.getUTCMonth() + 1);
        nextTargetTaipei.setUTCDate(1);
        nextTargetTaipei.setUTCHours(8, 0, 0, 0);
    }

    // --- Calculate time difference ---
    const msToNextMonth = nextTargetTaipei.getTime() - taipeiNow.getTime();

    // --- Schedule the next execution ---
    setTimeout(async () => {
        if (matches.length) {
            await sendDiscordEmbed([...matches]);
            matches.length = 0;
            neutralCount = 0;
        }
        scheduleDiscordSend(); // reschedule for next month
    }, msToNextMonth + 60000); // 1-min delay buffer

    // --- Log readable countdown ---
    const daysLeft = Math.floor(msToNextMonth / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor((msToNextMonth % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutesLeft = Math.floor((msToNextMonth % (1000 * 60 * 60)) / (1000 * 60));

    log(`Wait ${daysLeft}d ${hoursLeft}h ${minutesLeft}m until next monthly candle (08:00 Taipei)`);
}



function startWebSocketConnection(symbolsChunk, index) {
    const streamPath = symbolsChunk.map(s => `${s}@kline_1M`).join('/');
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
            close: parseFloat(k.c),
            volume: parseFloat(k.q)
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
    log('Starting Binance Perpetual Monthly Candle Bot');
    await startWebSocketScan();
})();
