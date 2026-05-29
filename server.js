require('dotenv').config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const console = require("console");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

/* MIDDLEWARE */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* DATABASE CONNECTION (Aiven Cloud နှင့် လိုက်ဖော်ရွေအောင် ပြင်ဆင်ပြီး) */
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "bingo",
    port: process.env.DB_PORT || 3306,
    // 💡 Aiven MySQL အတွက် SSL Connection မဖြစ်မနေ လိုအပ်သောကြောင့် ထည့်သွင်းရခြင်း ဖြစ်ပါတယ်
    ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : null
});

/* CONNECT DATABASE */
db.connect((err) => {
    if (err) {
        console.log("Database Connection Failed");
        console.log(err);
    } else {
        console.log("MySQL Connected");
    }
});

/* 🎰 BINGO GAME STATE (SERVER-SIDE MEMORY) */
let playerSockets = new Set();
let gameHistory = [];
//let currentSessionLabel = "1";
let bingoInterval = null;
const TOTAL_NUMBERS = 99;

let currentSessionName = "GAME SESSION";
let currentSessionLabel = "GAME SESSION"; // အောက်က function အတွက် ကြေညာပေးထားခြင်းဖြစ်ပါသည်

// 🎲 ဆာဗာဘက်ကနေ Random နံပါတ်ထုတ်ပေးမယ့် စနစ်
function serverGenerateBingoNumber() {
    if (gameHistory.length >= TOTAL_NUMBERS) {
        if (bingoInterval) clearInterval(bingoInterval);
        io.emit("gameFinished", { message: "All numbers called!" });
        console.log("🎰 Game Over: All 53 Bingo numbers have been generated.");
        return;
    }

    let randomNumber;
    do {
        randomNumber = Math.floor(Math.random() * TOTAL_NUMBERS) + 1;
    } while (gameHistory.includes(randomNumber));

    gameHistory.push(randomNumber);

    console.log(`🎲 [SERVER SIDE] Random Number Generated: >> ${randomNumber} << (Total: ${gameHistory.length}/99)`);

    io.emit("gameUpdate", {
        history: gameHistory,
        currentNumber: randomNumber,
        sessionLabel: currentSessionLabel
    });
}

/* 🌐 REAL-TIME SOCKET.IO EVENT HANDLERS */
io.on("connection", (socket) => {
    console.log(`👤 [SERVER SIDE] New Connection: ${socket.id}`);

    // 💡 Player အသစ်တစ်ယောက် Connection စတက်လာတာနဲ့ လက်ရှိနောက်ဆုံးဖြစ်နေတဲ့ Session Name ကို ချက်ချင်း ပို့ပေးလိုက်ခြင်း
    socket.emit("sessionNameBroadcast", { sessionName: currentSessionName });

    socket.on("registerAsPlayer", () => {
        playerSockets.add(socket.id);
        console.log(`👤 [SERVER SIDE] A player joined. Current Live Count: ${playerSockets.size}`);
        io.emit("updatePlayerCount", playerSockets.size);
    });

    // ======================================================================
    // 💡 NEW: HOST မှ SESSION အသစ် ဖန်တီးသည့် အခါ လုပ်ဆောင်မည့် အပိုင်း
    // ======================================================================
    socket.on("createNewSession", (data) => {
        if (data && data.sessionName) {
            // ဆာဗာရဲ့ Memory ထဲမှာ Session နာမည်အသစ်ကို သိမ်းလိုက်ခြင်း
            currentSessionName = data.sessionName;

            console.log(`🔄 [SERVER SIDE] Session Updated to: ${currentSessionName}`);

            // ချိတ်ဆက်ထားသော Players အားလုံး (home.html) ထံသို့ တစ်ပြိုင်နက် Live ထုတ်လွှင့် (Broadcast) ပေးခြင်း
            io.emit("sessionNameBroadcast", { sessionName: currentSessionName });
        }
    });

    socket.emit("gameUpdate", {
        history: gameHistory,
        currentNumber: gameHistory[gameHistory.length - 1] || "--",
        sessionLabel: currentSessionName
    });

    io.emit("updatePlayerCount", playerSockets.size);
    socket.on("startGameLoop", (data) => { 
        if (bingoInterval) clearInterval(bingoInterval);
        // 💡 Host ဆီက ပါလာတဲ့ sessionLabel ကို ဆာဗာမှာ သိမ်းလိုက်ခြင်း
        if (data && data.sessionLabel) {
            currentSessionLabel = data.sessionLabel;
        }

        console.log(`🏁[SERVER SIDE] Host activated 'Go!' for Session: ${currentSessionLabel}`);

        serverGenerateBingoNumber();

        // ထိုနောက် ၁၀ စက္ကန့်ပြည့်တိုင်း နောက်ထပ် Random နံပါတ်များကို အလိုအလျောက် ဆက်ထုတ်ပေးမည်
        bingoInterval = setInterval(() => {
            serverGenerateBingoNumber();
        }, 10000); // 10000 ms = 10 Seconds
    });
    let winnerCount = 0;
    socket.on("playerBingo", (data) => {
        const { winnerName, userid, luckyNumber } = data;
        winnerCount++;

        // ၂။ တစ်ယောက်ယောက် Bingo လို့ နှိပ်လိုက်ပေမယ့် ဂိမ်းကို ခေတ္တပဲ (Pause) ရပ်ထားမယ်
        if (bingoInterval) {
            clearInterval(bingoInterval);
            bingoInterval = null;
            console.log("⏸️ [SERVER SIDE] Bingo claimed! Interval paused.");
        }

        console.log(`🏆 [SERVER SIDE] BINGO CLAIMS! Winner: ${winnerName} (ID: ${userid})`);

        io.emit("announceWinner", {
            userid: userid,
            winnerId: socket.id,
            winnerName: winnerName,
            luckyNumber: luckyNumber || "N/A"
        });
        if (winnerCount >= 2) {
            console.log("🚨🚨🚨 [SERVER SIDE] နိုင်သူ ၂၀ ပြည့်သွားသဖြင့် တစ်ပွဲလုံးကို အပြီးသတ် သိမ်းလိုက်ပါပြီ။");

            // (က) အယောက် ၂၀ ပြည့်မှ နံပါတ်ဖောက်တဲ့ Interval ကို အပြီးတိုင် ရပ်ပစ်မယ်
            if (bingoInterval) {
                clearInterval(bingoInterval);
                bingoInterval = null;
                console.log("⏸️ [SERVER SIDE] Interval permanently stopped for this session.");
            }

            // (ခ) Player အားလုံးဆီကို "တစ်ပွဲလုံး ပြီးဆုံးသွားပြီ" ဖြစ်ကြောင်း Signal လှမ်းပို့မယ်
            io.emit("bingoSessionOver");

            // (ဂ) နောက်ပွဲစဉ်အသစ် (Session အသစ်) အတွက် Counter ကို ၀ ပြန်လုပ်ပေးခဲ့မယ်
            winnerCount = 0;
        }
    });

    socket.on("resumeGameFromHost", () => {
        if (winnerCount >= 20) { 
            console.log(`⛔ [SERVER SIDE] Game Over! Winner count reached ${winnerCount}. Host cannot resume.`);
            socket.emit("statusMessage", "🚨 နိုင်သူ ၂၀ ပြည့်သွားပြီဖြစ်၍ ဂိမ်းကို ရှက်ဆက်၍မရတော့ပါ။");
            return; 
        }
        if (bingoInterval) clearInterval(bingoInterval);
        console.log("▶️ [SERVER SIDE] Host clicked OK. Resuming 10-second automatic interval...");
        io.emit("gameResume");
        serverGenerateBingoNumber();
        bingoInterval = setInterval(() => {
            serverGenerateBingoNumber();
        }, 10000);
    });

    socket.on("resetGame", () => {
        if (bingoInterval) clearInterval(bingoInterval);
        winnerCount = 0;
        gameHistory = [];
        console.log("🔄 [SERVER SIDE] Game has been fully reset by Host.");
        io.emit("gameUpdate", { history: gameHistory, currentNumber: "--" });
        io.emit("gameResetByHost");
    });

    socket.on("disconnect", () => {
        if (playerSockets.has(socket.id)) {
            playerSockets.delete(socket.id);
        }
        console.log(`❌ [SERVER SIDE] A connection left. Active Tracking Count: ${playerSockets.size}`);
        io.emit("updatePlayerCount", playerSockets.size);
    });
});

/* --- DATABASE REST APIs --- */

// 🔴 REGISTER ENDPOINT
app.post("/register", (req, res) => {
    const { username, userph, useremail, userage, useroccup } = req.body;

    const checkSql = "SELECT * FROM usertbl WHERE userph = ?";
    db.query(checkSql, [userph], (checkErr, checkResult) => {
        if (checkErr) return res.status(500).send({ success: false, message: "Database Error during validation" });
        if (checkResult.length > 0) return res.send({ success: false, message: "Phone number already exists" });

        const insertSql = `INSERT INTO usertbl (username, userph, useremail, userage, useroccup) VALUES (?, ?, ?, ?, ?)`;
        db.query(insertSql, [username, userph, useremail, userage, useroccup], (err, result) => {
            if (err) {
                res.status(500).send({ success: false, message: "Database Error during insertion" });
            } else {
                res.status(200).send({ success: true, redirect: "login.html" });
            }
        });
    });
});

// 🔴 LOGIN ENDPOINT
app.post('/api/login', (req, res) => {
    const { phone, sessionName } = req.body; 
    if (!phone) return res.status(400).json({ success: false, message: "ဖုန်းနံပါတ် ထည့်သွင်းပါ" });

    const sql = "SELECT userid, username, userph, useremail, userage, useroccup, session_name FROM usertbl WHERE userph = ?";
    db.query(sql, [phone], (err
