const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const app = express();
const PORT = 3000;

// ======== Configuration ========
const DB_PATH = path.join(__dirname, "bot_database.db"); 
const PUBLIC_FOLDER = path.join(__dirname, "public"); 

// ======== Middleware ========
app.use(cors()); // allow frontend to access backend
app.use(express.static(PUBLIC_FOLDER)); // serve static HTML/JS/CSS

function queryCandles({ symbol, type, tf, minspike, minvolume, minchange, minrange, typedate, exactTimeF, exactTimeT, emaHit }) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);

        let sql = `SELECT open_time, symbol, candle_type, volume, avg_volume, volume_spike, ema_hit, timeframe, change, range
                   FROM candles WHERE 1=1`;
        const params = [];
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
        if (emaHit == 1) {
            sql += " AND ema_hit != '' AND ema_hit != '-' ";
        }

        if (typedate == "exact" && exactTimeF) {
            sql += " AND open_time = ? ORDER BY open_time DESC";
            params.push(exactTimeF);
        } else if (exactTimeF && exactTimeT) {
            sql += " AND open_time >= ? AND open_time <= ? ORDER BY open_time DESC";
            params.push(exactTimeF, exactTimeT);
        } else {
            sql += " AND open_time >= datetime(date('now') || ' 08:00:00') ORDER BY open_time DESC";
        }

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

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
});

