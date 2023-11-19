"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const cors_1 = __importDefault(require("cors"));
// Initialize express and sqlite3
const app = (0, express_1.default)();
const db = new sqlite3_1.default.Database('conversations.db');
app.use((0, cors_1.default)({
    origin: 'https://chat.openai.com'
}));
// Middleware to parse JSON bodies
app.use(body_parser_1.default.json());
// Create the table
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS conversations (
    user_id TEXT,
    subuser_name TEXT,
    conversation_id TEXT,
    PRIMARY KEY (user_id, conversation_id)
  )`);
});
// Endpoint to assign a conversation
app.post('/assign-conversation', (req, res) => {
    const { user_id, subuser_name, conversation_id } = req.body;
    if (!user_id || !subuser_name || !conversation_id) {
        return res.status(400).send('Missing parameters');
    }
    const sql = `REPLACE INTO conversations (user_id, subuser_name, conversation_id) VALUES (?, ?, ?)`;
    db.run(sql, [user_id, subuser_name, conversation_id], (err) => {
        if (err) {
            return res.status(500).send(err.message);
        }
        else {
            res.sendStatus(200);
        }
    });
});
app.post('/delete-subuser', (req, res) => {
    const { user_id, subuser_name } = req.body;
    if (!user_id || !subuser_name) {
        return res.status(400).send('Missing parameters');
    }
    const sql = `DELETE FROM conversations WHERE user_id = ? AND subuser_name = ?`;
    db.run(sql, [user_id, subuser_name], (err) => {
        if (err) {
            return res.status(500).send(err.message);
        }
        else {
            res.sendStatus(200);
        }
    });
});
app.get('/get-mappings', (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
        return res.status(400).send('User ID is required');
    }
    const sql = `SELECT conversation_id, subuser_name FROM conversations WHERE user_id = ?`;
    db.all(sql, [user_id], (err, rows) => {
        if (err) {
            return res.status(500).send(err.message);
        }
        res.json(rows);
    });
});
app.get('/get-subusers', (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
        return res.status(400).send('User ID is required');
    }
    const sql = `SELECT DISTINCT subuser_name FROM conversations WHERE user_id = ?`;
    db.all(sql, [user_id], (err, rows) => {
        if (err) {
            return res.status(500).send(err.message);
        }
        res.json(rows.map(row => row.subuser_name));
    });
});
// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
