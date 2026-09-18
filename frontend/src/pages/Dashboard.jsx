import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import TrafficMap from '../components/TrafficMap';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import '../styles.css';

function PlacePicker({ label, value, onChange }) {
  const [query, setQuery] = useState(value?.shortName || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setQuery(value?.shortName || '');
  }, [value]);

  async function search() {
    if (query.trim().length < 2) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await api.get('/places/search', { params: { q: query.trim() } });
      setResults(res.data || []);
      if (!res.data || !res.data.length) {
        setMessage('No places found. Try "India Gate", "Connaught Place", or "Noida".');
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not search places right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="picker">
      <label>{label}</label>
      <div className="picker-row">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="e.g. India Gate, Connaught Place"
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button type="button" onClick={search} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>
      {results.length > 0 && (
        <div className="place-results">
          {results.map((place, index) => (
            <button
              type="button"
              key={`${place.lat}-${place.lon}-${index}`}
              onClick={() => {
                onChange(place);
                setResults([]);
              }}
            >
              <strong>{place.shortName}</strong>
              <span>{place.name}</span>
            </button>
          ))}
        </div>
      )}
      {message && <small className="form-message">{message}</small>}
      {value && (
        <div className="selected-place">
          Selected: <b>{value.shortName || value.name}</b>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [origin, setOrigin] = useState({
    name: 'India Gate, Rajpath, New Delhi, Delhi, India',
    shortName: 'India Gate',
    lat: 28.6129,
    lon: 77.2295
  });
  const [destination, setDestination] = useState({
    name: 'Connaught Place, New Delhi, Delhi, India',
    shortName: 'Connaught Place',
    lat: 28.6315,
    lon: 77.2167
  });

  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Segment Tree Range Query State
  const [rangeFrom, setRangeFrom] = useState(0);
  const [rangeTo, setRangeTo] = useState(5);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  async function calculateRoutes() {
    if (!origin || !destination) {
      setErrorMsg('Please select both Origin and Destination first.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setAnalysis(null);
    try {
      const res = await api.post('/routes/places', { origin, destination });
      const rankedRoutes = res.data?.routes || [];
      setRoutes(rankedRoutes);
      if (rankedRoutes.length > 0) {
        const top = rankedRoutes[0];
        setSelectedRoute(top);
        setRangeFrom(0);
        const maxIdx = Math.max(0, (top.segments?.length || 1) - 1);
        setRangeTo(maxIdx);
        runSegmentTreeAnalysis(top, 0, maxIdx);
      } else {
        setSelectedRoute(null);
        setErrorMsg('No drivable route found between these places.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to calculate routes.');
    } finally {
      setLoading(false);
    }
  }

  function handleSelectRoute(route) {
    if (!route) return;
    setSelectedRoute(route);
    setRangeFrom(0);
    const maxIdx = Math.max(0, (route.segments?.length || 1) - 1);
    setRangeTo(maxIdx);
    runSegmentTreeAnalysis(route, 0, maxIdx);
  }

  async function runSegmentTreeAnalysis(routeToAnalyze, fromIdx, toIdx) {
    const r = routeToAnalyze || selectedRoute;
    if (!r || !r.segments?.length) return;

    setAnalysisLoading(true);
    const speeds = r.segments.map(s => s.speed);
    try {
      const res = await api.post('/routes/range-query', {
        speeds,
        from: fromIdx != null ? fromIdx : rangeFrom,
        to: toIdx != null ? toIdx : rangeTo
      });
      setAnalysis(res.data);
    } catch (err) {
      console.error('Segment tree analysis error:', err);
    } finally {
      setAnalysisLoading(false);
    }
  }

  useEffect(() => {
    calculateRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = (selectedRoute?.segments || []).map((s, idx) => ({
    checkpoint: `CP-${idx + 1}`,
    name: s.name,
    roadName: s.roadName || s.name,
    speed: s.speed,
    distanceKm: s.distanceKm,
    congestion: s.congestion
  }));

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Traffic Route Engine</h1>
          <p>Real-time Road Routing (OSRM API) &middot; C++ Min-Heap Ranking &middot; Segment Tree Profile</p>
        </div>
        <div className="live"><span /> C++ ENGINE ACTIVE</div>
      </header>

      <main>
        {/* Dynamic Trip Metrics */}
        <section className="stats">
          <Card
            title="Selected Route"
            value={selectedRoute ? `#${selectedRoute.rank} ${selectedRoute.name.replace(/^Via\s+/i, '')}` : '—'}
          />
          <Card
            title="Fastest ETA"
            value={selectedRoute ? `${selectedRoute.estimatedMinutes} min` : '—'}
          />
          <Card
            title="Trip Distance"
            value={selectedRoute ? `${selectedRoute.distanceKm} km` : '—'}
          />
          <Card
            title="Avg Congestion"
            value={selectedRoute ? `${selectedRoute.congestion}%` : '—'}
          />
        </section>

        {/* Origin & Destination Route Planner */}
        <section className="panel planner">
          <div className="section-heading">
            <div>
              <h2>Find Real Routes Between Two Locations</h2>
              <p>Type any two locations. Real road corridors from the map API will be evaluated and ranked via C++ Min-Heap.</p>
            </div>
          </div>
          <div className="planner-grid">
            <PlacePicker label="Origin (Starting Point)" value={origin} onChange={setOrigin} />
            <PlacePicker label="Destination (End Point)" value={destination} onChange={setDestination} />
            <div className="route-action">
              <button
                type="button"
                className="primary"
                onClick={calculateRoutes}
                disabled={loading}
              >
                {loading ? 'Evaluating…' : 'Find Best Routes'}
              </button>
              {errorMsg && <small className="form-message">{errorMsg}</small>}
            </div>
          </div>
        </section>

        {/* Map and Ranked Routes */}
        <section className="grid main-grid">
          <div className="panel map-panel">
            <div className="panel-title">
              <div>
                <h2>Real-Road Telemetry Map</h2>
                <p>Blue: Selected Path &middot; Dashed: Alternative Corridors &middot; Green: Origin &middot; Red: Destination</p>
              </div>
            </div>
            <div className="mapbox">
              <TrafficMap
                routes={routes}
                selectedRoute={selectedRoute}
                onSelectRoute={handleSelectRoute}
                origin={origin}
                destination={destination}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <div>
                <h2>Available Routes ({routes.length} Paths &middot; C++ Heap)</h2>
                <p>Real road corridors ranked from fastest to slowest via C++ Min-Heap</p>
              </div>
            </div>
            <div className="bottleneck-list">
              {routes.length > 0 ? (
                routes.map(r => {
                  const isSelected = selectedRoute && selectedRoute.id === r.id;
                  const congClass = r.congestion > 55 ? 'heavy' : r.congestion > 35 ? 'moderate' : '';
                  return (
                    <button
                      type="button"
                      className={`bottleneck ${isSelected ? 'active' : ''}`}
                      key={r.id}
                      onClick={() => handleSelectRoute(r)}
                    >
                      <div>
                        <span className="rank">#{r.rank}</span>
                        <strong>{r.name}</strong>
                      </div>
                      <strong className={congClass}>{r.estimatedMinutes} min</strong>
                      <small>
                        {r.distanceKm} km &middot; {r.averageSpeed} km/h avg &middot; {r.congestion}% congestion
                      </small>
                    </button>
                  );
                })
              ) : (
                <div className="empty">
                  {loading ? 'Evaluating real routes via C++ Heap…' : 'Search two locations above to generate routes.'}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Segment Tree Graph & Route Breakdown */}
        <section className="grid lower-grid">
          <div className="panel">
            <div className="panel-title">
              <div>
                <h2>Road Speed Profile (C++ Segment Tree)</h2>
                <p>
                  {selectedRoute
                    ? `Speeds along #${selectedRoute.rank} ${selectedRoute.name}`
                    : 'Select a route from the list above'}
                </p>
              </div>
            </div>

            {selectedRoute ? (
              <>
                <div className="chart">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <XAxis dataKey="checkpoint" tick={{ fontSize: 11 }} />
                        <YAxis unit=" km/h" domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(value) => [`${value} km/h`, 'Speed']}
                          labelFormatter={(lbl, items) => {
                            const item = items?.[0]?.payload;
                            return item ? `${item.name}` : lbl;
                          }}
                        />
                        <Line type="monotone" dataKey="speed" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty">No checkpoint data for this route.</div>
                  )}
                </div>

                {/* Range Query Controls */}
                <div className="range-controls">
                  <label>
                    From:{' '}
                    <select
                      value={rangeFrom}
                      onChange={e => setRangeFrom(Number(e.target.value))}
                    >
                      {chartData.map((c, i) => (
                        <option key={i} value={i}>
                          {c.checkpoint}: {c.roadName} ({c.distanceKm} km)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    To:{' '}
                    <select
                      value={rangeTo}
                      onChange={e => setRangeTo(Number(e.target.value))}
                    >
                      {chartData.map((c, i) => (
                        <option key={i} value={i} disabled={i < rangeFrom}>
                          {c.checkpoint}: {c.roadName} ({c.distanceKm} km)
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="secondary"
                    onClick={() => runSegmentTreeAnalysis(selectedRoute, rangeFrom, rangeTo)}
                    disabled={analysisLoading}
                  >
                    {analysisLoading ? 'Querying C++ Tree…' : 'Query Range via C++ Segment Tree'}
                  </button>
                </div>

                {analysis && (
                  <div className="analysis-grid">
                    <Stat label="Average Speed" value={`${analysis.average} km/h`} />
                    <Stat label="Minimum Speed" value={`${analysis.min} km/h`} />
                    <Stat label="Maximum Speed" value={`${analysis.max} km/h`} />
                    <Stat label="Segments Checked" value={analysis.count} />
                  </div>
                )}
              </>
            ) : (
              <div className="empty">Calculate routes and pick one to view its Segment Tree graph.</div>
            )}
          </div>

          <div className="panel route-panel">
            <div className="panel-title">
              <div>
                <h2>Selected Path Summary</h2>
                <p>Detailed breakdown of your active route choice</p>
              </div>
            </div>

            {selectedRoute ? (
              <>
                <div className="route-result">
                  <span className="route-label">Rank #{selectedRoute.rank} Selected</span>
                  <b>{selectedRoute.name}</b>
                  <strong>{selectedRoute.estimatedMinutes} min</strong>
                  <small>
                    Covers {selectedRoute.distanceKm} km with {selectedRoute.congestion}% congestion delay.
                  </small>
                </div>

                <div className="alternatives">
                  <h3>All Evaluated Routes ({routes.length})</h3>
                  {routes.map(r => (
                    <div
                      className={`option ${selectedRoute.id === r.id ? 'active' : ''}`}
                      key={r.id}
                      onClick={() => handleSelectRoute(r)}
                    >
                      <span>
                        #{r.rank} {r.name}
                      </span>
                      <b>{r.estimatedMinutes} min</b>
                      <small>
                        {r.distanceKm} km &middot; {r.congestion}% congestion
                      </small>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty">Search two locations to compare routes.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="card">
      <span>{title}</span>
      <b>{value}</b>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
