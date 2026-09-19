# Traffic Monitor

Traffic Monitor is a web application for checking road traffic
conditions and finding a better route between two places.

The project has three main parts:

-   **Frontend** -- React application used by the user
-   **Backend** -- Node.js and Express server that handles API requests
    and live traffic updates
-   **C++ Engine** -- C++ program used for traffic calculations and
    route-related algorithms
-   **MongoDB** -- stores road segments and traffic readings

## Features

-   Shows the current number of road segments
-   Shows average speed and traffic congestion
-   Shows active traffic sensors
-   Displays traffic conditions on a map
-   Allows the user to enter two real places
-   Searches the entered places using a location search service
-   Finds a route between the selected places
-   Uses current traffic conditions while calculating the route
-   Shows major traffic bottlenecks
-   Shows speed history for road segments
-   Sends live traffic updates to the frontend

------------------------------------------------------------------------

## Tech Stack

### Frontend

-   React
-   Vite
-   Axios
-   Leaflet
-   React-Leaflet
-   Recharts
-   Socket.IO Client
-   CSS

### Backend

-   Node.js
-   Express.js
-   MongoDB
-   Mongoose
-   Socket.IO
-   Axios
-   dotenv

### C++

-   C++
-   Used for traffic simulation and traffic calculations
-   Used for route and bottleneck calculations

------------------------------------------------------------------------

## Project Structure

``` text
traffic-analysis/
│
├── backend/
│   ├── cpp-engine/
│   │   ├── main.cpp
│   │   ├── build.bat
│   │   └── traffic_engine.exe
│   │
│   ├── src/
│   │   ├── controllers/
│   │   │   └── trafficController.js
│   │   │
│   │   ├── models/
│   │   │   ├── RoadSegment.js
│   │   │   └── TrafficReading.js
│   │   │
│   │   ├── routes/
│   │   │   └── trafficRoutes.js
│   │   │
│   │   ├── services/
│   │   │   ├── cppEngine.js
│   │   │   ├── placeService.js
│   │   │   └── trafficEngine.js
│   │   │
│   │   └── server.js
│   │
│   ├── .env
│   ├── build.sh
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── TrafficMap.jsx
│   │   │
│   │   ├── pages/
│   │   │   └── Dashboard.jsx
│   │   │
│   │   ├── services/
│   │   │   └── api.js
│   │   │
│   │   ├── utils/
│   │   ├── main.jsx
│   │   └── styles.css
│   │
│   ├── .env
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

------------------------------------------------------------------------

# Architecture

The application follows this basic flow:

``` mermaid
flowchart TD

    A[User enters From and To places] --> B[React Frontend]

    B --> C[Axios API Request]

    C --> D[Node.js + Express Backend]

    D --> E[Place Service]

    E --> F[Location Search API]

    F --> E
    E --> D

    D --> G[Traffic Controller]

    G --> H[MongoDB]

    G --> I[C++ Engine]

    I --> J[Traffic / Route Calculation]

    J --> D

    D --> K[Route and Traffic Result]

    K --> B

    B --> L[Leaflet Map]
    B --> M[Traffic Dashboard]
    B --> N[Recharts Graphs]

    O[Traffic Simulator] --> I
    I --> D
    D --> H

    D --> P[Socket.IO]
    P --> B
    B --> Q[Live Traffic Updates]
```

## Simple Input to Output Flow

### 1. User Input

The user enters something such as:

``` text
From: India Gate, New Delhi
To: Connaught Place, New Delhi
```

The frontend sends this information to the backend.

### 2. Place Search

The backend uses `placeService.js` to search for the entered places.

The location service returns information such as:

``` text
Place name
Latitude
Longitude
```

The frontend can then use these coordinates for the map and route
request.

### 3. Backend Processing

The request reaches the Express backend.

The backend decides what information is required:

-   Place information
-   Road segments
-   Current traffic data
-   Route calculation
-   Bottleneck information

### 4. MongoDB

MongoDB stores information such as:

-   Road segments
-   Current traffic values
-   Traffic readings
-   Speed history

Mongoose is used in the backend to communicate with MongoDB.

### 5. C++ Engine

The backend calls the C++ engine whenever traffic calculations are
required.
The C++ engine is used for:
------------------------------------------------------------------------

# Algorithms Used

The project uses different data structures for different traffic
operations. Each one is selected according to the type of query it must
answer.

## 1. Segment Tree - Speed Range Statistics

**Location:** `backend/cpp-engine/main.cpp`, `SegmentTree`

The segment tree stores speed values and returns the following statistics
for any requested range of road segments:

-   Number of readings
-   Average speed
-   Minimum speed
-   Maximum speed

**Why this algorithm?** Speed history is queried for selected ranges, not
always for the complete array. A segment tree combines the sum, minimum,
and maximum of smaller ranges, so repeated range queries are faster than
scanning every speed value each time.

**Use case:** The frontend can request speed statistics for a selected
part of a route or a selected portion of speed history.

**Complexity:** Building the tree takes `O(n)` time and a range query
takes `O(log n)` time, with `O(n)` extra memory.

## 2. Min-Heap - Route Ranking

**Location:** `backend/cpp-engine/main.cpp`, `RouteMinHeap`

Every candidate route receives a traffic-aware score:

``` text
score = estimatedMinutes * (1 + congestion / 200)
```

The min-heap keeps the route with the lowest score at the top. Routes are
then removed from the heap in increasing score order and assigned ranks.

**Why this algorithm?** The best route should consider both travel time
and congestion. A min-heap gives quick access to the currently best route
without requiring a separate full comparison step for every selection.

**Use case:** When the user selects an origin and destination, the backend
gets route candidates, ranks them using current congestion, and returns
the best route first.

**Complexity:** Inserting `n` routes takes `O(n log n)` with the current
implementation, and removing all ranked routes takes `O(n log n)` time.
The heap uses `O(n)` memory.

## 3. Max-Heap - Traffic Bottlenecks

**Location:** `backend/cpp-engine/main.cpp`, `MaxHeap`

The max-heap keeps the segment with the highest traffic score at the top.
It can return the most critical segments first, which is useful for
showing the top five bottlenecks on the dashboard.

**Why this algorithm?** Traffic monitoring usually needs the worst few
segments, rather than a complete sorted list of every segment. A max-heap
supports repeated access to the highest-priority bottleneck efficiently.

**Use case:** Identify road segments with severe congestion, low speed,
high occupancy, or high traffic volume so that they can be highlighted on
the map and dashboard.

**Complexity:** Inserting `n` segments takes `O(n log n)`. Returning the
top `k` bottlenecks takes `O(k log n)`, and the heap uses `O(n)` memory.

## 4. Traffic-Aware Scoring

Route ranking uses a weighted scoring formula instead of choosing only
the shortest distance or the lowest travel time. Congestion increases the
effective cost of a route, so a slightly longer route can be ranked first
when it has significantly less traffic.

This makes the route result more useful for real-world navigation, where
the fastest route under current traffic is usually more valuable than the
geometrically shortest route.


-   Traffic simulation
-   Traffic range calculations
-   Bottleneck calculation
-   Route candidate calculation

### 6. Route Result

The backend receives the result from the C++ engine and sends the
required information back to the frontend.

The frontend then displays the route and traffic information to the
user.

### 7. Frontend Display

The result is shown using:

-   **Leaflet** for the map
-   **Recharts** for speed history graphs
-   Normal React components for traffic cards and route information

------------------------------------------------------------------------

# Data Flow

The overall data flow can be understood as:

``` text
                   ┌─────────────────┐
                   │      USER       │
                   └────────┬────────┘
                            │
                    Places / Requests
                            │
                            ▼
                   ┌─────────────────┐
                   │     REACT       │
                   │    FRONTEND     │
                   └────────┬────────┘
                            │
                         Axios
                            │
                            ▼
                   ┌─────────────────┐
                   │     EXPRESS     │
                   │     BACKEND     │
                   └──────┬─────┬────┘
                          │     │
              ┌───────────┘     └────────────┐
              ▼                              ▼
       ┌─────────────┐                ┌─────────────┐
       │   MongoDB   │                │ C++ Engine  │
       │             │                │             │
       │ Traffic     │                │ Calculations│
       │ Data        │                │ Routes      │
       └──────┬──────┘                │ Bottlenecks │
              │                       └──────┬──────┘
              └──────────────┬───────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     BACKEND     │
                    └────────┬────────┘
                             │
                      API / Socket.IO
                             │
                             ▼
                    ┌─────────────────┐
                    │     FRONTEND    │
                    └───────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
           Leaflet       Recharts      Dashboard
             Map           Graphs          UI
```

------------------------------------------------------------------------

# Running the Project

## 1. Start MongoDB

Make sure MongoDB is running and the MongoDB connection string is
correctly added to the backend `.env` file.

Example:

``` env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/traffic_analysis
```

Do not upload `.env` to GitHub.

------------------------------------------------------------------------

## 2. Build the C++ Engine

Open a terminal inside:

``` text
cpp-engine/
```

On Windows:

``` text
build.bat
```

This should create/update:

``` text
traffic_engine.exe
```

------------------------------------------------------------------------

## 3. Start the Backend

Open a terminal inside:

``` text
backend/
```

Install dependencies if needed:

``` bash
npm install
```

Start the backend:

``` bash
npm run dev
```

The backend should show something similar to:

``` text
MongoDB connected
Backend running on 5000
```

You can test the backend using:

``` text
http://localhost:5000/api/health
```

A working backend should return a JSON response showing that the service
is running.

------------------------------------------------------------------------

## 4. Start the Frontend

Open another terminal inside:

``` text
frontend/
```

Install dependencies:

``` bash
npm install
```

Start Vite:

``` bash
npm run dev
```

Then open the local URL shown by Vite, usually:

``` text
http://localhost:5173
```

------------------------------------------------------------------------

# Environment Variables

Backend `.env`:

``` env
PORT=5000
MONGO_URI=your_mongodb_connection_string
CLIENT_URL=http://localhost:5173
SIMULATOR_ENABLED=true
```

Frontend `.env` should contain the backend URL used by the frontend,
according to the variable name used in `api.js`.

Do not commit passwords, API keys, database credentials, or other
secrets to GitHub.

------------------------------------------------------------------------

# Development Notes

### Backend not loading

Check:

``` text
MongoDB connection
C++ executable
PORT 5000
.env file
```

Then test:

``` text
http://localhost:5000/api/health
```

### Frontend shows a blank page

Open the browser console and check for React errors.

For example:

``` text
React is not defined
```

usually means the component is using the `React` object without
importing it, depending on the JSX setup.

### API requests are stuck

Check that the backend is running on port `5000`.

The frontend should be able to reach endpoints such as:

``` text
/api/segments
/api/traffic/summary
/api/traffic/bottlenecks
```

### C++ engine error

If the backend says that the C++ engine cannot be found:

1.  Open the `cpp-engine` folder
2.  Run `build.bat`
3.  Check that `traffic_engine.exe` is created
4.  Restart the backend

------------------------------------------------------------------------

# Why C++ Is Used

The frontend and backend are mainly responsible for the application and
data flow.

C++ is used for the calculation part of the project.

This keeps the traffic calculation logic separate from the web
application.

The general structure is:

``` text
React
  ↓
Node.js
  ↓
C++
  ↓
Calculation
  ↓
Node.js
  ↓
React
```

The project can therefore use C++ for algorithm-based processing while
React and Node.js handle the web application.

------------------------------------------------------------------------

# Project Goal

The main goal of Traffic Monitor is to provide a simple traffic
dashboard where a user can:

1.  Search for real places
2.  Select a starting and ending location
3.  Check current traffic conditions
4.  Find a suitable route
5.  View traffic hotspots
6.  View traffic speed history
7.  Receive live traffic updates

The project combines a web interface, database, real-time communication,
map display, and C++ based traffic calculations in one application.

------------------------------------------------------------------------

# License

This project is for learning and development purposes.
