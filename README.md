# argon-web

Argon Music ki **admin website** + **YouTube trending list** — dono GitHub par free chalte hain.

| Kya | Link |
| --- | --- |
| Admin website | `https://<aapka-github-username>.github.io/argon-web/` |
| Trending list (app isse padhta hai) | `https://<aapka-github-username>.github.io/argon-web/trending.json` |

## Files

- `index.html` — admin website (users, songs, requests, YouTube status)
- `firebase-config.js` — Firebase settings (app wali `src/firebase-config.js` jaisi hi values)
- `firestore.rules` — database ki security rules (Firebase console → Firestore → Rules mein paste karein)
- `.github/workflows/update-trending.yml` + `scripts/update-trending.mjs` — har ghante YouTube + Apple Music
  se India ke trending gaane laata hai aur `trending.json` mein save karta hai
- `trending.json` — upar wala program isse khud update karta hai

## YouTube "unlimited" kaise hai

- YouTube ko **har ghante sirf 1 request** jaati hai (din mein 24), chahe app kitne bhi log use karein.
  Free limit 10,000 per day hai — isliye ye hamesha free aur bina rukawat chalega.
- YouTube API key GitHub ke **Secret** (`YT_API_KEY`) mein rehti hai — website ya app mein kabhi nahi dikhti.
- Har ghante `trending.json` update hone se repository active rehti hai, isliye GitHub ise band nahi karta.

Poore setup ke steps: `AUDIXO-SETUP-GUIDE.txt` (audixo-music folder mein).
