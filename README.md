# DARK//DROP — Online 3D Combat Arena

An **original** third-person browser shooter prototype with online multiplayer over WebSockets, AI opponents, procedural 3D environments, and touch controls for Android and mouse/keyboard controls for PC.

> This is a functioning multiplayer **prototype**, not a finished AAA production or a Free Fire clone. It has stylized WebGL graphics, not photorealistic assets. Player accounts, matchmaking, anti-cheat, cloud progression, and persistent stats are not yet provided.

## What's playable

- Real humans can connect to the same server + room code from separate devices and see/shoot each other in real time.
- The server controls movement, collision, damage, eliminations, respawning, ammo, reloads, and medkits.
- Public rooms automatically include AI opponents while there are fewer than four humans. AI Training creates a private room with five bots.
- **VORTEX AR** (30 rounds), **PHANTOM SMG** (40 rounds), and **RAIL DMR** (12 rounds) with different damage, recoil spread, fire rates, and reload speeds.
- 3D neon-industrial map with dynamic sun, shadows, buildings, crates, illuminated details, sky haze, visual hit effects, third-person avatars and HUD.
- PC: WASD move, mouse move to aim, left-click fire, right-click aim down sights, Shift sprint, Space jump, R reload, 1/2/3 weapons, Tab scoreboard.
- Android: virtual left joystick, swipe right side to aim, FIRE, ADS, RUN, JUMP, RELOAD, weapons and scoreboard buttons.
- Generated audio effects and mute switch; high/performance graphics preset.

## Run on a Windows PC (local testing)

1. Install [Node.js 20+](https://nodejs.org).
2. Extract the ZIP and open Command Prompt **inside the extracted `darkdrop-online` folder**.
3. Run:

   ```sh
   npm install
   npm start
   ```

4. Open **http://localhost:3000** on the PC. Open two browser tabs and join the same room (e.g. `PUBLIC`) to test online state.
5. To test your Android phone on the same Wi-Fi, browse to `http://YOUR_PC_LAN_IP:3000`. If needed, allow Node.js through Windows Firewall on your private network.

## Publish so people can play over the internet (recommended: one Render Web Service)

1. Create **a new GitHub repository** and upload the files **at the repo root** (`server.js`, `package.json`, `site/`, `render.yaml`). Do **not** upload `node_modules`.
2. Go to [Render](https://dashboard.render.com/), select **New → Web Service**, connect your GitHub repo.
3. Set **Language: Node**, **Build Command: `npm install`**, **Start Command: `npm start`**. You may use `render.yaml` as a Blueprint instead.
4. After deployment, open your `https://YOUR-GAME.onrender.com` link on both devices. Both players enter the same room code and click **DEPLOY ONLINE**.

This one hosted service runs the **website and multiplayer server together**, so you do not need Netlify for the first release. Render offers a free option for tests with free-tier limitations and sleep after inactivity; it is not intended for production-scale matches. Upgrading to paid hosting or a dedicated game backend is appropriate for serious public matches.

## If you want to use Netlify for the frontend

Netlify's ordinary static hosting cannot run this persistent WebSocket game loop. Deploy the Node server to Render first, then publish only the `site/` folder to Netlify. Open your Netlify game, click **SERVER SETTINGS**, and enter the HTTPS URL of your Render Web Service. **Important:** if setting `ALLOWED_ORIGINS` on your server, include your Netlify website origin; for a demo, leave it unset. Without a deployed WebSocket backend, the game cannot offer multiplayer.

To integrate it into your **After Dark Arcade** site, host the full game on Render and add a link in the arcade to the deployed shooter. This avoids breaking the arcade's existing authentication, games, or Supabase setup.

## Production limitations and safety

- No database or permanent player accounts; scores reset when the server restarts.
- No team mode, shrinking zone, vehicle driving, inventory, voice chat, ranked play, or 50-player battle royale yet.
- Authoritative server validates core gameplay, but there is **no full anti-cheat, account moderation, rate limiting, or advanced network prediction**. Add these before monetization or hosting large public lobbies.
- Up to 16 human players per room; there is no cross-server matchmaking. Multiple server instances must use a shared state/pubsub architecture for scaling.
- Server may be configured with `ALLOWED_ORIGINS=https://your-front-end.example` if you publish a browser frontend separately. Note that WebSocket Origin checks alone do not authenticate players.
- Three.js is delivered via an external CDN and Google Fonts is optional. Clients need an internet connection to load the WebGL library at first run. You can bundle it locally for fully self-contained hosting.
- 3D performance varies by device; start with **PERFORMANCE** graphics on mid-range Android phones.

## Source files

- `site/index.html`: app structure, responsive HUD and menu
- `site/style.css`: visuals and mobile layout
- `site/game.js`: Three.js scene, networking, 3D players, controls, audiovisual effects
- `site/world.js`: collision/shared map and weapon data
- `server.js`: Node HTTP server + authoritative WebSocket game simulation
- `render.yaml`: optional one-click Render service setup

© 2026 DARK//DROP original multiplayer arena prototype. No third-party game branding or intellectual property is copied.
