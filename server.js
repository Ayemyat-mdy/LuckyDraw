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

/* DATABASE CONNECTION */
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "bingo"
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
/*io.on("connection", (socket) => {
    console.log(`👤 [SERVER SIDE] New Connection: ${socket.id}`);

    socket.on("registerAsPlayer", () => {
        playerSockets.add(socket.id);
        console.log(`👤 [SERVER SIDE] A player joined. Current Live Count: ${playerSockets.size}`);
        io.emit("updatePlayerCount", playerSockets.size);
    });*/
// 💡 ဆာဗာရဲ့ အပေါ်ဆုံးနား (io.on ရဲ့အပြင်ဘက်) တွင် လက်ရှိ Session နာမည်ကို မှတ်ထားရန် Variable တစ်ခု ဆောက်ထားပါ
//let currentSessionName = "GAME SESSION"; // Default Name

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

    // အောက်တွင် မိတ်ဆွေ၏ အခြားသော socket.on ('startGameLoop', 'resetGame') စသည့် ကုဒ်များ ဆက်လက်ရှိနေပါမည်...


    socket.emit("gameUpdate", {
        history: gameHistory,
        currentNumber: gameHistory[gameHistory.length - 1] || "--",
        //sessionLabel: currentSessionLabel
        sessionLabel: currentSessionName
    });

    io.emit("updatePlayerCount", playerSockets.size);
    socket.on("startGameLoop", (data) => { // 👈 data parameter ထည့်ပါ
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
        // အခြား Player တွေရဲ့ Screen ပေါ်က Board တွေ၊ လက်ရှိ ကစားနေတဲ့ အခြေအနေတွေ လုံးဝ ပျက်မသွားပါဘူး။
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
        // 🎯 [အရေးကြီးဆုံး ပြင်ဆင်ချက်] 
        // နိုင်သူအရေအတွက် ၂၀ ပြည့်သွားပြီဆိုရင် (စမ်းသပ်စဉ်မှာ ၂ ယောက်) 
        // ဒိုင်က ဘယ်လောက်ပဲ OK နှိပ်နှိပ် ဂိမ်းကို ရှေ့ဆက်မောင်းခွင့်မပေးဘဲ တားဆီးလိုက်ခြင်း ဖြစ်ပါတယ်။
        if (winnerCount >= 20) { // 💡 အစ်ကို လက်တွေ့စမ်းသပ်နေစဉ်မှာ ၂၀ နေရာမှာ ၂ လို့ ပြောင်းစမ်းနိုင်ပါတယ်
            console.log(`⛔ [SERVER SIDE] Game Over! Winner count reached ${winnerCount}. Host cannot resume.`);

            // Host ဘက်ကို ပွဲပြီးသွားပြီဖြစ်ကြောင်း သတိပေးချက် Socket စနစ်နဲ့ လှမ်းပို့ချင်ရင် ပို့နိုင်ပါတယ် (Optional)
            socket.emit("statusMessage", "🚨 နိုင်သူ ၂၀ ပြည့်သွားပြီဖြစ်၍ ဂိမ်းကို ရှေ့ဆက်၍မရတော့ပါ။");
            return; // 🛑 အောက်က ကုဒ်တွေကို လုံးဝ ဆက်မလုပ်စေဘဲ ဒီတင်တင် ရပ်ပစ်ပါတယ်
        }
        if (bingoInterval) clearInterval(bingoInterval);
        console.log("▶️ [SERVER SIDE] Host clicked OK. Resuming 10-second automatic interval...");
        // ၁။ ကစားသမားအားလုံးဆီ ဂိမ်းပြန်စပြီဖြစ်ကြောင်း ပို့ခြင်း
        io.emit("gameResume");
        // ၂။ နံပါတ်အသစ် တစ်လုံး ချက်ချင်းထွက်ပြီး ၁၀ စက္ကန့် loop ပြန်ပတ်ခြင်း
        serverGenerateBingoNumber();
        bingoInterval = setInterval(() => {
            serverGenerateBingoNumber();
        }, 10000);
    });

    socket.on("resetGame", () => {
        if (bingoInterval) clearInterval(bingoInterval);
        // ပွဲအသစ်ပြန်စမှာဖြစ်လို့ ဆာဗာပေါ်က Winner အရေအတွက် Counter ကို ၀ ပြန်လုပ်ပေးရပါမယ်။
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
/*app.post('/api/login', (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "ဖုန်းနံပါတ် ထည့်သွင်းပါ" });

    const sql = "SELECT userid, username, userph, useremail, userage, useroccup FROM usertbl WHERE userph = ?";
    db.query(sql, [phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: "Database error" });
        if (results.length > 0) {
            res.json({
                success: true,
                message: "Login successful",
                user: {
                    id: results[0].userid,          // script.js / home.js အတွက်
                    userid: results[0].userid,      // profile.js အတွက်
                    name: results[0].username,      // home UI 'Login' နေရာမှာ နာမည်ပြောင်းလဲရန်
                    username: results[0].username,
                    userph: results[0].userph,
                    useremail: results[0].useremail,
                    userage: results[0].userage,
                    useroccup: results[0].useroccup
                }
            });
        } else {
            res.json({ success: false, message: "ဖုန်းနံပါတ် မှားယွင်းနေပါသည် သို့မဟုတ် အကောင့်မရှိပါ။" });
        }
    });
});
app.post('/api/login', (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "ဖုန်းနံပါတ် ထည့်သွင်းပါ" });

    const sql = "SELECT userid, username, userph, useremail, userage, useroccup FROM usertbl WHERE userph = ?";
    db.query(sql, [phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: "Database error" });

        if (results.length > 0) {

            // 💡 နေရာအမှန် - အသုံးပြုသူကို usertbl ထဲမှာ တွေ့ပြီဆိုမှ ranktbl ထဲက စုစုပေါင်းအရေအတွက်ကို ထပ်မံစစ်ဆေးခြင်း
            const countSql = "SELECT COUNT(*) AS totalRanks FROM ranktbl";
            db.query(countSql, (countErr, countResults) => {
                if (countErr) return res.status(500).json({ success: false, error: "Database error while counting ranks" });

                // Database ရဲ့ row count ကို variable ထဲ ပြောင်းသိမ်းခြင်း
                const rankCount = countResults[0].totalRanks;

                // 🚀 မူရင်း Response ထဲသို့ rankCount ကိုပါ တွဲဖက်၍ Frontend ဆီ ပို့ဆောင်လိုက်ခြင်း
                res.json({
                    success: true,
                    rankCount: rankCount,           // 🌟 ဒါက Frontend က အောင်မြင်စွာ လှမ်းသယ်မယ့် ကောင်လေးပါ
                    message: "Login successful",
                    user: {
                        id: results[0].userid,          // script.js / home.js အတွက်
                        userid: results[0].userid,      // profile.js အတွက်
                        name: results[0].username,      // home UI 'Login' နေရာမှာ နာမည်ပြောင်းလဲရန်
                        username: results[0].username,
                        userph: results[0].userph,
                        useremail: results[0].useremail,
                        userage: results[0].userage,
                        useroccup: results[0].useroccup
                    }
                });
            });

        } else {
            res.json({ success: false, message: "ဖုန်းနံပါတ် မှားယွင်းနေပါသည် သို့မဟုတ် အကောင့်မရှိပါ။" });
        }
    });
});
*/
app.post('/api/login', (req, res) => {
    // 🎯 Frontend က ပို့ပေးမယ့် phone ရော sessionName ကိုပါ လက်ခံမယ်
    const { phone, sessionName } = req.body; 
    if (!phone) return res.status(400).json({ success: false, message: "ဖုန်းနံပါတ် ထည့်သွင်းပါ" });

    // 🎯 SQL မှာ session_name column ကိုပါ တွဲယူလိုက်တယ် သားကြီး
    const sql = "SELECT userid, username, userph, useremail, userage, useroccup, session_name FROM usertbl WHERE userph = ?";
    db.query(sql, [phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: "Database error" });

        if (results.length > 0) {
            const user = results[0];
            const activeSession = sessionName ? sessionName.toUpperCase().trim() : "";

            // =========================================================================
            // 🎯 [မင်းလိုချင်တဲ့ အဓိက လော့ဂျစ်]
            // အကယ်၍ လက်ရှိပွဲစဉ်က SESSION 6 သို့မဟုတ် GRAND FINAL ဖြစ်ခဲ့ရင်
            // =========================================================================
            if (activeSession === "SESSION 6" || activeSession === "GRAND FINAL") {
                // Database ထဲက user ရဲ့ session_name က NULL ဖြစ်နေရင် သို့မဟုတ် ဗလာဖြစ်နေရင် တားဆီးမယ်
                if (user.session_name === null || user.session_name.trim() === "") {
                    return res.json({ 
                        success: false, 
                        message: `🚨 ယခုပွဲစဉ် (${sessionName}) တွင် ပါဝင်ခွင့်မရှိသေးပါ။ အကောင့်ထဲတွင် Session အမည် သတ်မှတ်ထားခြင်း မရှိပါ။` 
                    });
                }
            }
            // =========================================================================

            // 💡 နေရာအမှန် - အထက်က အခြေအနေတွေ အကုန်အောင်မြင်မှ ranktbl ထဲက စုစုပေါင်းအရေအတွက်ကို ဆက်စစ်မယ်
            const countSql = "SELECT COUNT(*) AS totalRanks FROM ranktbl";
            db.query(countSql, (countErr, countResults) => {
                if (countErr) return res.status(500).json({ success: false, error: "Database error while counting ranks" });

                // Database ရဲ့ row count ကို variable ထဲ ပြောင်းသိမ်းခြင်း
                const rankCount = countResults[0].totalRanks;

                // 🚀 မူရင်း Response တိုင်း ပြန်ပို့ပေးခြင်း (ဘာမှမပြောင်းလဲပါ)
                res.json({
                    success: true,
                    rankCount: rankCount,           // 🌟 ဒါက Frontend က အောင်မြင်စွာ လှမ်းသယ်မယ့် ကောင်လေးပါ
                    message: "Login successful",
                    user: {
                        id: user.userid,            // script.js / home.js အတွက်
                        userid: user.userid,        // profile.js အတွက်
                        name: user.username,        // home UI 'Login' နေရာမှာ နာမည်ပြောင်းလဲရန်
                        username: user.username,
                        userph: user.userph,
                        useremail: user.useremail,
                        userage: user.userage,
                        useroccup: user.useroccup
                    }
                });
            });

        } else {
            res.json({ success: false, message: "ဖုန်းနံပါတ် မှားယွင်းနေပါသည် သို့မဟုတ် အကောင့်မရှိပါ။" });
        }
    });
});

app.post("/api/verify-stampcode", (req, res) => {
    const { stampCode, userph } = req.body;
    if (!stampCode || !userph) return res.status(400).send({ success: false, message: "Missing required inputs" });

    // 🌟 ပြင်ဆင်လိုက်သည့်နေရာ: stampcode = ? အရှေ့မှာ BINARY ထည့်လိုက်ပါတယ်
    const findStampSql = "SELECT * FROM stamptable WHERE BINARY stampcode = ? LIMIT 1";

    db.query(findStampSql, [stampCode], (stampErr, stampResult) => {
        if (stampErr || stampResult.length === 0) {
            return res.status(404).send({ success: false, message: "Invalid or used Code." });
        }

        const newStampName = stampResult[0].stampname;
        const findUserSql = "SELECT stamprecord FROM usertbl WHERE userph = ? LIMIT 1";
        db.query(findUserSql, [userph], (userErr, userResult) => {
            if (userErr || userResult.length === 0) return res.status(444).send({ success: false, message: "Account not found." });

            let currentRecord = userResult[0].stamprecord;
            let existingStamps = currentRecord ? currentRecord.split(',').map(item => item.trim()) : [];

            if (existingStamps.includes(newStampName)) {
                return res.status(400).send({ success: false, message: `You already claimed this stamp type (${newStampName}).` });
            }

            let updatedRecordString = !currentRecord ? newStampName : `${currentRecord},${newStampName}`;
            const updateUserSql = "UPDATE usertbl SET stamprecord = ? WHERE userph = ?";
            db.query(updateUserSql, [updatedRecordString, userph], (updateErr) => {
                if (updateErr) return res.status(500).send({ success: false, message: "Update failed." });

                // 🌟 ဒီနေရာမှာလည်း ပိုပြီးသေချာအောင် BINARY ထည့်ပေးနိုင်ပါတယ်
                const deleteStampSql = "DELETE FROM stamptable WHERE BINARY stampcode = ?";
                db.query(deleteStampSql, [stampCode], () => {
                    return res.status(200).send({ success: true, message: "Stamp verified and processed!" });
                });
            });
        });
    });
});
// 🎰 SPIN/WHEEL API (VARCHAR စနစ်အတွက် ပြင်ဆင်ပြီး)
/*app.post('/api/spin', (req, res) => {
    const { userid, sessionid,randomTicket, rankid } = req.body;
    if (!userid || !sessionid) return res.status(400).json({ status: 'error', message: 'User ID နှင့် Session ID လိုအပ်ပါသည်!' });

    // 💡 ရှင်းလင်းချက်: sessionid ကို String (စာသား) အဖြစ်ပြောင်းလဲပြီး session_name ထဲသို့ တိုက်ရိုက်ထည့်သွင်းပါသည်
            const finalSessionStr = String(sessionid);
            //const finalTicket = String(randomTicket);
            // 💡 [FIXED] randomTicket မပါလာပါက "0" သို့မဟုတ် တန်ဖိုးတစ်ခုခု အစားထိုးရန် သတ်မှတ်ခြင်း
            const finalTicket = randomTicket !== undefined ? String(randomTicket) : "0";

    const getAvailablePrizesQuery = "SELECT * FROM prizetbl WHERE prizecount > 0";
    db.query(getAvailablePrizesQuery, (err, prizes) => {
        if (err) return res.status(500).json({ error: err.message });
        if (prizes.length === 0) return res.json({ status: 'empty', message: 'ဆုမဲများအားလုံး ကုန်သွားပါပြီ!' });

        const randomIndex = Math.floor(Math.random() * prizes.length);
        const wonPrize = prizes[randomIndex];

        const updateCountQuery = "UPDATE prizetbl SET prizecount = prizecount - 1 WHERE prizeid = ?";
        db.query(updateCountQuery, [wonPrize.prizeid], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });

            console.log(`User ID in server:${userid}`);
            console.log(`Session ID in server:${finalSessionStr}`);
            console.log(`Prize ID in server:${wonPrize}`);
            console.log(`Random Ticket in server:${finalTicket}`); 

            //💡 ရှင်းလင်းချက်- sessionid တွေ ကွဲလွဲနေတဲ့ပြဿနာကို ကျော်လွှားရန်အတွက် 
            // rankid ပါလာပါက rankid ကို တိုက်ရိုက်အသုံးပြုပြီး Update လုပ်ပါမည်။
            // အကယ်၍ rankid မပါလာပါက ယခင်ရှိပြီးသား WHERE ချက်များဖြင့် ရှာဖွေပါမည်။
            let updateRankingQuery = "";
            let queryParams = [];

            if (rankid) {
                // rankid ရှိပါက ပိုမိုမြန်ဆန်ပြီး ရာနှုန်းပြည့် တိကျသော Primary Key ကို သုံး၍ အပ်နှံခြင်း
             updateRankingQuery = `
                UPDATE ranktbl 
                SET prizeid = ? 
                WHERE userid = ? AND session_name = ? AND (prizeid is NULL OR prizeid=0) AND randomTicket=?
                LIMIT 1`;
                queryParams = [wonPrize.prizeid, rankid, userid];
            } else {
                // rankid မပါလာပါက ယခင်မူလအတိုင်း session_name နှင့် တွဲဖက်စစ်ဆေးခြင်း
                updateRankingQuery = `
                    UPDATE ranktbl 
                    SET prizeid = ? 
                    WHERE userid = ? AND session_name = ? AND (prizeid IS NULL OR prizeid = 0) AND randomTicket = ?
                    LIMIT 1`;
                queryParams = [wonPrize.prizeid, userid, finalSessionStr, finalTicket];
            }

            db.query(updateRankingQuery, queryParams, (insertErr) => {
                if (insertErr) return res.status(500).json({ error: insertErr.message });
                
                // အောင်မြင်စွာ ဆုမဲအပ်နှံပြီးကြောင်း အကြောင်းပြန်ခြင်း
                res.json({ 
                    status: 'success', 
                    prizeid: wonPrize.prizeid, 
                    prizename: wonPrize.prizename 
                });
            });
        });
    });
            /*db.query(updateRankingQuery, [wonPrize.prizeid, userid, finalSessionStr, finalTicket],  (insertErr) => {
                if (insertErr) return res.status(500).json({ error: insertErr.message });
                res.json({ status: 'success', prizeid: wonPrize.prizeid, prizename: wonPrize.prizename });
            });
        });
    });
});*/

app.post('/api/spin', (req, res) => {
    // Frontend မှ ပို့ပေးလိုက်သော အချက်အလက်များကို လက်ခံခြင်း
    const { userid, sessionid, randomTicket, rankid } = req.body;

    // Log ထုတ်ပြီး အချက်အလက်များကို အမှန်ကန်ဆုံး စစ်ဆေးခြင်း
    console.log("--- SPIN REQUEST LOG ---");
    console.log("User ID in server:", userid);
    console.log("Session ID in server:", sessionid);
    console.log("Random Ticket in server:", randomTicket);
    console.log("Rank ID in server:", rankid);

    if (!userid) {
        return res.status(400).json({ status: 'error', message: 'User ID လိုအပ်ပါသည်!' });
    }

    const finalSessionStr = String(sessionid);
    const finalTicket = randomTicket !== undefined ? String(randomTicket) : "0";

    // ၁။ ပေးရန်ကျန်ရှိသော ဆုမဲများကို ရှာဖွေခြင်း
    const getAvailablePrizesQuery = "SELECT * FROM prizetbl WHERE prizecount > 0";
    db.query(getAvailablePrizesQuery, (err, prizes) => {
        if (err) return res.status(500).json({ error: err.message });
        if (prizes.length === 0) return res.json({ status: 'empty', message: 'ဆုမဲများအားလုံး ကုန်သွားပါပြီ!' });

        // Random စနစ်ဖြင့် ဆုမဲတစ်ခု ရွေးချယ်ခြင်း
        const randomIndex = Math.floor(Math.random() * prizes.length);
        const wonPrize = prizes[randomIndex];

        // 💡 [FIXED]: prizeid ကို Object ထဲမှ သီးသန့်ဆွဲထုတ်ပြီး မှန်ကန်စွာ သိမ်းဆည်းခြင်း
        const actualPrizeId = wonPrize.prizeid;

        console.log(`🎁 Selected Prize: ${wonPrize.prizename} (ID: ${actualPrizeId})`);

        // ၂။ ဆုမဲအရေအတွက်ကို ၁ ခု လျှော့ချခြင်း
        const updateCountQuery = "UPDATE prizetbl SET prizecount = prizecount - 1 WHERE prizeid = ?";
        db.query(updateCountQuery, [actualPrizeId], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });

            // ၃။ ကစားသမား၏ Rank မှတ်တမ်းထဲသို့ ဆုမဲ ID သွားရောက်အပ်နှံခြင်း
            let updateRankingQuery = "";
            let queryParams = [];

            // 🚀 rankid ပါလာခဲ့လျှင် (အကောင်းဆုံးနှင့် အသေချာဆုံး စနစ်)
            if (rankid && rankid !== "undefined" && rankid !== null) {
                updateRankingQuery = `
                    UPDATE ranktbl 
                    SET prizeid = ? 
                    WHERE rankid = ? AND userid = ? AND (prizeid IS NULL OR prizeid = 0)
                    LIMIT 1`;
                queryParams = [actualPrizeId, rankid, userid];
            } else {
                // 🚀 rankid မပါလာခဲ့လျှင် (Session Name သို့မဟုတ် Ticket ကို ညှိနှိုင်း၍ ရှာဖွေခြင်း)
                // 💡 [ညှိနှိုင်းချက်]: session_name ကြောင့် လွဲချော်မှု မရှိစေရန် အဓိက userid နှင့် randomTicket ကို ကြည့်၍ အပ်ပါမည်။
                updateRankingQuery = `
                    UPDATE ranktbl 
                    SET prizeid = ? 
                    WHERE userid = ? AND (prizeid IS NULL OR prizeid = 0) AND (randomTicket = ? OR session_name = ?)
                    LIMIT 1`;
                queryParams = [actualPrizeId, userid, finalTicket, finalSessionStr];
            }

            // Database သို့ Query ပို့လွှတ်ခြင်း
            db.query(updateRankingQuery, queryParams, (insertErr, result) => {
                if (insertErr) return res.status(500).json({ error: insertErr.message });

                // စာရင်းထဲ အမှန်တကယ် Update ဖြစ်သွားခြင်း ရှိ/မရှိ စစ်ဆေးခြင်း
                if (result.affectedRows === 0) {
                    console.log("⚠️ Warning: ဆုမဲထွက်သော်လည်း ranktbl ထဲတွင် ကိုက်ညီသော Row မရှိ၍ စာရင်းမဝင်ပါ။");
                } else {
                    console.log("📝 Database updated successfully. Prize assigned to player!");
                }

                // အောင်မြင်ကြောင်း Frontend သို့ ပြန်လည်အကြောင်းကြားခြင်း
                res.json({
                    status: 'success',
                    prizeid: actualPrizeId,
                    prizename: wonPrize.prizename
                });
            });
        });
    });
});

// 🛠️ [အဓိကပြင်ဆင်ပြီးသား PROFILE API]
// Frontend ဘက်က data.success စစ်ဆေးမှုနှင့် ဒေတာဆွဲထုတ်မှုပုံစံ အံကိုက်ဖြစ်စေရန် JSON တုံ့ပြန်မှုကို စနစ်တကျ ပြုပြင်ထားပါသည်။
app.get('/api/profile/:id', (req, res) => {
    const userId = req.params.id;
    const query = 'SELECT userid, username, userph, useremail, userage, useroccup FROM usertbl WHERE userid = ?';
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error("❌ Profile DB Query Error:", err);
            return res.status(500).json({ success: false, error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Row ဒေတာများကို ဖတ်ယူပြီး success flag ဖြင့် စနစ်တကျ ထည့်သွင်းပေးလိုက်သည်
        const user = results[0];
        res.json({
            success: true,
            userid: user.userid,
            username: user.username,
            userph: user.userph,
            useremail: user.useremail,
            userage: user.userage,
            useroccup: user.useroccup
        });
    });
});

// ================= BINGO WINNER RANK INSERT API (ပြင်ဆင်ပြီး) =================
// ================= BINGO WINNER SAVE API (VARCHAR စနစ်အတွက် ပြင်ဆင်ပြီး) =================
app.post('/api/save-winner', async (req, res) => {
    const { userid, sessionid, randomTicket } = req.body;

    if (!userid) {
        return res.status(400).json({ success: false, message: "User ID is required." });
    }

    // 💡 ရှင်းလင်းချက်: play.html မှ ပို့လာသော sessionid သို့မဟုတ် server memory မှ label ကို စာသား (String) ပြောင်းလဲအသုံးပြုပါသည်
    const finalSessionStr = String(sessionid || currentSessionLabel || "");
    const finalTicket = randomTicket !== undefined ? String(randomTicket) : "0";
    const insertQuery = "INSERT INTO ranktbl (userid, prizeid, session_name,randomTicket) VALUES (?, NULL,?, ?)";

    try {
        db.query(insertQuery, [userid, finalSessionStr, randomTicket], (err, result) => {
            if (err) {
                console.error("Database Error:", err);
                return res.status(500).json({ success: false, message: "Database insertion failed." });
            }

            return res.status(200).json({
                success: true,
                message: "Winner ranked successfully.",
                rankid: result.insertId
            });
        });
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error." });
    }
});
// =========================================================================
// 🎯 ၁။ SESSION အလိုက် WINNER အရေအတွက် ရေတွက်ပေးမည့် API
// =========================================================================

// ================= RANKING LIST API (ပြင်ဆင်ပြီး) =================
app.get('/api/ranking', (req, res) => {
    // query ထဲတွင် r.session_name ကိုပါ ဆွဲထုတ်ပေးရပါမည်
    const sqlQuery = `
        SELECT r.rankid, u.username, u.userph, p.prizename, r.session_name
        FROM \`ranktbl\` r
        INNER JOIN usertbl u ON r.userid = u.userid
        LEFT JOIN prizetbl p ON r.prizeid = p.prizeid
        ORDER BY r.rankid ASC
    `;
    db.query(sqlQuery, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.length === 0) return res.status(200).json({ success: true, message: "No ranking data yet.", data: [] });
        res.status(200).json({ success: true, count: results.length, data: results });
    });
});

app.get('/api/winners/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const query = `
        SELECT u.username, u.userph, p.prizename, p.prizeid, r.session_name
        FROM ranktbl r
        INNER JOIN usertbl u ON r.userid = u.userid
        INNER JOIN prizetbl p ON r.prizeid = p.prizeid
        WHERE r.session_name = ?
        ORDER BY 
            CASE 
                WHEN p.prizename LIKE '%Diamond%' THEN 1
                WHEN p.prizename LIKE '%Gold%' THEN 2
                WHEN p.prizename LIKE '%Silver%' THEN 3
                WHEN p.prizename LIKE '%Bronze%' THEN 4
                ELSE 5
            END ASC;
    `;
    db.query(query, [sessionId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 🛠️ USER API
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const sql = "SELECT userid, username, userph, useremail, userage, useroccup FROM usertbl WHERE userid = ?";
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).json({ error: "Database query error" });
        }
        if (results.length > 0) {
            res.json(results[0]);
        } else {
            res.status(404).json({ error: "User not found" });
        }
    });
});

// server.js ထဲမှာ express.json() ရှိမရှိ အရင်စစ်ပါ (မရှိရင် ထည့်ပေးပါ)
app.use(express.json());

// 🚀 SESSION NAME ကို UPDATE လုပ်မည့် API ROUTE
app.post('/api/update-session', (req, res) => {
    const { userId, sessionName } = req.body;

    if (!userId || !sessionName) {
        return res.status(400).json({ success: false, message: "အချက်အလက် မပြည့်စုံပါ။" });
    }
    console.log(`sessionid:${sessionName}`);
    // MySQL Query - userid ကိုကြည့်ပြီး usertbl ထဲက session_name ကို ပြင်မယ်
    // 💡 မှတ်ချက်။ ။ သင့်ရဲ့ db connection variable အမည် (ဥပမာ: db သိုမဟုတ် connection) ကို ပြောင်းလဲအသုံးပြုပါ
    const sqlUpdate = "UPDATE usertbl SET session_name = ? WHERE userid = ?";

    db.query(sqlUpdate, [sessionName, userId], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ success: false, message: "Database ပြင်ဆင်ရခြင်း မအောင်မြင်ပါ။" });
        }

        // Row တစ်ခုခု update ဖြစ်သွားရင် အောင်မြင်ကြောင်း အကြောင်းပြန်မယ်
        if (result.affectedRows > 0) {
            res.json({ success: true, message: "Session updated successfully!" });
        } else {
            res.status(404).json({ success: false, message: "အသုံးပြုသူ မတွေ့ရှိပါ။" });
        }
    });
});
// POST: /api/check-winner
app.post('/api/check-winner', (req, res) => {
    const { userph, randomTicket, session_name } = req.body;

    // Validation: အချက်အလက် ပါမပါ အရင်စစ်ဆေးခြင်း
    if (!userph || !randomTicket || !session_name) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    // SQL Query: user table မှ userph ကို စစ်ပြီး ranktbl ရှိ randomTicket, session_name တို့နှင့် တိုက်ဆိုင်စစ်ဆေးခြင်း
    const sqlQuery = `
        SELECT r.userid 
        FROM ranktbl r
        JOIN usertbl u ON r.userid = u.userid
        WHERE u.userph = ? 
          AND r.randomTicket = ? 
          AND r.session_name = ?
    `;

    // Database ထဲတွင် Query ပတ်၍ စစ်ဆေးခြင်း (db နေရာတွင် မိမိ connection variable အစားထိုးပါ)
    db.query(sqlQuery, [userph, randomTicket, session_name], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ success: false, message: "Internal server error." });
        }

        // ကိုက်ညီသော အချက်အလက် ရှိမရှိ စစ်ဆေးခြင်း
        if (results.length > 0) {
            // အချက်အလက် ကိုက်ညီပါက ဝင်ခွင့်ပြုမည်
            return res.json({
                success: true,
                exists: true,
                userid: results[0].userid,
                message: "Authentication successful."
            });
        } else {
            // အချက်အလက် မကိုက်ညီပါက ငြင်းပယ်မည်
            return res.json({
                success: true,
                exists: false,
                message: "Invalid phone number, ticket, or session."
            });
        }
    });
});
// =========================================================================
// 🎯 PLAYER တစ်ယောက် ယခု SESSION တွင် ဆော့ပြီးသားလား (နိုင်ပြီးသားလား) စစ်ဆေးရန် API
// =========================================================================
app.get('/api/check-player-played', (req, res) => {
    const { userid, session_name } = req.query;

    if (!userid || !session_name) {
        return res.status(400).json({ success: false, message: "Missing userid or session_name" });
    }

    // ranktbl ထဲမှာ ဒီ userid နဲ့ ဒီ session_name ရှိနေရင် သူက နိုင်ပြီးသား (သို့မဟုတ် ဆော့ပြီးသား) ဖြစ်ပါတယ်
    const sql = "SELECT COUNT(*) AS played_count FROM ranktbl WHERE userid = ? AND session_name = ?";

    db.query(sql, [userid, session_name], (err, results) => {
        if (err) {
            console.error("Error checking player history:", err);
            return res.status(500).json({ success: false, message: "Database error." });
        }

        const hasPlayed = results[0].played_count > 0;

        res.json({
            success: true,
            hasPlayed: hasPlayed // true ဆိုရင် ဆော့ပြီးသား၊ false ဆိုရင် မဆော့ရသေးဘူး
        });
    });
});
/* START SERVER */
server.listen(3000, () => {
    console.log("🚀 Server Running On Port 3000 (Unified Bingo Core)");
});
