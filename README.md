# 🏆 ChessTroll.com - Online Multiplayer Chess

Dünya çapında oynanabilen ChessTroll multiplayer sistemi!

## 🚀 Özellikler

### 🎮 Oyun Özellikleri
- **Online Multiplayer**: Gerçek oyuncularla canlı oyun
- **Nick Sistemi**: IP tabanlı oyuncu tanıma
- **Canlı Sıralama**: Real-time leaderboard
- **Süre Bonusu**: Kalan süre puan olarak eklenir
- **Sesli Efektler**: Türk dizi/film replikler
- **ChessTroll Kuralları**: Özel yerleştirme ve şah→vezir kuralları

### 📊 Puan Sistemi
- **Mat ile kazanma**: 10 puan + süre bonusu
- **Vezir yakalama**: 8 puan + süre bonusu  
- **Süre bitimi (yüksek puan)**: 6 puan + süre bonusu
- **Rakip çıkış**: 5 puan
- **Beraberlik**: 2 puan + süre bonusu
- **Süre Bonusu**: Kalan saniye / 10 = puan

## 🛠️ Kurulum

### 1. Gereksinimler
```bash
- Node.js 16+
- MongoDB (Atlas önerilen)
- Domain (chesstroll.com)
```

### 2. Server Kurulumu
```bash
# Repository'yi klonla
git clone https://github.com/your-repo/chesstroll-server.git
cd chesstroll-server

# Dependencies yükle
npm install

# Environment dosyasını ayarla
cp env.example .env
# .env dosyasını düzenle

# MongoDB bağlantısını ayarla
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chesstroll

# Server'ı başlat
npm start
```

### 3. Production Deployment

#### Heroku
```bash
# Heroku CLI yükle
heroku create chesstroll-app
heroku addons:create mongolab:sandbox
heroku config:set MONGODB_URI=your_mongodb_url
git push heroku main
```

#### DigitalOcean
```bash
# Droplet oluştur (Ubuntu 20.04)
# Node.js ve MongoDB kur
# PM2 ile production başlat
pm2 start server.js --name chesstroll
pm2 startup
pm2 save
```

### 4. Domain Ayarları
```bash
# Nginx configuration
server {
    listen 80;
    server_name chesstroll.com www.chesstroll.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📁 Dosya Yapısı

```
chesstroll-server/
├── server.js              # Ana server dosyası
├── package.json           # Dependencies
├── env.example            # Environment örneği
├── README.md             # Bu dosya
└── public/
    └── chesstroll-multiplayer.html  # Client
```

## 🎯 API Endpoints

### GET /api/stats
```json
{
  "totalPlayers": 1500,
  "totalGames": 3200,
  "onlinePlayers": 45,
  "activeGames": 12
}
```

### GET /api/leaderboard
```json
[
  {
    "nick": "Oyuncu123",
    "totalScore": 250.5,
    "gamesPlayed": 15,
    "gamesWon": 8
  }
]
```

## 🔧 Socket.io Events

### Client → Server
- `player-join`: Oyuncu girişi
- `find-game`: Rakip arama
- `game-move`: Hamle gönderme
- `game-end`: Oyun bitişi

### Server → Client
- `player-data`: Oyuncu bilgileri
- `game-start`: Oyun başlangıcı
- `opponent-move`: Rakip hamlesi
- `leaderboard-update`: Sıralama güncellemesi

## 🌍 Production Checklist

- [ ] MongoDB Atlas hesabı
- [ ] Domain satın al (chesstroll.com)
- [ ] SSL sertifikası (Let's Encrypt)
- [ ] CDN kurulumu (Cloudflare)
- [ ] Analytics (Google Analytics)
- [ ] Error tracking (Sentry)
- [ ] Backup sistem
- [ ] Load balancer (çoklu sunucu için)

## 📈 Scalability

### Single Server (0-1000 oyuncu)
- 1 CPU, 2GB RAM
- MongoDB Atlas M0 (ücretsiz)
- Heroku Basic dyno

### Multi Server (1000+ oyuncu)
- Load balancer
- Redis for session sharing
- MongoDB replica set
- Separate game servers

## 🐛 Troubleshooting

### MongoDB Bağlantı Hatası
```bash
# IP whitelist kontrol et
# MongoDB Atlas > Network Access > Add IP

# Connection string kontrol et
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chesstroll?retryWrites=true&w=majority
```

### Socket.io CORS Hatası
```javascript
// server.js içinde
const io = socketIo(server, {
    cors: {
        origin: ["https://chesstroll.com", "https://www.chesstroll.com"],
        methods: ["GET", "POST"]
    }
});
```

## 📞 Destek

- **Email**: support@chesstroll.com
- **Discord**: ChessTroll Community
- **GitHub Issues**: Bug reports

## 📄 Lisans

MIT License - Açık kaynak proje

---

**ChessTroll.com** - Dünya çapında en eğlenceli satranç deneyimi! 🏆🌍