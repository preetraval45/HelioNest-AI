# HELIONEST-AI — Full Implementation Plan

> AI-Powered Property Climate Intelligence Platform
> Stack: Python (FastAPI) · TypeScript (Next.js) · PostgreSQL + PostGIS · LangChain · Redis

---

## Legend

- `[x]` = Completed
- `[ ]` = To do
- `[~]` = In progress

---

## Added Beyond Original Plan

The following were added as essential for a production-grade platform:

- User authentication & saved properties
- Redis caching layer (external API calls are expensive)
- Rate limiting & API gateway pattern
- Docker containerization for all services
- CI/CD pipeline (GitHub Actions)
- Notification/alert system (weather events at saved properties)
- **2D map view** (Mapbox satellite + street)
- **3D property view** (Three.js / React Three Fiber — building, shadows, animated sun arc)
- **360° panoramic view** (equirectangular sky dome showing sun/moon position in full sphere)
- PWA support (mobile-first)
- Analytics & monitoring (Sentry, PostHog)
- Security hardening (CORS, API key vault, input sanitization)
- Accessibility (WCAG 2.1 AA)
- Comprehensive testing strategy (unit, integration, E2E)
- External API strategy (which APIs, fallbacks, cost management)

---

## Project Folder Structure (Created)

```
helionest-ai/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   ✅ health.py, address.py
│   │   ├── core/               ✅ config.py, logging.py, database.py, cache.py
│   │   ├── engines/            (Phase 1-2)
│   │   ├── ai/agents/          (Phase 2)
│   │   ├── models/             (Phase 1)
│   │   ├── schemas/            (Phase 1)
│   │   ├── services/           (Phase 1)
│   │   └── utils/
│   ├── tests/
│   ├── alembic/                ✅ env.py, alembic.ini
│   ├── Dockerfile ✅ / Dockerfile.dev ✅
│   └── requirements.txt ✅
│
├── frontend/
│   ├── src/
│   │   ├── app/                ✅ layout.tsx, page.tsx, globals.css
│   │   ├── components/         (Phase 1-2)
│   │   ├── lib/api/            ✅ addressApi, solarApi, weatherApi, aiApi
│   │   ├── store/              ✅ usePropertyStore, useUIStore
│   │   └── types/              ✅ location, solar, weather, property, ai
│   ├── Dockerfile ✅ / Dockerfile.dev ✅
│   └── package.json ✅ (Next.js 15, React 19, Three.js, Mapbox, D3, Zustand)
│
├── ai/knowledge_base/ ✅ (Phase 2 — docs to be written)
├── infra/
│   ├── docker-compose.yml ✅
│   ├── docker-compose.dev.yml ✅
│   ├── nginx/nginx.conf ✅
│   └── .env.example ✅
│
├── .github/workflows/          ✅ backend-ci.yml, frontend-ci.yml, deploy.yml
├── .gitignore ✅
└── IMPLEMENTATION.md ✅
```

---

## External APIs & Services

| Service | Purpose | Notes |
|---|---|---|
| Geocodio / OpenCage | Address → lat/lon | Free tier: 2,500/day |
| Open-Meteo | Weather | Free, no key needed |
| NREL PVWatts | Solar irradiance | Free API key |
| pvlib / ephem / suncalc | Sun/moon math | Local Python libraries |
| Mapbox | 2D maps + 360° sky | Free tier available |
| Claude API (Anthropic) | AI agents | Pay per use |
| Redis Cloud | Caching | Free tier available |
| Sentry | Error monitoring | Free tier available |

---

---

# PHASE 0 — Project Setup & Infrastructure

---

## Task 0.1 — Repository & Version Control

- [x] **Subtask 0.1.1** — Initialize Git repo
  - [x] Create `.gitignore` for Python, Node, `.env` files
  - [x] Add `IMPLEMENTATION.md` to root

- [x] **Subtask 0.1.2** — GitHub repository setup
  - [x] GitHub repo `HelioNest-AI` created at github.com/preetraval45/HelioNest-AI
  - [ ] Protect `main` branch (require PR reviews) — do manually in GitHub Settings → Branches
  - [x] Add issue templates (bug, feature request) — `.github/ISSUE_TEMPLATE/`
  - [x] Add PR template with checklist — `.github/PULL_REQUEST_TEMPLATE.md`

- [x] **Subtask 0.1.3** — Environment variable management
  - [x] `infra/.env.example` created with all keys documented
  - [x] `.env` added to `.gitignore`

---

## Task 0.2 — Development Environment Setup ✅

- [x] **Subtask 0.2.1** — Python backend environment
  - [x] Python 3.13 confirmed available
  - [x] `backend/requirements.txt` — all dependencies pinned
  - [x] `backend/app/` full skeleton with `__init__.py` files
  - [x] `backend/app/core/config.py` — pydantic-settings, all env vars
  - [x] `backend/app/core/logging.py` — structured logging
  - [x] `backend/app/core/database.py` — async SQLAlchemy engine + session
  - [x] `backend/app/core/cache.py` — async Redis client, cache_get/set/delete
  - [x] `backend/app/main.py` — FastAPI app, CORS, global error handlers, lifespan
  - [x] `backend/app/api/v1/router.py` — router with all future routes commented
  - [x] `backend/app/api/v1/endpoints/health.py` — `/health` endpoint
  - [x] `backend/app/api/v1/endpoints/address.py` — `/geocode` placeholder
  - [x] `backend/pytest.ini`, `backend/ruff.toml`
  - [x] `backend/alembic.ini`, `backend/alembic/env.py`
  - [ ] **TODO (your machine):** `cd backend && python -m venv venv && venv/Scripts/activate && pip install -r requirements.txt`

- [x] **Subtask 0.2.2** — Node/TypeScript frontend environment
  - [x] Node.js 22 confirmed available
  - [x] `frontend/package.json` — Next.js 15, Three.js, Mapbox, D3, Zustand, Radix UI
  - [x] `frontend/tsconfig.json` — strict, path aliases (@/*, @components/*, etc.)
  - [x] `frontend/next.config.ts`
  - [x] `frontend/tailwind.config.ts` — brand palette (amber solar, sky blue, night indigo)
  - [x] `frontend/postcss.config.mjs`, `frontend/.eslintrc.json`, `frontend/vitest.config.ts`
  - [x] `frontend/src/app/layout.tsx` + `page.tsx` + `globals.css`
  - [x] TypeScript types: `location.ts`, `solar.ts`, `weather.ts`, `property.ts`, `ai.ts`
  - [x] Zustand stores: `usePropertyStore.ts` (location + analysis), `useUIStore.ts` (viewMode: 2d/3d/360)
  - [x] API clients: `apiClient.ts`, `addressApi.ts`, `solarApi.ts`, `weatherApi.ts`, `aiApi.ts`
  - [x] `src/lib/utils.ts` — cn(), formatTemp(), formatTime(), scoreToColor()
  - [ ] **TODO (your machine):** `cd frontend && npm install`

- [ ] **Subtask 0.2.3** — Database environment
  - [ ] Install PostgreSQL 15 locally OR create free Supabase project
  - [ ] Enable PostGIS extension: `CREATE EXTENSION IF NOT EXISTS postgis;`
  - [ ] Create dev database `helionest_dev`
  - [ ] Test: update `DATABASE_URL` in `.env` and run `alembic upgrade head`

- [ ] **Subtask 0.2.4** — Redis environment
  - [ ] Install Redis locally OR create free Redis Cloud account
  - [ ] Verify: `redis-cli ping` returns `PONG`
  - [ ] Update `REDIS_URL` in `.env`

---

## Task 0.3 — Docker Containerization ✅

- [x] **Subtask 0.3.1** — Backend Dockerfiles
  - [x] `backend/Dockerfile` — multi-stage, non-root user, production build
  - [x] `backend/Dockerfile.dev` — hot reload with `uvicorn --reload`

- [x] **Subtask 0.3.2** — Frontend Dockerfiles
  - [x] `frontend/Dockerfile` — 3-stage (deps → build → runner), non-root user
  - [x] `frontend/Dockerfile.dev` — hot reload with `npm run dev`

- [x] **Subtask 0.3.3** — Docker Compose (full stack)
  - [x] `infra/docker-compose.yml` — postgres (PostGIS), redis, backend, frontend, nginx
  - [x] Health checks for all services, shared network, named volumes

- [x] **Subtask 0.3.4** — Dev compose override
  - [x] `infra/docker-compose.dev.yml` — source mounts for hot reload on both services

- [x] **Subtask 0.3.5** — Nginx reverse proxy
  - [x] `infra/nginx/nginx.conf` — security headers, rate limiting, backend + frontend proxy

---

## Task 0.4 — CI/CD Pipeline ✅

- [x] **Subtask 0.4.1** — Backend CI
  - [x] `.github/workflows/backend-ci.yml`
  - [x] Triggers on all pushes + PRs to main
  - [x] Steps: Python 3.11 → install → ruff lint → import test → pytest
  - [x] Runs postgres + redis as GitHub Actions services

- [x] **Subtask 0.4.2** — Frontend CI
  - [x] `.github/workflows/frontend-ci.yml`
  - [x] Steps: Node 20 → npm ci → lint → type-check → build → test

- [x] **Subtask 0.4.3** — Deploy placeholder
  - [x] `.github/workflows/deploy.yml` — placeholder, `if: false` until Phase 3

---

---

# PHASE 1 — MVP Foundation

---

## Task 1.1 — Backend Core Setup

- [x] **Subtask 1.1.1** — Project structure ✅
- [x] **Subtask 1.1.2** — App factory + config ✅
- [x] **Subtask 1.1.3** — API router ✅
- [x] **Subtask 1.1.4** — Error handling
  - [x] Add 422 validation error handler in `main.py`
  - [x] Ensure 500 errors log full stack trace

---

## Task 1.2 — Database Setup (PostgreSQL + PostGIS)

- [x] **Subtask 1.2.1** — SQLAlchemy async engine + session factory ✅ (core/database.py)
- [x] **Subtask 1.2.2** — Create DB models in `backend/app/models/`
  - [x] `location.py` — id, address, lat, lon, city, state, zip, geom (PostGIS Point), relationships
  - [x] `property_analysis.py` — FK to location, facade heat scores (N/S/E/W), solar/comfort/heat risk scores
  - [x] `weather_snapshot.py` — FK to location, temp, humidity, uv, heat_index, comfort_score
  - [x] `solar_snapshot.py` — FK to location, date, sunrise, sunset, solar_noon, irradiance
  - [x] `user.py` — email, hashed_password, is_active
  - [x] `saved_property.py` — FK user + location, nickname
  - [x] `models/__init__.py` — imports all models so Alembic detects them
  - [x] All Pydantic schemas created: `location.py`, `weather.py`, `solar.py`, `property.py`, `ai.py`, `user.py`
- [x] **Subtask 1.2.3** — First Alembic migration *(run on your machine after DB is set up)*
  - [x] `cd backend && alembic revision --autogenerate -m "initial tables"`
  - [x] `alembic upgrade head`
  - [x] Verify tables + PostGIS geometry column exist in DB

---

## Task 1.3 — Frontend Core Setup

- [x] **Subtask 1.3.1** — App router + global structure ✅
- [x] **Subtask 1.3.2** — Zustand stores ✅
- [x] **Subtask 1.3.3** — API client layer ✅
- [x] **Subtask 1.3.4** — TypeScript types ✅
- [x] **Subtask 1.3.5** — Create pages
  - [x] `src/app/property/[address]/page.tsx` — full analysis page with tab layout
  - [x] `src/app/dashboard/page.tsx` — saved properties
  - [x] `src/app/chat/page.tsx` — AI chat
  - [x] `src/app/login/page.tsx`
  - [x] `src/app/register/page.tsx`

---

## Task 1.4 — Geocoding & Address Lookup

- [x] **Subtask 1.4.1** — `backend/app/services/geocoding.py`
  - [x] Integrate Geocodio API (fallback: Nominatim/OSM — free, no key)
  - [x] `geocode_address(address) → { lat, lon, formatted_address, city, state, zip }`
  - [x] Cache in Redis (TTL: 7 days) using `make_cache_key("geocode", address_slug)`
- [x] **Subtask 1.4.2** — Implement `POST /api/v1/address/geocode` endpoint
  - [x] US-only validation, store in `Location` DB table, dedup on `formatted_address`
- [x] **Subtask 1.4.3** — `components/AddressSearch.tsx`
  - [x] Input with size variants (sm/md/lg), error state, router navigation
  - [x] On submit → redirect to `/property/[address]`

---

## Task 1.5 — Solar Data Engine

- [x] **Subtask 1.5.1** — `backend/app/engines/solar_engine.py`
  - [x] `get_sun_position(lat, lon, datetime) → { azimuth, elevation, is_daytime }`
  - [x] `get_daily_sun_path(lat, lon, date) → list[{ time, azimuth, elevation }]`
  - [x] `get_sunrise_sunset(lat, lon, date) → { sunrise, solar_noon, sunset, day_length_hours }`
  - [x] `get_seasonal_summary(lat, lon) → { monthly[], solstices }`
- [x] **Subtask 1.5.2** — `backend/app/services/nrel_service.py`
  - [x] Fetch monthly irradiance + peak sun hours from NREL PVWatts (fallback: pvlib clear-sky)
  - [x] Cache per location (TTL: 30 days)
- [x] **Subtask 1.5.3** — Solar endpoints
  - [x] `GET /api/v1/solar/position?lat=&lon=&dt=`
  - [x] `GET /api/v1/solar/daily?lat=&lon=&date=`
  - [x] `GET /api/v1/solar/monthly?lat=&lon=&month=`
  - [x] `GET /api/v1/solar/seasonal?lat=&lon=`

---

## Task 1.6 — Weather Data Engine ✅

- [x] **Subtask 1.6.1** — `backend/app/services/weather_service.py`
  - [x] Open-Meteo API — current, 7-day, hourly, monthly normals
  - [x] Heat index (Rothfusz), wind chill (Environment Canada), comfort score (0-100)
  - [x] Redis cache (current: 5min, forecast: 30min, monthly: 7 days)
- [x] **Subtask 1.6.2** — `backend/app/engines/weather_engine.py`
  - [x] `enrich_weather()` — risk flags (Heat Danger, Wind Chill, UV, Wind Advisory, Heavy Precip)
  - [x] `score_monthly_comfort()` — 12-month comfort scores
- [x] **Subtask 1.6.3** — Weather endpoints registered in router
  - [x] `GET /api/v1/weather/current?lat=&lon=`
  - [x] `GET /api/v1/weather/forecast?lat=&lon=&days=7`
  - [x] `GET /api/v1/weather/monthly-averages?lat=&lon=`

---

## Task 1.7 — Basic AI (Claude) ✅

- [x] **Subtask 1.7.1** — `backend/app/ai/client.py`
  - [x] `anthropic.AsyncAnthropic` singleton, `call_claude()` with retry/backoff (3 retries, exp delay)
  - [x] Default model: `claude-sonnet-4-6`
- [x] **Subtask 1.7.2** — `backend/app/ai/summary_agent.py` + `backend/ai/prompts/summary_prompt.txt`
  - [x] `generate_property_summary(data)` — builds structured user prompt from solar/weather/location data
- [x] **Subtask 1.7.3** — `POST /api/v1/ai/summary` endpoint (Redis cached 6h)
  - [x] Returns 503 gracefully when `ANTHROPIC_API_KEY` not configured

---

## Task 1.8 — Core UI Components ✅

- [x] **Subtask 1.8.1** — Home page hero + address search (`frontend/src/app/page.tsx`)
- [x] **Subtask 1.8.2** — Property page with 9-tab layout (`/property/[address]/page.tsx`)
  - [x] Tabs: Overview | Solar | Weather | Moon | Impact | AI | 2D | 3D | 360°
  - [x] Skeleton loader, error state, inline re-search
- [x] **Subtask 1.8.3** — `components/skeletons/PropertySkeleton.tsx` — animate-pulse skeleton
- [x] **Subtask 1.8.4** — `components/maps/PropertyMap2D.tsx` — Mapbox GL JS, satellite/street toggle
- [x] **Subtask 1.8.5** — `components/charts/SunPathChart.tsx` — SVG sun-path elevation chart
- [x] Additional pages: `/dashboard`, `/chat`, `/login`, `/register`
- [x] `components/AddressSearch.tsx` — reusable search with size variants (sm/md/lg)

---

## Task 1.9 — Phase 1 Testing ✅

- [x] **Subtask 1.9.1** — Backend unit tests
  - [x] `backend/tests/test_solar_engine.py` — 10 tests (sun position, daily path, sunrise/sunset)
  - [x] `backend/tests/test_geocoding.py` — async mock tests (cache hit, provider fallback, errors)
  - [x] `backend/tests/test_weather_engine.py` — heat index, wind chill, comfort score, enrich_weather, monthly scoring
- [x] **Subtask 1.9.2** — Backend integration tests
  - [x] `backend/tests/test_api_health.py` — health endpoint, 404/422 error shapes
  - [x] `backend/tests/test_address_endpoint.py` — geocode endpoint validation, mocked geocoding
- [x] **Subtask 1.9.3** — Infrastructure (Kubernetes + Docker hybrid)
  - [x] `infra/k8s/` — full Kustomize base with namespace, ConfigMap, Secret, Postgres StatefulSet, Redis Deployment, Backend/Frontend Deployments, HPA, NGINX Ingress
  - [x] `infra/k8s/overlays/staging` + `overlays/production` — per-environment Kustomize overlays
  - [x] `.github/workflows/deploy.yml` — CI/CD: GHCR Docker build → Kustomize → kubectl rollout

---

---

# PHASE 2 — Smart Insights

---

## Task 2.1 — Moon Intelligence Module

- [ ] **Subtask 2.1.1** — `backend/app/engines/moon_engine.py` (ephem)
  - [ ] `get_moon_phase(date)`, `get_moonrise_moonset(lat, lon, date)`, `get_moon_position(lat, lon, dt)`
- [ ] **Subtask 2.1.2** — Night visibility score (0-100)
- [ ] **Subtask 2.1.3** — `GET /api/v1/moon/daily` + `components/MoonPhaseCard.tsx`

---

## Task 2.2 — Property Heat Impact Engine

- [ ] **Subtask 2.2.1** — `backend/app/engines/impact_engine.py`
  - [ ] Facade heat gain scores (N/S/E/W) per month
- [ ] **Subtask 2.2.2** — Car heat risk model
  - [ ] `estimate_car_interior_temp(outdoor_temp, irradiance, hours_parked)`
  - [ ] Classify: Safe / Warm / Hot / Dangerous / Deadly (>57°C)
- [ ] **Subtask 2.2.3** — Outdoor comfort score + monthly calendar
- [ ] **Subtask 2.2.4** — Impact endpoints: `/impact/heat`, `/impact/comfort`, `/impact/annual-summary`

---

## Task 2.3 — RAG Knowledge Base

- [ ] **Subtask 2.3.1** — Write 8 domain docs in `ai/knowledge_base/`
  - [ ] `solar_basics.md`, `heat_impact.md`, `car_heat_risks.md`, `weather_patterns.md`
  - [ ] `moon_and_night.md`, `energy_efficiency.md`, `mold_humidity.md`, `uv_health.md`
- [ ] **Subtask 2.3.2** — ChromaDB vector store + `ai/embeddings/ingest.py` ingestion script
- [ ] **Subtask 2.3.3** — `backend/app/ai/retriever.py` — semantic search over knowledge base

---

## Task 2.4 — Multi-Agent AI System

- [ ] **Subtask 2.4.1** — `backend/app/ai/orchestrator.py` — route queries to specialist agents
- [ ] **Subtask 2.4.2** — `ai/agents/solar_agent.py` — sunlight, UV, seasonal exposure
- [ ] **Subtask 2.4.3** — `ai/agents/weather_agent.py` — climate, comfort, storms
- [ ] **Subtask 2.4.4** — `ai/agents/impact_agent.py` — heat risks, car, energy
- [ ] **Subtask 2.4.5** — `ai/agents/prediction_agent.py` — future climate risks
- [ ] **Subtask 2.4.6** — `POST /api/v1/ai/chat` with SSE streaming + conversation history

---

## Task 2.5 — AI Chat UI

- [ ] **Subtask 2.5.1** — `components/AIChat.tsx` — streaming text, markdown rendering
- [ ] **Subtask 2.5.2** — Suggested question chips (dynamic, property-aware)
- [ ] **Subtask 2.5.3** — `/chat` page — full-page chat with property sidebar

---

## Task 2.6 — 2D / 3D / 360° View System

### 2D Map Views

- [ ] **Subtask 2.6.1** — `components/maps/PropertyMap2D.tsx` (enhanced)
  - [ ] Sun compass overlay showing real-time sun direction
  - [ ] Shadow direction indicator
  - [ ] Property cardinal orientation legend (N/S/E/W facade labels)
  - [ ] Satellite ↔ street view toggle

### Interactive 2D Charts

- [ ] **Subtask 2.6.2** — `components/charts/SunArcVisualization.tsx` (D3.js)
  - [ ] Animated sun position dot on elevation arc
  - [ ] Toggle: today / summer solstice / winter solstice
- [ ] **Subtask 2.6.3** — `components/charts/MonthlyHeatmap.tsx`
  - [ ] 12-month grid, color-coded by chosen metric (UV, comfort, heat, irradiance)
- [ ] **Subtask 2.6.4** — `components/charts/HourlyTimeline.tsx`
  - [ ] 24h stacked chart: temp + UV index + sun elevation
  - [ ] Highlight dangerous hours in red

### 3D Property View (Three.js + React Three Fiber)
- [ ] **Subtask 2.6.5** — `components/views/PropertyView3D.tsx` — scene setup
  - [ ] `@react-three/fiber` canvas + `@react-three/drei` helpers
  - [ ] Time-accurate sky using `<Sky>` component (azimuth + elevation driven)
  - [ ] Ground plane with texture
- [ ] **Subtask 2.6.6** — 3D property building model
  - [ ] Box-geometry house (configurable width, depth, height, roof pitch)
  - [ ] Color facades by heat gain score (green = low, red = high heat)
  - [ ] Roof with slight pitch using extruded geometry
- [ ] **Subtask 2.6.7** — 3D sun & animated shadow simulation
  - [ ] `<directionalLight>` position driven by real sun azimuth + elevation from solar engine
  - [ ] `castShadow` + `receiveShadow` on all meshes
  - [ ] Time-of-day slider (0h–24h) animates full shadow sweep
  - [ ] Date slider for seasonal shadow comparison (summer vs winter vs today)
- [ ] **Subtask 2.6.8** — 3D neighborhood context
  - [ ] Fetch nearby building footprints from OpenStreetMap Overpass API
  - [ ] Render as box-geometry blocks around the property
  - [ ] Show neighbor shadows falling on the property
- [ ] **Subtask 2.6.9** — 3D animated sun arc path
  - [ ] Glowing curve geometry tracing sun trajectory through the sky
  - [ ] Animated sphere (sun) moving along arc in real time or with slider
  - [ ] Toggle: today / summer solstice / winter solstice arcs
- [ ] **Subtask 2.6.10** — 3D camera controls
  - [ ] `<OrbitControls>` — mouse drag rotate, scroll zoom, pan
  - [ ] Preset camera buttons: Street View, Top-Down, SE Isometric, North Face

### 360° Panoramic Sky View

- [ ] **Subtask 2.6.11** — `components/views/PropertyView360.tsx` — sky dome
  - [ ] Three.js `SphereGeometry` inverted (inside-out) as full 360° sky dome
  - [ ] Sky gradient shader: dawn orange-pink, noon blue, dusk orange-purple, night dark blue
  - [ ] Driven by current hour + weather conditions
- [ ] **Subtask 2.6.12** — Sun & moon placement in 360°
  - [ ] Sun sphere at correct azimuth + elevation (from solar engine)
  - [ ] Moon sphere placed at correct position during night hours
  - [ ] Star field rendered on night sky (instanced points geometry)
  - [ ] Cloud layer (optional — sprite-based)
- [ ] **Subtask 2.6.13** — 360° interactive look-around controls
  - [ ] Mouse drag to look in any direction (full 360° horizontal + vertical)
  - [ ] Touch drag on mobile (like Google Street View feel)
  - [ ] Gyroscope support on mobile (device orientation API)
  - [ ] Time-of-day slider — watch sun/moon arc through full sky
  - [ ] Date slider — see seasonal sun path changes
- [ ] **Subtask 2.6.14** — 360° real photo background (Phase 3+)
  - [ ] Load Mapbox Static API equirectangular image for the address
  - [ ] Project it onto the sky dome as real-world background
  - [ ] Overlay computed sun/moon position on the real photo
- [ ] **Subtask 2.6.15** — View mode switcher component
  - [ ] `components/ViewModeSwitcher.tsx` — 2D | 3D | 360° toggle buttons
  - [ ] Keyboard shortcuts: `2` = 2D map, `3` = 3D model, `0` = 360° sky
  - [ ] Smooth animated transition between modes (framer-motion)
  - [ ] Persisted in `useUIStore.viewMode`

---

## Task 2.7 — User Auth & Saved Properties

- [ ] **Subtask 2.7.1** — Backend JWT auth
  - [ ] `python-jose` + `passlib[bcrypt]` — JWT generation + validation
  - [ ] `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`
- [ ] **Subtask 2.7.2** — NextAuth.js credentials provider (email/password)
  - [ ] Login page `/login`, register page `/register`
- [ ] **Subtask 2.7.3** — Saved properties
  - [ ] "Save Property" button (requires login)
  - [ ] `/dashboard` — saved property cards with key stats

---

## Task 2.8 — Rate Limiting & API Protection

- [ ] **Subtask 2.8.1** — `slowapi` rate limiting
  - [ ] 20/min for `/ai/chat`, 60/min for `/geocode`, 100/min default
- [ ] **Subtask 2.8.2** — External API cost protection
  - [ ] Daily call counter in Redis + circuit breaker on 3 consecutive failures

---

## Task 2.9 — Alert System

- [ ] **Subtask 2.9.1** — Alert thresholds: extreme heat, freeze, high UV, storm
- [ ] **Subtask 2.9.2** — `components/AlertBanner.tsx` — yellow/orange/red severity

---

## Task 2.10 — Phase 2 Testing

- [ ] **Subtask 2.10.1** — Impact engine: car temp model, facade scores
- [ ] **Subtask 2.10.2** — AI agents: mocked Claude API, orchestrator routing, RAG retrieval
- [ ] **Subtask 2.10.3** — Auth: register/login/protected routes
- [ ] **Subtask 2.10.4** — 3D: Three.js canvas mounts without error
- [ ] **Subtask 2.10.5** — 360°: sky dome renders with sun at correct azimuth

---

---

# PHASE 3 — Advanced Platform

---

## Task 3.1 — Advanced Shadow Simulation

- [ ] **Subtask 3.1.1** — Shadow polygon on 2D map (driven by sun position)
- [ ] **Subtask 3.1.2** — Neighbor building shadows from OpenStreetMap
- [ ] **Subtask 3.1.3** — Animated shadow sweep in 3D with date/time sliders

---

## Task 3.2 — Energy Efficiency Insights

- [ ] **Subtask 3.2.1** — Solar panel potential: NREL irradiance + roof area → annual kWh
- [ ] **Subtask 3.2.2** — Cooling cost delta: shaded vs full-sun property
- [ ] **Subtask 3.2.3** — `components/SolarROICalculator.tsx` — payback period + 10-year savings chart

---

## Task 3.3 — Climate Risk Forecasting

- [ ] **Subtask 3.3.1** — 10-year historical trends (Open-Meteo historical API)
- [ ] **Subtask 3.3.2** — AI future risk narrative (prediction agent)
- [ ] **Subtask 3.3.3** — `components/ClimateRiskReport.tsx` — trend chart + risk badges per category

---

## Task 3.4 — Mold & Air Quality Risk

- [ ] **Subtask 3.4.1** — Mold risk index (humidity + temp thresholds)
- [ ] **Subtask 3.4.2** — Air quality: OpenAQ API integration + AQI display

---

## Task 3.5 — Progressive Web App (PWA)

- [ ] **Subtask 3.5.1** — `next-pwa` config, service worker, offline caching
- [ ] **Subtask 3.5.2** — Mobile responsive audit (375px – 430px viewports)
- [ ] **Subtask 3.5.3** — "Add to Home Screen" install prompt after 2 property views
- [ ] **Subtask 3.5.4** — Gyroscope in 360° view on mobile (device orientation API)

---

## Task 3.6 — Analytics & Monitoring

- [ ] **Subtask 3.6.1** — Sentry: backend (FastAPI) + frontend (Next.js), source maps
- [ ] **Subtask 3.6.2** — PostHog: address_searched, property_viewed, ai_question_asked, view_mode_switched
- [ ] **Subtask 3.6.3** — Cache hit rate monitoring, endpoint response time logging

---

## Task 3.7 — Security Hardening

- [ ] **Subtask 3.7.1** — Input sanitization, request size limits, production CORS
- [ ] **Subtask 3.7.2** — Production secret management (platform env vars, rotate every 90 days)
- [ ] **Subtask 3.7.3** — HTTPS redirect + full security headers in Nginx (HSTS, CSP, X-Frame)

---

## Task 3.8 — Accessibility (WCAG 2.1 AA)

- [ ] **Subtask 3.8.1** — Keyboard navigation for all interactive elements (Tab, Enter, Escape)
- [ ] **Subtask 3.8.2** — ARIA labels on icon buttons, live regions for AI chat updates
- [ ] **Subtask 3.8.3** — Color contrast audit: all text ≥ 4.5:1 ratio
- [ ] **Subtask 3.8.4** — Text/table alternatives for 3D model and 360° sky data

---

## Task 3.9 — Performance Optimization

- [ ] **Subtask 3.9.1** — Frontend: dynamic import for 3D/360° components, Lighthouse > 90
- [ ] **Subtask 3.9.2** — Backend: parallel async fetch (solar + weather + moon simultaneously)
- [ ] **Subtask 3.9.3** — Cache hit rate > 70%; stampede protection with mutex

---

## Task 3.10 — Production Deployment

- [ ] **Subtask 3.10.1** — Choose platform (Railway recommended for Docker + PG + Redis)
- [ ] **Subtask 3.10.2** — Production environment: DB, Redis, domain, SSL
- [ ] **Subtask 3.10.3** — Enable deploy workflow, configure rolling update, add smoke test
- [ ] **Subtask 3.10.4** — Automated daily PostgreSQL backups + restore test

---

## Task 3.11 — E2E Testing (Playwright)

- [ ] **Subtask 3.11.1** — Address search → full property analysis flow
- [ ] **Subtask 3.11.2** — 2D → 3D → 360° view mode switching
- [ ] **Subtask 3.11.3** — Register → save property → dashboard
- [ ] **Subtask 3.11.4** — AI chat responds on mobile viewport (375px)

---

---

## Summary: Build Order

```
Phase 0 ✅ → Phase 1 → Phase 2 → Phase 3
               │          │
            MVP Core   Smart Insights
                       + 2D/3D/360° Views
```

### Sprint Roadmap

| Sprint | Focus | Status |
| --- | --- | --- |
| Sprint 0 | Phase 0: Setup + Docker + CI/CD | ✅ Done |
| Sprint 1 | Phase 1: Backend core + DB models + Solar engine | [ ] |
| Sprint 2 | Phase 1: Weather engine + Basic AI + All APIs wired | [ ] |
| Sprint 3 | Phase 1: Frontend home page + 2D map + Charts | [ ] |
| Sprint 4 | Phase 2: Moon + Heat impact engine | [ ] |
| Sprint 5 | Phase 2: RAG knowledge base + Multi-agent AI | [ ] |
| Sprint 6 | Phase 2: AI Chat UI + Auth + Saved properties | [ ] |
| Sprint 7 | Phase 2: 3D view (Three.js building + sun + shadows) | [ ] |
| Sprint 8 | Phase 2: 360° sky panorama + view mode switcher | [ ] |
| Sprint 9 | Phase 3: Shadow sim + Energy tools + Climate risk | [ ] |
| Sprint 10 | Phase 3: PWA + Security + Perf + Accessibility + Deploy | [ ] |

---

*Total tasks: 45+ | Total subtasks: 120+ | Total sub-subtasks: 350+*
*Phase 0 completed: 2026-03-02*
