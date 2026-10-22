# Pulse

A live map of casual meetups near you: pickup games, board games, jams, runs. Drop a **Pulse** when you're starting something in the next 3 hours, and people within walking distance can join in one tap.

- **Map**: a real OpenStreetMap map with GPS, restyled to stay calm (blocks, streets, parks, water, a few names). Live Pulses ripple, and the ring shows time left. It follows the phone's light or dark mode.
- **Navigate**: opens walking directions in Google Maps (the app on phones), shown only to people allowed to see the exact spot. Hosts can also paste a Google Maps link to place their pin.
- **Profiles**: no sign-up needed. Guests pick a nickname the first time they join, or tap **Continue with Google** to use their Google name and photo.
- **Nearby**: a timeline of what's within walk, bike or drive distance over the next 3 hours.
- **Feed**: updates, photos and check-ins posted from the spot by hosts and accepted people ("court 2 is free, bring water"), so people can see what it's like before they go.
- **History**: ended Pulses stay on the map, greyed out at a rough area. A newer Pulse nearby buries the older ones ("+3 earlier here"), and searching brings them back up. **Pulse again** restarts one.
- **Privacy**: the host picks who sees the exact spot, either everyone or only people they accept. The database itself enforces this: others only receive a rough area, about 330 m.
- **Grow**: share cards with QR codes (sent to the phone's share sheet for LINE, IG and Messenger), posts that write themselves in English or Thai, and an A4 QR poster.

## Run it locally

```bash
npm install
npm run dev
```

Without Supabase keys, the app runs in **demo mode** with example Pulses around central Bangkok, kept in memory on your device. That's enough to try every screen.

## Go live (free, about 15 minutes)

### 1. Supabase (database, sign-in, photos, realtime)

1. Create a free project at [supabase.com](https://supabase.com). Choose the **Southeast Asia (Singapore)** region so it's fast in Thailand.
2. **SQL Editor → New query**: paste all of `supabase/schema.sql` and run it. Run it again after updating the app; it is safe to re-run.
3. **Authentication → Sign In / Providers → Anonymous sign-ins**: turn it on. People can use the app without making an account, and they only enter a nickname the first time they join or post.
4. **Google sign-in (optional, recommended)**: see the next section.
5. *(Recommended before you promote it)* **Authentication → Attack Protection**: turn on CAPTCHA (Cloudflare Turnstile is free) so bots can't create endless anonymous users.
6. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

### Google sign-in

Guests can use everything without an account. "Continue with Google" links Google to the guest account, so nothing they did is lost. It fills in their name and photo and keeps their Pulses on every device.

1. In [Google Cloud Console](https://console.cloud.google.com/), go to **APIs & Services → OAuth consent screen**. Set it up as **External**, with app name "Pulse", and add your support email.
2. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173` and your live domain.
   - **Authorized redirect URI**: `https://<your-project>.supabase.co/auth/v1/callback`. Supabase shows this exact URL on its Google provider page.
3. In Supabase, open **Authentication → Sign In / Providers → Google**: turn it on, then paste the Client ID and Client Secret.
4. On the same page, turn on **Allow manual linking**. This lets a guest attach Google without losing their Pulses. If it's off, Google sign-in still works, but it starts a fresh account.
5. **Authentication → URL Configuration**: set **Site URL** to your live domain, and add `http://localhost:5173/**` and `https://your-domain/**` under **Redirect URLs**.

If someone signs in with a Google account that already has a Pulse profile (from another phone, say), the app switches them to that account automatically.

### 2. Configure

```bash
cp .env.example .env.local
# paste VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

The "demo" badge next to the logo changes to "live".

### 3. Deploy

Any static host works. Two free options:

- **Cloudflare Pages** (free tier allows commercial use): connect the Git repo, set build command `npm run build` and output folder `dist`, and add the two `VITE_SUPABASE_*` variables.
- **Netlify** or **Vercel**: same settings. Note that Vercel's free Hobby plan is for non-commercial projects only.

GPS only works over **https**, which all of these hosts give you automatically.

## How the privacy works

| Table | Who can read | What's in it |
|---|---|---|
| `pulses` | everyone | title, time, people needed, area name, **rough** lat/lng (snapped to a ~330 m grid) |
| `pulse_locations` | only if the Pulse is "everyone", or you're the host, or the host accepted you | **exact** lat/lng and place name |
| `memberships` | everyone (for seat counts) | who joined or requested |
| `feed_posts` | everyone; only the host and accepted people can post | updates, photos, check-ins |

Joining, accepting, declining and ending all go through database functions (`join_pulse`, `respond_request`, …). That means nobody can accept themselves, go over capacity, or read an exact spot they weren't given.

## Free-tier limits to know about

- **Supabase free**: 500 MB database, 1 GB photo storage, and 200 concurrent realtime connections. Projects pause after a week with no activity (one click to resume). The Pro plan ($25/mo) removes the pause.
- **OpenFreeMap** map tiles are free with no key. The simplified look lives in `src/lib/mapStyle.ts`, where you can change colours or which labels show. If you outgrow OpenFreeMap, set `VITE_MAP_STYLE` to another style URL; any style that isn't OpenMapTiles "positron" is used as-is, without the simplification.
- **Place search** in the drop form uses free OpenStreetMap search (Photon, with Nominatim as backup). It's good for parks, malls, schools and landmarks, but weaker than Google for small shops. The public servers are shared, so at real scale switch `src/lib/places.ts` to MapTiler Geocoding (generous free tier) or self-host Photon. Google Places can't be used here unless the map is also switched to Google Maps, because Google requires Places results shown on a map to be on a Google Map.
- **Area names** come from OpenStreetMap's free Nominatim service, called once per new Pulse. At real scale, switch to a paid geocoder (MapTiler, LocationIQ), because Nominatim asks for light use.

## Project map

```
supabase/schema.sql        tables, privacy rules, actions, storage, realtime
src/lib/api.ts             every read/write (Supabase, or the demo store)
src/lib/demo.ts            example data for demo mode
src/lib/pulse.ts           status, rough vs exact position, burying old Pulses
src/lib/captions.ts        auto-written posts (EN / TH)
src/lib/shareCard.ts       share cards + QR poster (canvas)
src/lib/mapStyle.ts        the simplified map look (light + dark)
src/auth.ts                guest sign-in, Google linking, profile
src/components/MapView.tsx MapLibre map, markers, rough-area circles
src/components/FeedTab.tsx the local feed
src/App.tsx                tabs, state, actions
```

## Ideas for next

- Push notifications ("a pickleball Pulse just started 400 m away") through web push or LINE Notify / the LINE Messaging API.
- Follow a spot or a host, so you hear when they post again.
- Host ratings after a Pulse ends.
- Weekly recap posts sent to a Facebook Page or LINE OA automatically, using a scheduled job that reads `pulses`.
