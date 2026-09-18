import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
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
        setMessage('No places found. Try a landmark like "India Gate" or "Connaught Place".');
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
  const [segments, setSegments] = useState([]);
  const [summary, setSummary] = useState({});
  const [bottlenecks, setBottlenecks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [segRes, sumRes, botRes] = await Promise.all([
        api.get('/segments'),
        api.get('/traffic/summary'),
        api.get('/traffic/bottlenecks')
      ]);
      setSegments(segRes.data || []);
      setSummary(sumRes.data || {});
      setBottlenecks(botRes.data || []);
    } catch (err) {
      console.warn('Dashboard poll error:', err.message);
    }
  }, []);

  useEffect(() => {
    loadData();
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    const socket = io(socketUrl, { reconnectionAttempts: 5 });

    const refresh = setInterval(loadData, 4000);

    socket.on('traffic:update', event => {
      setSegments(prev => prev.map(x => x.segmentId === event.segmentId ? { ...x, ...event } : x));
    });

    return () => {
      socket.disconnect();
      clearInterval(refresh);
    };
  }, [loadData]);

  async function selectSegment(segment) {
    if (!segment) return;
    setSelected(segment);
    setHistoryLoading(true);
    setAnalysis(null);
    try {
      const h = await api.get(`/segments/${segment.segmentId}/history`);
      const readings = (h.data || []).slice(-30).map(x => ({
        time: new Date(x.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        speed: Number(x.speed)
      }));
      setHistory(readings);
    } catch (err) {
      console.error('Failed to load segment history:', err);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function analyzeSelected() {
    if (!selected) return;
    try {
      const h = await api.get(`/segments/${selected.segmentId}/query`, { params: { from: 0, to: 29 } });
      setAnalysis(h.data);
    } catch (err) {
      console.error('Failed to analyze segment:', err);
    }
  }

  async function findRoute() {
    if (!origin || !destination) {
      setRouteMessage('Please search and select both starting place and destination.');
      return;
    }
    setRouteLoading(true);
    setRouteMessage('');
    try {
      const res = await api.post('/routes/places', { origin, destination });
      setRoute(res.data);
    } catch (err) {
      setRoute(null);
      setRouteMessage(err.response?.data?.message || 'Could not calculate route. Please try again.');
    } finally {
      setRouteLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Traffic Analysis &amp; Routing Engine</h1>
          <p>Real-time road congestion telemetry, C++ algorithmic simulation &amp; intelligent routing</p>
        </div>
        <div className="live"><span /> LIVE</div>
      </header>

      <main>
        <section className="stats">
          <Card title="Road Segments" value={summary.segments ?? '—'} />
          <Card title="Average Speed" value={summary.averageSpeed != null ? `${summary.averageSpeed} km/h` : '—'} />
          <Card title="Congestion Level" value={summary.averageCongestion != null ? `${summary.averageCongestion}%` : '—'} />
          <Card title="Active Sensors" value={summary.activeSensors ?? '—'} />
        </section>

        <section className="panel planner">
          <div className="section-heading">
            <div>
              <h2>Intelligent Route Planner</h2>
              <p>Search origin and destination places to find the optimal route factored by live congestion data.</p>
            </div>
          </div>
          <div className="planner-grid">
            <PlacePicker label="Origin" value={origin} onChange={setOrigin} />
            <PlacePicker label="Destination" value={destination} onChange={setDestination} />
            <div className="route-action">
              <button type="button" className="primary" onClick={findRoute} disabled={routeLoading}>
                {routeLoading ? 'Calculating…' : 'Find Best Route'}
              </button>
              {routeMessage && <small className="form-message">{routeMessage}</small>}
            </div>
          </div>
        </section>

        <section className="grid main-grid">
          <div className="panel map-panel">
            <div className="panel-title">
              <div>
                <h2>Live Telemetry Map</h2>
                <p>Green: Clear (&lt;40%) · Amber: Moderate (40-70%) · Red: Congested (&gt;70%) · Blue: Route</p>
              </div>
            </div>
            <div className="mapbox">
              <TrafficMap
                segments={segments}
                routeGeometry={route?.geometry || []}
                origin={route?.origin || origin}
                destination={route?.destination || destination}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <div>
                <h2>Traffic Hotspots (Heap Top 5)</h2>
                <p>Road segments ranked by highest congestion index</p>
              </div>
            </div>
            <div className="bottleneck-list">
              {bottlenecks.length > 0 ? (
                bottlenecks.map((b, i) => {
                  const seg = segments.find(s => s.segmentId === b.segmentId) || {
                    segmentId: b.segmentId,
                    name: b.name,
                    currentSpeed: b.speed,
                    congestion: b.score,
                    occupancy: b.occupancy,
                    volume: b.volume
                  };
                  return (
                    <button
                      type="button"
                      className="bottleneck"
                      key={b.segmentId || i}
                      onClick={() => selectSegment(seg)}
                    >
                      <div><span className="rank">#{i + 1}</span> {b.name}</div>
                      <strong>{Math.round(b.score)}%</strong>
                      <small>{Number(b.speed).toFixed(1)} km/h · {Math.round(b.occupancy)}% occupancy</small>
                    </button>
                  );
                })
              ) : (
                <div className="empty">No hotspots detected.</div>
              )}
            </div>
          </div>
        </section>

        <section className="grid lower-grid">
          <div className="panel">
            <div className="panel-title">
              <div>
                <h2>Segment History &amp; Range Query</h2>
                <p>{selected ? `${selected.name} (${selected.segmentId})` : 'Click any hotspot above to inspect telemetry history'}</p>
              </div>
            </div>
            {selected ? (
              <>
                <div className="chart">
                  {history.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <XAxis dataKey="time" minTickGap={35} tick={{ fontSize: 12 }} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} unit=" km/h" />
                        <Tooltip />
                        <Line type="monotone" dataKey="speed" stroke="#1d4ed8" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty">{historyLoading ? 'Loading history…' : 'No history points yet.'}</div>
                  )}
                </div>
                <button type="button" className="secondary" onClick={analyzeSelected}>
                  Analyze via C++ Segment Tree
                </button>
                {analysis && (
                  <div className="analysis-grid">
                    <Stat label="Average Speed" value={`${analysis.average} km/h`} />
                    <Stat label="Min Speed" value={`${analysis.min} km/h`} />
                    <Stat label="Max Speed" value={`${analysis.max} km/h`} />
                    <Stat label="Samples Count" value={analysis.count} />
                  </div>
                )}
              </>
            ) : (
              <div className="empty">Select a road segment above to visualize speed trends.</div>
            )}
          </div>

          <div className="panel route-panel">
            <div className="panel-title">
              <div>
                <h2>Route Selection Result</h2>
                <p>{route ? `${route.distanceKm.toFixed(1)} km · live congestion estimated` : 'Calculated route information will appear here'}</p>
              </div>
            </div>
            {route ? (
              <>
                <div className="route-result">
                  <span className="route-label">Recommended Route</span>
                  <b>{route.origin.shortName || route.origin.name} → {route.destination.shortName || route.destination.name}</b>
                  <strong>{route.estimatedMinutes} min</strong>
                  <small>Optimized by Dijkstra pathfinder factoring live speed degradation.</small>
                </div>
                {route.candidates && route.candidates.length > 0 && (
                  <div className="alternatives">
                    <h3>Evaluated Options</h3>
                    {route.candidates.map(c => (
                      <div className="option" key={c.id}>
                        <span>Option #{c.rank}</span>
                        <b>{c.baseMinutes} min base</b>
                        <small>{c.distanceKm} km</small>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="empty">Search places above to calculate route recommendations.</div>
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
