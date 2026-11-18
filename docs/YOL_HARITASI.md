# Anime Oyun Platformu — Geliştirme Yol Haritası

Bu belge, Anime Debate'in bir **anime oyun ve rekabet platformuna** dönüşme planıdır.
Açık artırma platformdaki oyunlardan yalnızca biridir; öncelik sırası aşağıdadır.

İlk aşamada yalnızca beş anime kullanılır: Naruto, One Piece, Bleach, Black Clover, Tokyo Revengers.

---

## Mevcut durum (başlangıç noktası)

| Alan | Durum |
| --- | --- |
| Hesaplar, oturum, profil, profil fotoğrafı | ✅ Var |
| XP, seviye, 10 rütbe, Anime Coin (AC), 17 başarım | ✅ Var (tüm oyunlara ortak) |
| Karakter veritabanı | ✅ 185 karakter, güç tieri, nadirlik, karaktere özel puan, Türkçe metinler, görseller |
| Canlı Açık Artırma | ✅ Veritabanı tabanlı, Vercel uyumlu, 5'erli takım kuralları |
| Kart Arenası | ⏸ Kaldırıldı; Aşama 5'te sıfırdan yeniden yapılacak |
| Tartışmalar, VS oylamaları, yorumlar, bildirimler, admin | ✅ Var |
| Oyun başına ayrı rating, sezonlar, birleşik maç geçmişi | ✅ Aşama 1 tamamlandı |
| Anime 1v1 | ✅ Aşama 2 tamamlandı (`/versus`) |
| Bu Karakter Kim?, Quiz, Turnuvalar, Arkadaşlar | ❌ Yok |

### Teknik ilkeler (tüm oyunlar için)

- **Sunucu otoritesi:** Oyun durumu veritabanında tutulur; her istek ilgili satırı kilitler
  (`SELECT … FOR UPDATE`). Vercel'in sunucusuz yapısında güvenli çalışır.
- **Gerçek zamanlılık:** Kısa aralıklı yoklama (polling). Sunucu saatiyle senkronize sayaçlar.
- **Hile koruması:** Cevaplar/gizli bilgiler istemciye gönderilmez; süreler sunucuda ölçülür;
  hız sınırları; görsel ipuçları sunucuda işlenir (cevap URL'den okunamaz).
- **Ayrı reytingler:** Her oyunun kendi reytingi ve sezon tablosu vardır; bir oyundaki başarı
  diğerini etkilemez. XP/AC/başarımlar ortaktır.
- **Her oyun tam bir oyundur:** kurallar, sonuç ekranı, ödüller, istatistikler, hata durumları,
  mobil uyum, Türkçe arayüz. Yarım kalan özellik yayına alınmaz; "yakında" butonu konmaz.

---

## Aşamalar

### Aşama 1 — Platform çekirdeği ve ortak ilerleme ✅
- Oyun kayıt defteri (hangi oyunlar var, adları, sayfaları).
- **Sezonlar** (ör. 3 aylık), **oyun başına reyting** (Elo; ilk 10 maçta hızlı yerleşme), seri/en iyi seri.
- **Birleşik maç geçmişi:** her oyunun sonucu tek tabloya yazılır (oyun, mod, dereceli mi, sonuç, reyting değişimi, kazanılan XP/AC).
- Ortak **sonuç işleyici:** maç sonu → reyting + XP + AC + başarımlar tek yerden (çift sayım engelli).
- Açık artırma ve Kart Arenası bu katmana bağlanır.
- **Oyunlar merkezi** (`/games`), menüde "Oyunlar"; açık artırma artık menüye hâkim değil.
- **Sıralama:** genel (XP) + oyun bazlı sezon reytingleri.
- **Profil:** oyun bazlı reyting/istatistik ve son maçlar.

### Aşama 2 — Anime 1v1 (stratejik karakter düellosu) ✅
- Her karaktere dengelenmiş nitelikler: Can, Saldırı, Savunma, Hız, Enerji + 3 yetenek
  (tür, enerji maliyeti, etki, bekleme süresi). Nitelikler güç tieri ve rollerden türetilir, elle dengelenir.
- **Eşzamanlı gizli hamle** sistemi: her tur iki oyuncu aynı anda hamle seçer
  (Saldırı / Savunma / Yetenek / Odaklan). Hız önceliği, karşı hamleler, enerji yönetimi → rastgelelik yok, karar önemli.
- Modlar: Antrenman (bota karşı), Dostluk maçı (kod/bağlantı), **Dereceli** (eşleştirme, reyting).
- Maç geçmişi, tur tur tekrar özeti, sezon sıralaması.
- Uygulandı: 4 dövüş tipi (Tank/Hız/Güç/Taktik), 8 yetenek türü, 20 tur sınırı, 25 sn tur süresi,
  3 kez hamle seçmeyen kaybeder, çekilen oyuncu ödül almaz, botta günlük 15 ödüllü maç.
  Denge testi: hiçbir tip diğerine karşı %20–80 dışına çıkmıyor; zor bot kolay botu %75+ yeniyor.

### Aşama 3 — Bu Karakter Kim?
- Modlar: **Silüet**, **Bulanık**, **Sadece gözler**, karışık. Zorluk seviyeleri (popüler → az bilinen karakterler, ipucu sayısı).
- Görseller sunucuda işlenir; cevap görsel adresinden veya ağ trafiğinden okunamaz.
- Süreli oyun, **günlük meydan okuma** (herkese aynı set, günde bir kez), **seri** sistemi.
- Çok oyunculu yarış odaları (aynı anda aynı karakter; ilk doğru bilen daha çok puan).
- İstatistikler ve sıralamalar.

### Aşama 4 — Anime Quiz
- Yapılandırılmış **soru bankası** (anime, kategori, zorluk, doğrulama durumu, kaynak).
- Karakter verisinden doğrulanabilir otomatik sorular + elle eklenen sorular + admin soru yönetimi;
  banka zamanla binlerce soruya büyür.
- Solo, süreli, günlük meydan okuma, çok oyunculu düello.
- Hile koruması: doğru cevap istemciye gitmez, süre sunucuda ölçülür, soru başına tek cevap.

### Aşama 5 — Kart Düellosu (Kart Arenası'nın tam oyuna dönüşmesi)
- Koleksiyon (açık artırma + başlangıç kartları + ödüller), nadirlikler, karaktere özel yetenekler.
- Kart **yükseltme** (kopya + AC), deste kurucu ve deste kuralları, dereceli mod, koleksiyon istatistikleri.

### Aşama 6 — Turnuva sistemi
- 8 ve 16 kişilik **eleme ağaçları**, kayıt, tohumlama (reytinge göre), tur pencereleri ve
  gelmeyen oyuncuya hükmen galibiyet.
- Turnuvalar oyunlardan herhangi biriyle oynanır (1v1, Quiz, Kart Düellosu…).
- Turnuva geçmişi, sezon şampiyonası, ödüller.

### Aşama 7 — Sosyal özellikler
- Arkadaşlık istekleri, arkadaş listesi, çevrimiçi durumu.
- Herhangi bir oyunda **oyuncuya meydan okuma**, bildirimler.

### Aşama 8 — Açık artırma iyileştirmeleri
### Aşama 9 — Kozmetik mağazası (AC ile), animasyonlar ve ek özellikler

---

Her aşama: tasarım → uygulama → otomatik testler (oyun motoru, sunucu) → iki oyunculu tarayıcı testi →
yayın. Mevcut özellikler korunur.
