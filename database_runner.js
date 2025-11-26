const sqlite3 = require('sqlite3').verbose(); // load sqlite3
const db = new sqlite3.Database('bot_dummy.db');
db.run(`
CREATE TABLE IF NOT EXISTS candles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT,
    timeframe TEXT,
    open_time DATETIME,
    volume REAL,
    avg_volume REAL,
    volume_spike REAL,
    ema_hit TEXT,
    candle_type TEXT,
    change REAL,
    range REAL
)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_symbol_timeframe_open ON candles(symbol, timeframe, open_time)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_timeframe ON candles(timeframe)`);