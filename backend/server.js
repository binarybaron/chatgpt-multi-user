"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var body_parser_1 = require("body-parser");
var cors_1 = require("cors");
var pg_1 = require("pg");
// Initialize express and sqlite3
var app = (0, express_1.default)();
var db = new pg_1.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
db.connect();
app.use((0, cors_1.default)({
    origin: 'https://chat.openai.com'
}));
// Middleware to parse JSON bodies
app.use(body_parser_1.default.json());
var createTableQuery = "\n    CREATE TABLE IF NOT EXISTS conversations (\n        user_id TEXT,\n        subuser_name TEXT,\n        conversation_id TEXT,\n        PRIMARY KEY (user_id, conversation_id)\n    );\n";
db.query(createTableQuery, function (err, res) {
    if (err) {
        console.error(err);
        return;
    }
    console.log("Table is successfully created");
});
// Endpoint to assign a conversation
app.post('/assign-conversation', function (req, res) {
    var _a = req.body, user_id = _a.user_id, subuser_name = _a.subuser_name, conversation_id = _a.conversation_id;
    if (!user_id || !subuser_name || !conversation_id) {
        return res.status(400).send('Missing parameters');
    }
    var sql = "REPLACE INTO conversations (user_id, subuser_name, conversation_id) VALUES (?, ?, ?)";
    db.query(sql, [user_id, subuser_name, conversation_id], function (err) {
        if (err) {
            return res.status(500).send(err.message);
        }
        else {
            res.sendStatus(200);
        }
    });
});
app.post('/delete-subuser', function (req, res) {
    var _a = req.body, user_id = _a.user_id, subuser_name = _a.subuser_name;
    if (!user_id || !subuser_name) {
        return res.status(400).send('Missing parameters');
    }
    var sql = "DELETE FROM conversations WHERE user_id = ? AND subuser_name = ?";
    db.query(sql, [user_id, subuser_name], function (err) {
        if (err) {
            return res.status(500).send(err.message);
        }
        else {
            res.sendStatus(200);
        }
    });
});
app.get('/get-mappings', function (req, res) {
    var user_id = req.query.user_id;
    if (!user_id) {
        return res.status(400).send('User ID is required');
    }
    var sql = "SELECT conversation_id, subuser_name FROM conversations WHERE user_id = ?";
    db.query(sql, [user_id], function (err, rows) {
        if (err) {
            return res.status(500).send(err.message);
        }
        res.json(rows);
    });
});
app.get('/get-subusers', function (req, res) {
    var user_id = req.query.user_id;
    if (!user_id) {
        return res.status(400).send('User ID is required');
    }
    var sql = "SELECT DISTINCT subuser_name FROM conversations WHERE user_id = ?";
    db.query(sql, [user_id], function (err, rows) {
        if (err) {
            return res.status(500).send(err.message);
        }
        res.json(rows.map(function (row) { return row.subuser_name; }));
    });
});
// Start the server
var PORT = 3000;
app.listen(PORT, function () {
    console.log("Server running on http://localhost:".concat(PORT));
});
