const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const app = express();
const PORT = 3000;

app.use(cors()); // allow frontend to access backend

const DB_PATH = "bot_dummy.db"; // one level up

function queryCandles({ symbol, type, tf, minspike, minvolume, minchange, minrange, typedate, exactTimeF, exactTimeT, emaHit }) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        let sql = `SELECT open_time, symbol, candle_type, volume, avg_volume, volume_spike, ema_hit, timeframe, change, range
                   FROM candles WHERE 1=1`;
        const params = [];
        console.log("In");
        if (symbol) {
            sql += " AND symbol LIKE ?";
            params.push(symbol.toUpperCase() + "%");
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
        if (minvolume) {
            sql += " AND volume >= ?";
            params.push(parseFloat(minvolume));
        }
        if (minchange) {
            sql += " AND change >= ?";
            params.push(parseFloat(minchange));
        }
        if (minrange) {
            sql += " AND range >= ?";
            params.push(parseFloat(minrange));
        }
        if (typedate == "exact" && exactTimeF) {
            console.log(`Open time = ${exactTimeF}`);
            sql += " AND open_time = ?";
            params.push(exactTimeF);
        } else if (exactTimeF && exactTimeT) {
            console.log(`Open time >= ${exactTimeF}, <= ${exactTimeT}`);
            sql += " AND open_time >= ? AND open_time <= ?";
            params.push(exactTimeF, exactTimeT);
        }
        if (emaHit == 1) {
            sql += " AND ema_hit != '' AND ema_hit != '-' ";
        }

        sql += " ORDER BY open_time DESC"; // limit for performance

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
