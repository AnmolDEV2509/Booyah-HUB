# Booyah HUB - updated code

## Files (sab replace karo)
| File | Status |
|---|---|
| `index.html` | inline script hata di, ab sirf `apps.js` load hota hai (UI/CSS same, wallet cards ka CSS add) |
| `apps.js` | naya player app (index.html isi ko use karta hai) |
| `firebase-config.js` | ek hi jagah Firebase config (CDN imports, ab sach me use hota hai) |
| `utils.js` | NEW - escape (XSS fix), toast, balance helpers |
| `admin-common.js` | NEW - admin + sub-admin ka shared code (tournaments, announcements, results) |
| `admin.js`, `subadmin.js` | rewrite (duplicate code khatam) |
| `admin.html`, `subadmin.html` | chhote patches (results panel, refresh button, map/per-kill/rules fields) |
| `firebase-messaging-sw.js` | firebase 10.8.0 + null-safe |
| `firestore.rules`, `storage.rules` | NEW - security rules |
| `style.css` | kisi page me linked nahi tha - delete kar sakte ho |

Sabhi files ek hi folder me rakho (imports `./` relative hain).

## Deploy order
1. Pehle code upload karo.
2. Rules ko Firebase console -> **Rules Playground** me test karo, phir publish karo.
   Purane rules ki copy rakh lo (rollback ke liye).
3. Firestore console me `system_settings/payment_info` me `upiId` set hai ya nahi check karo
   (ab placeholder UPI ID nahi hai - bina UPI ID ke deposit block hota hai).

## Data migration notes
- Purane users ka `walletBalance` login pe automatically `depositBalance` ban jaata hai.
- Purane `transactions` collection ke pending deposit/withdraw ab admin panel me nahi dikhenge
  (naya flow `deposit_requests` / `withdrawal_requests` hai). Unhe manually dekh lo.
- Purane `results` jinme `status` nahi hai, wo PENDING maane jaate hain.
- Slot rule: **1 registration = 1 slot** (admin ka kick bhi -1 karta hai). Agar per-player slot chahiye
  to bolo.
- Purani registrations random id se bani thi, nayi `matchId_uid` se. Dono chalte hain.

## Behaviour changes
- Join sirf UPCOMING match me; LIVE/COMPLETED me registration band.
- Entry fee database se aati hai (page se nahi), transaction me kat'ti hai, double-join nahi hota.
- Deposit: UTR hi document id hai -> same UTR dobara submit nahi ho sakta.
- Admin approve/reject: double-click pe double credit nahi hota (status check transaction me).
- Results: PENDING -> VERIFIED (sub-admin) -> PAID (super admin, prize amount daal ke wallet me credit + winners list).
  Ab proof delete nahi hota, status badalta hai.
- Leaderboard ab asli `winners` data se banta hai (pehle fake data tha).
- Admin wallet edit: sirf badle hue field save hote hain + `wallet_logs` me audit entry.
- Sub-admin: Kick / prize pay nahi kar sakta (rules bhi yahi enforce karte hain).

## Abhi bhi baaki (honest note)
- Rules se cheating bahut mushkil hoti hai, par real paisa hai to balance changes Cloud Functions me
  hone chahiye.
- Push notifications wired nahi hain (service worker hai, par token/`getToken` code kahin nahi tha).
  Bell button sirf UI toggle hai.
- Tournament delete karne pe registered players ka refund automatic nahi hai (warning dikhti hai).
