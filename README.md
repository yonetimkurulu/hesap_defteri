# Hesap Defteri

Türkiye'deki küçük işletmeler için gelir, gider, borç, alacak, kişi ve proje takibi.

## Durum

Uygulama şu anda **local-first** çalışır. Defterler, kişiler, projeler ve finansal kayıtlar bilgisayardaki tarayıcı `localStorage` alanında tutulur. Supabase migration'ı ve veri servisleri projede hazırdır ancak uzak backend açıkça etkinleştirilmediği sürece kullanılmaz.

## Çalıştırma

```bash
npm install
npm run dev
```

Üretim build kontrolü: `npm run build`

## Windows uygulaması

Kurulum dosyası ve portable uygulama üretmek için:

```bash
npm run desktop:build
```

Çıktılar `release/` klasörüne gelir:

- `Hesap Defteri Setup 0.1.3.exe`: Windows kurulum sihirbazı
- `Hesap Defteri 0.1.3.exe`: Kurulumsuz portable sürüm

Uygulama local-first olduğu için kayıtlar Electron'un Windows `userData` klasöründe tutulur. `appId` sabit kaldığı için yeni setup sürümleri aynı klasörü kullanır ve güncelleme sırasında mevcut kayıtlar silinmez. Tarayıcı sürümünde kayıtlar aynı domain'in localStorage alanında tutulur.

GitHub üzerinden otomatik release üretmek için bir sürüm etiketi gönderin:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions Windows dosyalarını üretip Release’e ekler. Sitedeki indirme düğmesi bu Release dosyasını kullanır.

## Otomatik güncelleme

Masaüstü uygulaması `electron-updater` ile GitHub Releases üzerinden otomatik güncelleme destekler. Uygulama her açılışta arka planda yeni sürüm olup olmadığını kontrol eder. Yeni sürüm bulunursa kullanıcıya indirme ve yeniden başlatma seçeneği sunar. Güncelleme sırasında yerel kayıtlar korunur.

Yeni sürüm yayınlamak için:

```bash
# package.json'daki version'ı artırın, sonra:
git tag v0.1.3
git push origin v0.1.3
```

GitHub Actions otomatik olarak NSIS installer, portable exe ve `latest.yml` dosyasını oluşturup Release'e yükler. Mevcut kullanıcılar uygulamayı açtığında güncelleme bildirimi alır.

Çek kaydı, normal giderden ayrı tutulur. Çek türünde çek numarası ve vade/ödeme tarihi girilir; vade tarihi işlem geçmişinde gösterilir ve çek tutarı nakit gider toplamına otomatik eklenmez.

## Supabase geçiş planı

1. Supabase projesinde `supabase/migrations/001_initial_schema.sql` dosyasını çalıştırın.
2. `.env.example` dosyasını `.env` olarak kopyalayın.
3. `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini ekleyin.
4. Geçiş yapılana kadar `VITE_ENABLE_REMOTE_BACKEND=false` bırakın.
5. Uzak backend’e geçiş günü bu değeri `true` yapın ve yeni deployment alın.

Anon/publishable key frontend’de kullanılabilir; `service_role` anahtarı frontend’e eklenmemelidir. RLS politikaları aktif olmadan uzak backend açılmamalıdır.

## Finansal model

`income` ve `expense` nakit hareketlerini; `payable` ve `receivable` açık hesap oluşumunu; `payment` ve `collection` ise açık hesabın kapanmasını temsil eder. Borç/alacak oluşturmak tek başına nakit hareketi değildir. Tutarlar PostgreSQL'de `numeric(14,2)` tutulur.

## Defterler ve dönem görünümü

Yerel çalışma modunda kullanıcı, `Aktif defter` menüsünden birden fazla şirket defteri açabilir. Her defterin işlemleri, kişileri ve projeleri ayrı tutulur. Dashboard varsayılan olarak aylık görünür; günlük, tüm zamanlar ve özel tarih aralığı seçenekleri de vardır. Kişi alanı seçilerek girilen ödeme ve giderler, seçili dönemde “En çok ödeme yapılanlar” sıralamasında gösterilir.

## Güncelleme ve veri korunması

Yerel veri anahtarları sabit tutulur ve uygulama açılışında yalnızca `hesap-defteri-local-schema-version` işaretçisi güncellenir; mevcut kayıtlar silinmez. Gelecekteki veri modeli değişiklikleri bu sürüm üzerinden geriye dönük migration eklemelidir. Tarayıcı/site verileri temizlenirse local kayıtlar silinebilir; uzak backend’e geçişten önce JSON yedekleme/geri yükleme özelliği eklenmesi planlanmıştır.

## Bilinen sınırlar

- Supabase Auth ve gerçek veri okuma/yazma, opt-in geçiş aşamasında tutuluyor.
- Ödeme aşımı, atomik settlement RPC'leri ve kapsamlı test suite bir sonraki aşamadır.
- PWA manifesti kurulum metadata'sını içerir; üretim ikonları eklenmelidir.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
