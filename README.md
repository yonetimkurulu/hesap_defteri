# Hesap Defteri

Türkiye'deki küçük işletmeler için gelir, gider, borç, alacak, kişi ve proje takibi.

## Durum

Uygulama şu anda Supabase bağlantısı olmadan açıkça yerel çalışma modunda çalışır. Kayıtlar tarayıcı `localStorage` alanına yazılır; gerçek çok kiracılı kullanım için Supabase migration'ı uygulanmalı ve ortam değişkenleri tanımlanmalıdır.

## Çalıştırma

```bash
npm install
npm run dev
```

Üretim build kontrolü: `npm run build`

## Supabase kurulumu

1. Supabase projesinde `supabase/migrations/001_initial_schema.sql` dosyasını çalıştırın.
2. `.env.example` dosyasını `.env` olarak kopyalayın.
3. `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini ekleyin.
4. Kimlik doğrulama ve şirket üyeliği oluşturma akışını backend ile bağlayın.

## Finansal model

`income` ve `expense` nakit hareketlerini; `payable` ve `receivable` açık hesap oluşumunu; `payment` ve `collection` ise açık hesabın kapanmasını temsil eder. Borç/alacak oluşturmak tek başına nakit hareketi değildir. Tutarlar PostgreSQL'de `numeric(14,2)` tutulur.

## Defterler ve dönem görünümü

Yerel çalışma modunda kullanıcı, `Aktif defter` menüsünden birden fazla şirket defteri açabilir. Her defterin işlemleri, kişileri ve projeleri ayrı tutulur. Dashboard varsayılan olarak aylık görünür; günlük, tüm zamanlar ve özel tarih aralığı seçenekleri de vardır. Kişi alanı seçilerek girilen ödeme ve giderler, seçili dönemde “En çok ödeme yapılanlar” sıralamasında gösterilir.

## Bilinen sınırlar

- Supabase Auth ve gerçek veri okuma/yazma UI'ya henüz bağlanmadı.
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
