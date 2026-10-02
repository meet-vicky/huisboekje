# Huisboekje installeren (Firebase)

Alles is gratis: een eigen **Firebase-project** voor de gegevens en **GitHub Pages** voor de website. Het staat volledig los van je kassa.

## 1. Firebase-project

1. Ga naar console.firebase.google.com en klik op **Create a project**. Noem het `Huisboekje` en zet Google Analytics uit.
2. Ga naar **Build → Authentication → Get started**. Zet **Email/Password** aan en maak onder **Users → Add user** een account voor jou en voor Tom.
3. Ga naar **Build → Firestore Database → Create database**. Kies als locatie **europe-west1 (Belgium)** en kies **production mode**.
4. Open in Firestore het tabblad **Rules** en plak de inhoud van `firestore.rules`. **Vervang de twee e-mailadressen** door die van stap 2 en klik op **Publish**.
5. Klik op het tandwiel **Project settings**. Kies onder **Your apps** het `</>`-icoon, met als bijnaam `huisboekje-web`. Kopieer de waarden uit `firebaseConfig`.

## 2. config.js invullen

Open `config.js` in Kladblok en plak de waarden tussen de aanhalingstekens (apiKey, authDomain, projectId, …).

## 3. Online zetten met GitHub Pages

1. Maak op github.com een nieuwe **publieke** repository `huisboekje`.
2. Klik op **uploading an existing file**, sleep alle bestanden uit deze map erin en klik op **Commit changes**.
3. Ga naar **Settings → Pages**. Kies bij *Source* **Deploy from a branch**, met de branch **main** en de map **/ (root)**, en klik op **Save**.
4. Na een minuutje staat het op `https://meet-vicky.github.io/huisboekje/`.
5. Zet in Firebase onder **Authentication → Settings → Authorized domains** het domein `meet-vicky.github.io` erbij.

Je uitgaven staan nooit op GitHub. Ze staan alleen in Firebase, en de regels laten alleen jullie twee e-mailadressen binnen.

## 4. Op je gsm

Open de link in Chrome, meld je aan en kies **⋮ → Toevoegen aan startscherm**. Tom doet hetzelfde met zijn eigen account.

## Goed om te weten

- **Zonder internet** blijft alles werken. Firebase stuurt je wijzigingen door zodra je weer bereik hebt.
- **Gratis verbruik**: de app laadt alleen de laatste 13 maanden en de openstaande facturen. Oudere jaren laad je via **Lijst → Oudere uitgaven laden**. Zo blijf je ruim binnen het gratis verbruik van Firebase.
- **Iets aangepast in de bestanden?** Verhoog in `sw.js` het nummer in `huisboekje-v1` (bv. naar `-v2`) en upload opnieuw. Open de app daarna twee keer.
- **Back-up**: onder **Overzicht → Exporteer naar Excel** maak je een kopie van alles.
