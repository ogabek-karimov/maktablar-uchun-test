# Bilimdon — maktab testlari

3–11-sinf o'quvchilari uchun 2025–2026 o'quv yili maktab darsliklari asosida tuzilgan test sayti.

**Sayt:** https://ogabek-karimov.github.io/maktablar-uchun-test/

- Sinf → fan → mavzu tanlanadi.
- Har bir mavzu bo'yicha **mustahkamlovchi test** (javob darhol tekshiriladi).
- **Umumiy test** — butun darslik bo'yicha (30, 50, 100 ta yoki hamma savollar).
- **Test** (A/B/C/D) yoki **yozma** (javobni o'zi yozadi) rejimi.
- Oxirida: nechta to'g'ri, nechta xato, baho va har bir savol tahlili.

## Savollar qanday saqlanadi

`content/<sinf>/<fan>.txt` fayllarida, oddiy matn ko'rinishida:

```
fan: fizika
kitob: Fizika. 7-sinf. ...

## Mavzu nomi

? Savol matni
+ To'g'ri javob
- Xato variant
- Xato variant
- Xato variant
= yozma rejimda qabul qilinadigan boshqa yozilishlar | ...
! Qisqa izoh (ixtiyoriy)
```

`node scripts/build.mjs` barcha fayllarni tekshiradi (har bir savolda 1 ta to'g'ri va 3 ta xato variant,
takrorlanmaslik, har bir mavzuda kamida 30 ta savol) va `_site/` papkasiga saytni yig'adi.
GitHub Actions har bir push'da shu tekshiruvdan o'tkazib, saytni GitHub Pages'ga joylaydi.

Lokal ko'rish: `node scripts/build.mjs && python3 -m http.server -d _site 8000`
