# Πίνακες Σύστασης Ιδιοκτησίας

Εργαλείο μηχανικού για τους πίνακες που παραδίδονται στη συμβολαιογράφο για σύσταση οριζόντιας/κάθετης ιδιοκτησίας: χιλιοστά, αναλογία γης, αποκλειστικές χρήσεις (κήποι, πισίνες, θέσεις στάθμευσης), κοινόχρηστα και κατανομή δαπανών, έλεγχοι και εξαγωγή σε PDF / Excel.

## Τεχνολογία
- **Vite** (vanilla JS), χωρίς framework
- **Supabase**: login (email/κωδικός), Postgres με RLS — κάθε χρήστης βλέπει μόνο τα δικά του έργα
- Κάθε έργο είναι ένα έγγραφο `jsonb` (`projects.data`), ώστε νέα πεδία να μη χρειάζονται migration
- Αυτόματο ιστορικό εκδόσεων (`project_versions`) και «κάδος» για διαγραμμένα έργα
- Τοπικό αντίγραφο σε κάθε συσκευή: αν πέσει το internet, οι αλλαγές φυλάσσονται και στέλνονται μόλις επανέλθει

## Δομή
| Αρχείο | Τι κάνει |
|---|---|
| `src/core.js` | Όλοι οι υπολογισμοί (χιλιοστά, αναλογίες, ισοζύγιο, έλεγχοι). Χωρίς DOM. |
| `src/main.js` | Διεπαφή, συγχρονισμός, εξαγωγές PDF/Excel |
| `src/store.js` | Κλήσεις στο Supabase |
| `supabase/migrations/` | Σχήμα βάσης (εφαρμοσμένο στο project `systasi`) |
| `tests/` | Τεστ υπολογισμών, σχήματος/RLS (PGlite) και διεπαφής (Playwright, προσομοίωση Supabase) |

## Τοπικά
```bash
npm install
cp .env.example .env   # URL και publishable key του Supabase project
npm run dev            # http://localhost:5173
npm test               # τεστ υπολογισμών και βάσης
```

## Δημοσίευση (Vercel)
1. Vercel → Add New → Project → Import αυτό το repo (Framework: Vite, χωρίς άλλες ρυθμίσεις).
2. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (τιμές στο `.env.example`).
3. Supabase → Authentication → URL Configuration: **Site URL** = η διεύθυνση του Vercel, και στα **Redirect URLs** η ίδια διεύθυνση και `http://localhost:5173`.

Κάθε `git push` στο `main` δημοσιεύεται αυτόματα.

## Μεταφορά δεδομένων από την έκδοση στο claude.ai
Στο παλιό εργαλείο: **⋯ → Εξαγωγή όλων των έργων (.json)**. Στη νέα εφαρμογή: **Νέο έργο → Εισαγωγή αντιγράφου (.json)** — περνούν όλα τα έργα και η σφραγίδα μηχανικού.
