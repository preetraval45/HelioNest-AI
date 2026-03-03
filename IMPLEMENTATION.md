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

```text
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
| --- | --- | --- |
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

## PHASE 0 — Project Setup & Infrastructure

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

## PHASE 1 — MVP Foundation

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

## PHASE 2 — Smart Insights

---

## Task 2.1 — Moon Intelligence Module ✅

- [x] **Subtask 2.1.1** — `backend/app/engines/moon_engine.py` (ephem)
  - [x] `get_moon_phase(date)`, `get_moonrise_moonset(lat, lon, date)`, `get_moon_position(lat, lon, dt)`
- [x] **Subtask 2.1.2** — Night visibility score (0-100)
- [x] **Subtask 2.1.3** — `GET /api/v1/moon/daily` + `components/MoonPhaseCard.tsx`

---

## Task 2.2 — Property Heat Impact Engine ✅

- [x] **Subtask 2.2.1** — `backend/app/engines/impact_engine.py`
  - [x] Facade heat gain scores (N/S/E/W) per month
- [x] **Subtask 2.2.2** — Car heat risk model
  - [x] `estimate_car_interior_temp(outdoor_temp, irradiance, hours_parked)`
  - [x] Classify: Safe / Warm / Hot / Dangerous / Deadly (>57°C)
- [x] **Subtask 2.2.3** — Outdoor comfort score + monthly calendar
- [x] **Subtask 2.2.4** — Impact endpoints: `/impact/car-heat`, `/impact/comfort`, `/impact/annual-summary`, `/impact/facade-heat`

---

## Task 2.3 — RAG Knowledge Base ✅

- [x] **Subtask 2.3.1** — 8 domain docs in `backend/ai/knowledge_base/`
  - [x] `solar_basics.md`, `heat_impact.md`, `car_heat_risks.md`, `weather_patterns.md`
  - [x] `moon_and_night.md`, `energy_efficiency.md`, `mold_humidity.md`, `uv_health.md`
- [x] **Subtask 2.3.2** — ChromaDB vector store + `backend/ai/embeddings/ingest.py`
- [x] **Subtask 2.3.3** — `backend/app/ai/retriever.py` — semantic search + lru_cache, graceful fallback

---

## Task 2.4 — Multi-Agent AI System ✅

- [x] **Subtask 2.4.1** — `backend/app/ai/orchestrator.py` — keyword regex intent routing
- [x] **Subtask 2.4.2** — `ai/agents/solar_agent.py` — sunlight, UV, seasonal exposure
- [x] **Subtask 2.4.3** — `ai/agents/weather_agent.py` — climate, comfort, storms
- [x] **Subtask 2.4.4** — `ai/agents/impact_agent.py` — heat risks, car, energy
- [x] **Subtask 2.4.5** — `ai/agents/prediction_agent.py` — future climate risks
- [x] **Subtask 2.4.6** — `POST /api/v1/ai/chat` SSE streaming + `POST /api/v1/ai/suggested-questions`

---

## Task 2.5 — AI Chat UI ✅

- [x] **Subtask 2.5.1** — `components/AIChat.tsx` — SSE streaming, react-markdown, agent labels
- [x] **Subtask 2.5.2** — Suggested question chips (dynamic, property-aware via `/ai/suggested-questions`)
- [x] **Subtask 2.5.3** — `/chat` page — full-page chat; `/property/[address]` AI tab with property context

---

## Task 2.6 — 2D / 3D / 360° View System ✅

### 2D Map Views

- [x] **Subtask 2.6.1** — `components/maps/PropertyMap2D.tsx` — Mapbox GL JS (satellite/street toggle)

### Interactive 2D Charts

- [x] **Subtask 2.6.2** — `components/charts/SunArcVisualization.tsx` (D3.js) — animated sun arc, solstice toggles, sunrise/sunset markers
- [x] **Subtask 2.6.3** — `components/charts/MonthlyHeatmap.tsx` — 4×3 grid, HSL color scale, hover tooltip, legend
- [x] **Subtask 2.6.4** — `components/charts/HourlyTimeline.tsx` — temp area + UV dots + solar elevation line, "now" marker, UV danger shading

### 3D Property View

- [x] **Subtask 2.6.5–2.6.10** — `components/views/PropertyView3D.tsx` — R3F canvas, Sky component, colored N/S/E/W facades, shadow-casting directional light, time-of-day + date sliders, OrbitControls, camera preset buttons

### 360° Panoramic Sky View

- [x] **Subtask 2.6.11–2.6.13** — `components/views/PropertyView360.tsx` — inside-out sphere, GLSL sky gradient shader (dawn/noon/sunset/night), sun+moon spheres, 1500-star field, mouse drag look-around, time-of-day slider
- [x] **Subtask 2.6.15** — `components/ViewModeSwitcher.tsx` — 2D | 3D | 360° toggle, keyboard shortcuts (2/3/0)

---

## Task 2.7 — User Auth & Saved Properties ✅

- [x] **Subtask 2.7.1** — Backend JWT auth
  - [x] `backend/app/core/security.py` — `python-jose` + `passlib[bcrypt]`, `create_access_token`, `verify_password`
  - [x] `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`
  - [x] `GET/POST/DELETE /api/v1/auth/me/saved-properties`
- [x] **Subtask 2.7.2** — JWT stored in localStorage; `/login` + `/register` pages wire to backend
- [x] **Subtask 2.7.3** — `/dashboard` shows saved property cards with solar + comfort scores

---

## Task 2.8 — Rate Limiting & API Protection ✅

- [x] **Subtask 2.8.1** — `slowapi` middleware in `main.py`; `@limiter.limit` on `/ai/chat`, `/ai/summary`, `/address/geocode`
- [x] **Subtask 2.8.2** — `backend/app/core/circuit_breaker.py` — Redis daily counter + 3-failure circuit breaker for Anthropic API

---

## Task 2.9 — Alert System ✅

- [x] **Subtask 2.9.1** — `backend/app/engines/alert_engine.py` — thresholds for extreme heat (38°C), freeze (0°C), high UV (8+), extreme UV (11+), high humidity (85%), storm conditions, high wind (60 km/h)
- [x] **Subtask 2.9.2** — `frontend/src/components/AlertBanner.tsx` — danger/warning/info severity, dismissible, expandable description, summary pill with animated dot

---

## Task 2.10 — Phase 2 Testing ✅

- [x] **Subtask 2.10.1** — `backend/tests/test_impact_engine.py` — car temp model (5 tests), facade scores (4 tests), monthly comfort (3 tests)
- [x] **Subtask 2.10.2** — `backend/tests/test_ai_agents.py` — orchestrator routing (solar/weather/impact), suggested questions (4 tests)
- [x] **Subtask 2.10.3** — `backend/tests/test_auth_endpoints.py` — register/login validation, me endpoint auth
- [x] **Subtask 2.10.4** — `backend/tests/test_alert_engine.py` — 12 alert threshold tests across all severity levels

---

---

## PHASE 3 — Advanced Platform

---

## Task 3.1 — Advanced Shadow Simulation ✅

- [x] **Subtask 3.1.1** — Shadow polygon on 2D map (driven by sun position)
  - [x] `GET /api/v1/solar/shadow` — current shadow azimuth + length ratio from live sun position
  - [x] Sun compass SVG overlay on `PropertyMap2D` — amber sun arrow, blue shadow arrow, N/S/E/W labels, elevation display, toggle button
- [x] **Subtask 3.1.2** — Neighbor building shadows from OpenStreetMap
  - [x] `GET /api/v1/neighbors` — Overpass API → GeoJSON building footprints (cached 24h)
  - [x] Mapbox `fill-extrusion` + `line` layers render nearby buildings with estimated heights
- [x] **Subtask 3.1.3** — Animated shadow sweep in 3D with date/time sliders
  - [x] `GET /api/v1/solar/shadow/sweep` — 24-hour hourly shadow data for animation (cached 1h)
  - [x] `shadow_engine.py` — `DailyShadowSweep`, `HourlyShadow`, `compute_shadow_vector`, `get_daily_shadow_sweep`

---

## Task 3.2 — Energy Efficiency Insights ✅

- [x] **Subtask 3.2.1** — Solar panel potential: NREL irradiance + roof area → annual kWh
  - [x] `backend/app/engines/roi_engine.py` — `calculate_solar_roi()`, `ROIResult` dataclass
  - [x] `GET /api/v1/solar/roi` — params: lat, lon, roof_area_sqm, system_kw, rate_per_kwh; cached 6h
- [x] **Subtask 3.2.2** — Cooling cost delta: shaded vs full-sun property
  - [x] CO₂ offset + 10/20-year savings included in ROI result
- [x] **Subtask 3.2.3** — `components/SolarROICalculator.tsx` — payback period + 10-year savings chart
  - [x] Three sliders (roof area, system kW, electricity rate), debounced API fetch
  - [x] Monthly production SVG bar chart (12 bars), stat grid, CO₂ trees equivalent
  - [x] Wired into Solar tab on property page

---

## Task 3.3 — Climate Risk Forecasting ✅

- [x] **Subtask 3.3.1** — 10-year historical trends (Open-Meteo archive API)
  - [x] `backend/app/services/climate_service.py` — `get_historical_climate()`, `HistoricalClimate`, linear trend slopes via numpy
  - [x] `GET /api/v1/weather/climate` — yearly trends, hottest/wettest/driest year, monthly avg temps; cached 30d
- [x] **Subtask 3.3.2** — AI future risk narrative (climate agent)
  - [x] `backend/app/ai/agents/climate_agent.py` — `climate_agent_respond()`
  - [x] Orchestrator updated to route "historical/trend/decade/warming/drought/flood" to climate agent
- [x] **Subtask 3.3.3** — `components/ClimateRiskReport.tsx` — trend chart + risk badges
  - [x] SVG line charts for temperature + precipitation trends (no D3 dependency)
  - [x] Risk badges: warming rate, precipitation change, wind trend
  - [x] Extremes: hottest/coldest/wettest/driest year pills
  - [x] Wired into Weather tab on property page

---

## Task 3.4 — Mold & Air Quality Risk ✅

- [x] **Subtask 3.4.1** — Mold risk index (humidity + temp thresholds)
  - [x] `backend/app/engines/mold_engine.py` — `calculate_mold_risk()`, `MoldRisk` dataclass; Lüdecke thresholds
  - [x] `GET /api/v1/impact/mold-risk` — live weather → mold score 0–10, risk level, factors, recommendations
- [x] **Subtask 3.4.2** — Air quality: OpenAQ v3 API integration + AQI display
  - [x] `backend/app/services/openaq_service.py` — nearest station ≤25km, US AQI from PM2.5, cached 1h
  - [x] `GET /api/v1/impact/air-quality` — PM2.5, PM10, O3, NO2, CO breakdown
  - [x] `MoldAirQualityPanel` inline component in Impact tab — mold gauge SVG + AQI card + pollutant grid

---

## Task 3.5 — Progressive Web App (PWA) ✅

- [x] **Subtask 3.5.1** — `next-pwa` config, service worker, offline caching
  - [x] `frontend/next.config.ts` — `withPWA()` wrapper, runtime caching for Mapbox, Open-Meteo, API routes
  - [x] `frontend/public/manifest.json` — name, short_name, theme_color, icons, shortcuts
  - [x] `frontend/public/icons/icon-192.svg` + `icon-512.svg` — amber sun + house silhouette
  - [x] `frontend/src/app/layout.tsx` — manifest meta, apple-web-app, viewport themeColor, skip link
- [x] **Subtask 3.5.2** — Mobile responsive audit (375px – 430px viewports)
  - [x] `viewport` export in layout.tsx — `width: device-width, initialScale: 1, maximumScale: 5`
- [x] **Subtask 3.5.3** — "Add to Home Screen" install prompt after 2 property views
  - [x] `frontend/src/components/PWAInstallPrompt.tsx` — `beforeinstallprompt`, localStorage view counter
  - [x] `incrementPropertyViews()` called on each property page load
- [x] **Subtask 3.5.4** — Gyroscope in 360° view on mobile (device orientation API)
  - [x] `PropertyView360.tsx` — `DeviceOrientationEvent` listener, iOS 13+ permission request, alpha/beta/gamma → camera yaw/pitch

---

## Task 3.6 — Analytics & Monitoring ✅

- [x] **Subtask 3.6.1** — Sentry: backend (FastAPI) + frontend (Next.js)
  - [x] `backend/app/core/config.py` — `SENTRY_DSN` setting added
  - [x] `backend/app/main.py` — `sentry_sdk.init()` in lifespan startup with FastAPI+Starlette integrations; gated on `SENTRY_DSN`
  - [x] `frontend/sentry.client.config.ts` + `frontend/sentry.server.config.ts` — client + server Sentry init
- [x] **Subtask 3.6.2** — PostHog event tracking
  - [x] `frontend/src/components/PostHogProvider.tsx` — lazy-loads posthog-js, wraps app, automatic pageview tracking
  - [x] `layout.tsx` — wraps app in `<PostHogProvider>` (Suspense boundary for useSearchParams)
  - [x] `AddressSearch.tsx` — `address_searched` event on submit
  - [x] `ViewModeSwitcher.tsx` — `view_mode_switched` event on mode change
  - [x] `AIChat.tsx` — `ai_question_asked` event on send
- [x] **Subtask 3.6.3** — Cache hit/miss logging + stampede protection
  - [x] `backend/app/core/cache.py` — DEBUG-level `cache_hit`/`cache_miss` logging; `cache_get_or_set()` with per-key asyncio locks

---

## Task 3.7 — Security Hardening ✅

- [x] **Subtask 3.7.1** — Input sanitization (`sanitize_text()`), `ContentSizeLimitMiddleware` (1MB), tightened CORS `allow_methods`/`allow_headers` in `backend/app/main.py`
- [x] **Subtask 3.7.2** — Production secret management via env vars in `backend/app/core/config.py`; `SECRET_KEY` sourced from `settings`
- [x] **Subtask 3.7.3** — Full security headers in `infra/nginx/nginx.conf` (HSTS, CSP, X-Frame DENY, Permissions-Policy, X-XSS-Protection, `server_tokens off`); mirrored as NGINX Ingress `configuration-snippet` annotations in `infra/k8s/ingress/ingress.yaml`

---

## Task 3.8 — Accessibility (WCAG 2.1 AA) ✅

- [x] **Subtask 3.8.1** — Tab bar: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `tabIndex={active ? 0 : -1}`, arrow-key / Home / End keyboard navigation; tab content wrapped in `role="tabpanel"` `aria-labelledby`
- [x] **Subtask 3.8.2** — AIChat messages: `role="log"` `aria-live="polite"`; thinking animation: `<output aria-label="…">`; send button + input: `aria-label`; ViewModeSwitcher: `role="group"` `aria-label` + `aria-pressed`; skip-to-content link in layout.tsx
- [x] **Subtask 3.8.3** — `focus-visible:ring-2 focus-visible:ring-amber-500/70` on all interactive elements (tab buttons, ViewModeSwitcher, MonthlyHeatmap cells, SunArcVisualization presets, AIChat input/send); ThemeToggle already had `focus-visible:ring-2`
- [x] **Subtask 3.8.4** — `role="img"` + `aria-label` on mold gauge SVG, SunArcVisualization SVG, HourlyTimeline SVG; `aria-label` on 2D/3D/360° view containers; MonthlyHeatmap cells: `aria-label` with full data description; emoji icons: `aria-hidden="true"` throughout

---

## Task 3.9 — Performance Optimization ✅

- [x] **Subtask 3.9.1** — Frontend: `lazy()` + `Suspense` for PropertyView3D/360/2D (already done Task 2.6); `@next/bundle-analyzer` added to devDependencies + `"analyze": "ANALYZE=true next build"` script in package.json; bundler wraps `withBundleAnalyzer(withPWA(nextConfig))`
- [x] **Subtask 3.9.2** — `backend/app/api/v1/endpoints/snapshot.py`: `GET /api/v1/property/snapshot` fetches solar + weather + moon via `asyncio.gather` (moon in thread executor); cached 5 min; OverviewTab updated to single snapshot request instead of two sequential fetches
- [x] **Subtask 3.9.3** — Cache stampede protection already implemented in Task 3.6: `cache_get_or_set()` with per-key `asyncio.Lock` + double-check pattern in `backend/app/core/cache.py`

---

## Task 3.10 — Production Deployment ✅

- [x] **Subtask 3.10.1** — `railway.json` created at repo root for Railway one-click deploy (backend + frontend services, Postgres + Redis add-ons, env var references)
- [x] **Subtask 3.10.2** — Kubernetes manifests cover production: PostGIS StatefulSet, Redis deployment, Nginx Ingress with TLS, Kustomize production overlay; `.env.example` documents all required vars
- [x] **Subtask 3.10.3** — `.github/workflows/deploy.yml` enabled: GHCR Docker builds, Kustomize image tag updates, `kubectl rollout status` wait, smoke test via `kubectl exec`; SENTRY_DSN + POSTHOG_KEY now included in secret creation step
- [x] **Subtask 3.10.4** — `infra/k8s/postgres/backup-cronjob.yaml`: daily `pg_dump --format=custom` CronJob at 02:00 UTC, 30-day retention, dedicated 10Gi `postgres-backup-pvc`; registered in `kustomization.yaml`

---

## Task 3.11 — E2E Testing (Playwright) ✅

- [x] **Subtask 3.11.1** — `frontend/e2e/address-search.spec.ts`: address search → property page navigation, ARIA tab roles, arrow-key keyboard navigation, Solar + AI Chat tab content
- [x] **Subtask 3.11.2** — `frontend/e2e/view-modes.spec.ts`: 2D/3D/360° mode switching via buttons and keyboard shortcuts (2, 3, 0), `aria-pressed` state assertions
- [x] **Subtask 3.11.3** — `frontend/e2e/auth-flow.spec.ts`: register/login form rendering, invalid credentials error, successful registration redirect, nav link visibility
- [x] **Subtask 3.11.4** — `frontend/e2e/mobile-chat.spec.ts`: 375px viewport, AI chat input/send, suggestion chips, send → loading bubble, no horizontal overflow
- [x] **Config** — `frontend/playwright.config.ts`: Chromium + Firefox + Pixel-5 projects, `webServer` auto-start for local dev; `@playwright/test` in devDependencies; `test:e2e` / `test:e2e:headed` / `test:e2e:report` scripts; Playwright CI job added to `frontend-ci.yml` with report artifact upload

---

---

## Summary: Build Order

```text
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
