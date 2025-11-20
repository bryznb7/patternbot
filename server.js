const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const app = express();
const PORT = 3000;

app.use(cors()); // allow frontend to access backend

const DB_PATH = "database/bot_fifteen.db"; // one level up

function queryCandles({ symbol, type, tf, minspike }) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        let sql = `SELECT open_time, symbol, candle_type, open, high, low, close, volume, avg_volume, volume_spike, ema_hit, timeframe
                   FROM candles WHERE 1=1`;
        const params = [];

        if (symbol) {
            sql += " AND symbol = ?";
            params.push(symbol.toUpperCase());
        }
        if (type) {
            sql += " AND candle_type = ?";
            params.push(type);
        }
        if (tf) {
            sql += " AND timeframe = ?";
            params.push(tf);
        }
        if (minspike) {
            sql += " AND volume_spike >= ?";
            params.push(parseFloat(minspike));
        }

        sql += " ORDER BY open_time DESC LIMIT 1000"; // limit for performance

        db.all(sql, params, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
        });
    });
}


app.get("/api/candles", async (req, res) => {
    try {
        const data = await queryCandles(req.query);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
