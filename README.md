# Traffic Analysis & Route Monitor

A MERN-based traffic monitoring dashboard with a separate **C++ traffic engine** for the computational work. The app shows live simulated sensor readings, traffic hotspots, speed history, range analysis, and route planning between real places entered by the user.

## What the project does

- Generates continuous traffic readings for monitored road segments.
- Stores readings in MongoDB Atlas.
- Streams updates to the React dashboard with Socket.IO.
- Ranks congested road segments in C++.
- Answers speed range statistics in C++.
- Calculates route choices in C++ from candidate driving paths returned by OSRM.
- Lets a user search for real places and select an origin and destination.
- Draws the selected route on an OpenStreetMap/Leaflet map.
- Uses Nominatim for explicit place searches and OSRM for driving routes; no paid API key is required for the default setup.

## Architecture

```text
React + Leaflet
      |
      | REST / Socket.IO
      v
Node.js + Express  -------- MongoDB Atlas
      |
      | child-process bridge
      v
C++ traffic engine
      |
      +-- range statistics
      +-- traffic hotspot ranking
      +-- route search
      +-- sensor simulation / event buffering
```

Node is the application/integration layer. The data-structure and graph processing lives in C++ under `cpp-engine/`.

## Requirements

- Node.js 18+
- MongoDB Atlas account
- C++17 compiler
  - Windows: MinGW-w64/MSYS2 `g++`
  - Linux/macOS: `g++`

## 1. Configure MongoDB

Create `backend/.env` from `backend/.env.example`.

```env
PORT=5000
MONGO_URI=mongodb+srv://traffic_admin:YOUR_PASSWORD@traffic-analyser.muyqjew.mongodb.net/traffic_analysis?appName=Traffic-Analyser
CLIENT_URL=http://localhost:5174
SIMULATOR_ENABLED=true
CPP_ENGINE_PATH=
NOMINATIM_URL=https://nominatim.openstreetmap.org/search
OSRM_URL=https://router.project-osrm.org
```

## 2. Build the C++ engine

### Windows

Open PowerShell in `cpp-engine`:

```powershell
cd cpp-engine
.\build.bat
```

This creates:

```text
cpp-engine/traffic_engine.exe
```

If `g++` is not recognized, install MinGW-w64/MSYS2 and add its `bin` directory to PATH.

### Linux/macOS

```bash
cd cpp-engine
./build.sh
```

## 3. Backend

```bash
cd backend
npm install
npm run dev
```

Expected:

```text
Backend running on 5000
```

## 4. Frontend

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

Then:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173` or `http://localhost:5174`.

## Place search and routing

The dashboard intentionally uses an explicit **Search** action instead of autocomplete. Searches are sent through the backend to Nominatim and cached locally. The backend identifies candidate driving routes through OSRM, and the C++ engine selects the best candidate using the current traffic factor.

OpenStreetMap/Nominatim requires a valid application User-Agent, attribution, and responsible usage. The implementation spaces uncached searches by at least one second and does not implement client-side autocomplete.

## API endpoints

- `GET /api/health`
- `GET /api/segments`
- `GET /api/segments/:id/history`
- `GET /api/segments/:id/query?from=0&to=29`
- `GET /api/traffic/summary`
- `GET /api/traffic/bottlenecks`
- `GET /api/places/search?q=India%20Gate`
- `POST /api/routes/places`
- `POST /api/sensors/events`

## Real traffic data later

The current project includes a C++ sensor simulator so the application works without a paid traffic provider. If you obtain a suitable sensor, GPS, camera, or traffic API feed, normalize its readings into:

```json
{
  "segmentId": "S1",
  "speed": 32.4,
  "volume": 1200,
  "occupancy": 76,
  "timestamp": "2026-08-29T18:30:00.000Z"
}
```

and send them to `POST /api/sensors/events`.
