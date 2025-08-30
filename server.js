const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chesstroll';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB bağlantısı başarılı!'))
    .catch(err => console.error('❌ MongoDB bağlantı hatası:', err));

// Player Schema
const playerSchema = new mongoose.Schema({
    nick: { type: String, required: true, unique: true, maxLength: 20 },
    ip: { type: String, required: true },
    totalScore: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    lastPlayed: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// Game Schema
const gameSchema = new mongoose.Schema({
    gameId: { type: String, required: true, unique: true },
    whitePlayer: { type: String, required: true },
    blackPlayer: { type: String, required: true },
    winner: { type: String }, // 'white', 'black', 'draw'
    endReason: { type: String }, // 'checkmate', 'timeout', 'resign', 'queen-capture'
    duration: { type: Number }, // saniye
    whiteScore: { type: Number, default: 0 },
    blackScore: { type: Number, default: 0 },
    whiteTimeBonus: { type: Number, default: 0 },
    blackTimeBonus: { type: Number, default: 0 },
    finalWhiteScore: { type: Number, default: 0 },
    finalBlackScore: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const Player = mongoose.model('Player', playerSchema);
const Game = mongoose.model('Game', gameSchema);

// Aktif oyunlar ve bekleme listesi
let waitingPlayers = [];
let activeGames = new Map();
let connectedPlayers = new Map();

// Socket.io bağlantıları
io.on('connection', (socket) => {
    console.log(`🎮 Yeni bağlantı: ${socket.id}`);

    // Oyuncu girişi
    socket.on('player-join', async (data) => {
        try {
            const { nick, ip } = data;
            
            // Nick kontrolü
            if (!nick || nick.length > 20 || nick.length < 2) {
                socket.emit('error', 'Nick 2-20 karakter arası olmalı!');
                return;
            }

            // Oyuncu var mı kontrol et
            let player = await Player.findOne({ $or: [{ nick }, { ip }] });
            
            if (!player) {
                // Yeni oyuncu oluştur
                player = new Player({ nick, ip });
                await player.save();
                console.log(`✨ Yeni oyuncu: ${nick}`);
            } else if (player.ip !== ip) {
                // IP değişmiş, güncelle
                player.ip = ip;
                player.lastPlayed = new Date();
                await player.save();
            } else {
                // Mevcut oyuncu, son oynama tarihini güncelle
                player.lastPlayed = new Date();
                await player.save();
            }

            // Socket'e oyuncu bilgisini ata
            socket.playerData = player;
            connectedPlayers.set(socket.id, player);

            // Oyuncuya bilgilerini gönder
            socket.emit('player-data', {
                nick: player.nick,
                totalScore: player.totalScore,
                gamesPlayed: player.gamesPlayed,
                gamesWon: player.gamesWon
            });

            // Sıralamayı gönder
            await sendLeaderboard();

            console.log(`👤 ${player.nick} oyuna katıldı`);

        } catch (error) {
            console.error('Player join error:', error);
            socket.emit('error', 'Giriş hatası! Tekrar deneyin.');
        }
    });

    // Oyun arama
    socket.on('find-game', () => {
        if (!socket.playerData) {
            socket.emit('error', 'Önce giriş yapın!');
            return;
        }

        // Zaten oyunda mı kontrol et
        for (let [gameId, game] of activeGames) {
            if (game.whitePlayer.nick === socket.playerData.nick || 
                game.blackPlayer.nick === socket.playerData.nick) {
                socket.emit('error', 'Zaten bir oyundasınız!');
                return;
            }
        }

        // Beklemede mi kontrol et
        const waitingIndex = waitingPlayers.findIndex(p => p.playerData.nick === socket.playerData.nick);
        if (waitingIndex !== -1) {
            socket.emit('error', 'Zaten oyun arıyorsunuz!');
            return;
        }

        // Eşleşen oyuncu var mı kontrol et
        if (waitingPlayers.length > 0) {
            const opponent = waitingPlayers.shift();
            
            // Oyun oluştur
            const gameId = generateGameId();
            const game = {
                gameId,
                whitePlayer: { socket, playerData: socket.playerData },
                blackPlayer: { socket: opponent, playerData: opponent.playerData },
                startTime: Date.now(),
                gameState: null
            };

            activeGames.set(gameId, game);

            // Oyunculara oyun başlangıcını bildir
            socket.emit('game-start', {
                gameId,
                color: 'white',
                opponent: opponent.playerData.nick
            });

            opponent.emit('game-start', {
                gameId,
                color: 'black',
                opponent: socket.playerData.nick
            });

            console.log(`🎮 Oyun başladı: ${socket.playerData.nick} vs ${opponent.playerData.nick}`);

        } else {
            // Bekleme listesine ekle
            waitingPlayers.push(socket);
            socket.emit('waiting-for-opponent');
            console.log(`⏳ ${socket.playerData.nick} rakip arıyor...`);
        }
    });

    // Oyun hamleleri
    socket.on('game-move', (data) => {
        const { gameId, moveData } = data;
        const game = activeGames.get(gameId);
        
        if (!game) {
            socket.emit('error', 'Oyun bulunamadı!');
            return;
        }

        // Hamleyi karşı tarafa gönder
        const opponent = game.whitePlayer.socket.id === socket.id ? 
                        game.blackPlayer.socket : game.whitePlayer.socket;
        
        opponent.emit('opponent-move', moveData);
    });

    // Oyun bitişi
    socket.on('game-end', async (data) => {
        try {
            const { gameId, winner, endReason, whiteScore, blackScore, whiteTimeBonus, blackTimeBonus } = data;
            const game = activeGames.get(gameId);
            
            if (!game) return;

            // Final puanları hesapla
            const finalWhiteScore = whiteScore + whiteTimeBonus;
            const finalBlackScore = blackScore + blackTimeBonus;

            // Veritabanına oyun kaydet
            const gameRecord = new Game({
                gameId,
                whitePlayer: game.whitePlayer.playerData.nick,
                blackPlayer: game.blackPlayer.playerData.nick,
                winner,
                endReason,
                duration: Math.floor((Date.now() - game.startTime) / 1000),
                whiteScore,
                blackScore,
                whiteTimeBonus,
                blackTimeBonus,
                finalWhiteScore,
                finalBlackScore
            });

            await gameRecord.save();

            // Oyuncu puanlarını güncelle
            const whitePlayer = await Player.findOne({ nick: game.whitePlayer.playerData.nick });
            const blackPlayer = await Player.findOne({ nick: game.blackPlayer.playerData.nick });

            if (whitePlayer) {
                whitePlayer.gamesPlayed++;
                whitePlayer.totalScore += finalWhiteScore;
                if (winner === 'white') whitePlayer.gamesWon++;
                await whitePlayer.save();
            }

            if (blackPlayer) {
                blackPlayer.gamesPlayed++;
                blackPlayer.totalScore += finalBlackScore;
                if (winner === 'black') blackPlayer.gamesWon++;
                await blackPlayer.save();
            }

            // Oyunculara sonucu bildir
            game.whitePlayer.socket.emit('game-ended', {
                winner,
                endReason,
                yourScore: finalWhiteScore,
                opponentScore: finalBlackScore
            });

            game.blackPlayer.socket.emit('game-ended', {
                winner,
                endReason,
                yourScore: finalBlackScore,
                opponentScore: finalWhiteScore
            });

            // Oyunu temizle
            activeGames.delete(gameId);

            // Sıralamayı güncelle
            await sendLeaderboard();

            console.log(`🏁 Oyun bitti: ${winner} kazandı`);

        } catch (error) {
            console.error('Game end error:', error);
        }
    });

    // Bağlantı koptuğunda
    socket.on('disconnect', () => {
        console.log(`🚪 Bağlantı koptu: ${socket.id}`);

        // Bekleme listesinden çıkar
        const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
        }

        // Aktif oyundan çıkar
        for (let [gameId, game] of activeGames) {
            if (game.whitePlayer.socket.id === socket.id || 
                game.blackPlayer.socket.id === socket.id) {
                
                const opponent = game.whitePlayer.socket.id === socket.id ? 
                                game.blackPlayer.socket : game.whitePlayer.socket;
                
                opponent.emit('opponent-disconnected');
                activeGames.delete(gameId);
                break;
            }
        }

        connectedPlayers.delete(socket.id);
    });

    // Sıralama talebi
    socket.on('get-leaderboard', async () => {
        await sendLeaderboard();
    });
});

// Sıralamayı gönder
async function sendLeaderboard() {
    try {
        const topPlayers = await Player.find()
            .sort({ totalScore: -1 })
            .limit(10)
            .select('nick totalScore gamesPlayed gamesWon');

        io.emit('leaderboard-update', topPlayers);
    } catch (error) {
        console.error('Leaderboard error:', error);
    }
}

// Oyun ID üretici
function generateGameId() {
    return 'game_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// API Routes
app.get('/api/stats', async (req, res) => {
    try {
        const totalPlayers = await Player.countDocuments();
        const totalGames = await Game.countDocuments();
        const onlinePlayers = connectedPlayers.size;
        const activeGameCount = activeGames.size;

        res.json({
            totalPlayers,
            totalGames,
            onlinePlayers,
            activeGames: activeGameCount
        });
    } catch (error) {
        res.status(500).json({ error: 'Stats error' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const topPlayers = await Player.find()
            .sort({ totalScore: -1 })
            .limit(50)
            .select('nick totalScore gamesPlayed gamesWon');

        res.json(topPlayers);
    } catch (error) {
        res.status(500).json({ error: 'Leaderboard error' });
    }
});

// Sunucu başlat
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🚀 ChessTroll Server çalışıyor: http://localhost:${PORT}`);
    console.log(`📊 MongoDB: ${MONGODB_URI}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Server kapanıyor...');
    server.close(() => {
        mongoose.connection.close();
        process.exit(0);
    });
});

