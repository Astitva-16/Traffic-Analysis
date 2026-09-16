import { useEffect, useState } from 'react';
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
      setResults(res.data);
      if (!res.data.length) setMessage('No places found. Try a nearby landmark or full address.');
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
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. India Gate, New Delhi" onKeyDown={e => e.key === 'Enter' && search()} />
        <button onClick={search} disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </div>
      {results.length > 0 && (
        <div className="place-results">
          {results.map((place, index) => (
            <button key={`${place.lat}-${place.lon}-${index}`} onClick={() => { onChange(place); setResults([]); }}>
              <strong>{place.shortName}</strong>
              <span>{place.name}</span>
            </button>
          ))}
        </div>
      )}
      {message && <small className="form-message">{message}</small>}
      {value && <div className="selected-place">Selected: <b>{value.shortName}</b></div>}
    </div>
  );
}

export default function Dashboard() {
  const [segments, setSegments] = useState([]);
  const [summary, setSummary] = useState({});
  const [bottlenecks, setBottlenecks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');

  async function load() {
    const [a, b, c] = await Promise.all([
      api.get('/segments'),
      api.get('/traffic/summary'),
      api.get('/traffic/bottlenecks')
    ]);
    setSegments(a.data);
    setSummary(b.data);
    setBottlenecks(c.data);
  }

  useEffect(() => {
    load();
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');
    const refresh = setInterval(load, 5000);
    socket.on('traffic:update', event => {
      setSegments(prev => prev.map(x => x.segmentId === event.segmentId ? { ...x, ...event } : x));
    });
    return () => { socket.close(); clearInterval(refresh); };
  }, []);

  async function selectSegment(segment) {
    if (!segment) return;
    setSelected(segment);
    const h = await api.get(`/segments/${segment.segmentId}/history`);
    setHistory(h.data.slice(-30).map(x => ({ time: new Date(x.timestamp).toLocaleTimeString(), speed: x.speed })));
    setAnalysis(null);
  }

  async function analyzeSelected() {
    if (!selected) return;
    const h = await api.get(`/segments/${selected.segmentId}/query`, { params: { from: 0, to: 29 } });
    setAnalysis(h.data);
  }

  async function findRoute() {
    if (!origin || !destination) {
      setRouteMessage('Search and select both places first.');
      return;
    }
    setRouteLoading(true);
    setRouteMessage('');
    try {
      const res = await api.post('/routes/places', { origin, destination });
      setRoute(res.data);
    } catch (err) {
      setRoute(null);
      setRouteMessage(err.response?.data?.message || 'Could not calculate a route.');
    } finally {
      setRouteLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Traffic Monitor</h1>
          <p>Live road conditions, bottlenecks and route planning</p>
        </div>
        <div className="live"><span /> LIVE</div>
      </header>

      <main>
        <section className="stats">
          <Card title="Road segments" value={summary.segments ?? '—'} />
          <Card title="Average speed" value={summary.averageSpeed != null ? `${summary.averageSpeed} km/h` : '—'} />
          <Card title="Congestion" value={summary.averageCongestion != null ? `${summary.averageCongestion}%` : '—'} />
          <Card title="Active sensors" value={summary.activeSensors ?? '—'} />
        </section>

        <section className="panel planner">
          <div className="section-heading">
            <div>
              <h2>Plan a route</h2>
              <p>Search for real places and compare the best driving route using current road conditions.</p>
            </div>
          </div>
          <div className="planner-grid">
            <PlacePicker label="From" value={origin} onChange={setOrigin} />
            <PlacePicker label="To" value={destination} onChange={setDestination} />
            <div className="route-action">
              <button className="primary" onClick={findRoute} disabled={routeLoading}>{routeLoading ? 'Calculating…' : 'Find best route'}</button>
              {routeMessage && <small className="form-message">{routeMessage}</small>}
            </div>
          </div>
        </section>

        <section className="grid main-grid">
          <div className="panel map-panel">
            <div className="panel-title">
              <div><h2>Live traffic map</h2><p>Green: clear · Amber: slow · Red: congested · Blue: selected route</p></div>
            </div>
            <div className="mapbox"><TrafficMap segments={segments} routeGeometry={route?.geometry || []} origin={route?.origin || origin} destination={route?.destination || destination} /></div>
          </div>

          <div className="panel">
            <div className="panel-title"><div><h2>Traffic hotspots</h2><p>Roads with the highest current congestion</p></div></div>
            <div className="bottleneck-list">
              {bottlenecks.map((b, i) => (
                <button className="bottleneck" key={b.segmentId} onClick={() => selectSegment(segments.find(s => s.segmentId === b.segmentId))}>
                  <div><span className="rank">#{i + 1}</span> {b.name}</div>
                  <strong>{Math.round(b.score)}%</strong>
                  <small>{Number(b.speed).toFixed(1)} km/h · {Math.round(b.occupancy)}% occupancy</small>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid lower-grid">
          <div className="panel">
            <div className="panel-title"><div><h2>Speed history</h2><p>{selected ? selected.name : 'Select a road above to inspect its recent readings'}</p></div></div>
            {selected ? (
              <>
                <div className="chart"><ResponsiveContainer><LineChart data={history}><XAxis dataKey="time" minTickGap={35} /><YAxis domain={['auto', 'auto']} /><Tooltip /><Line type="monotone" dataKey="speed" stroke="#1d4ed8" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
                <button className="secondary" onClick={analyzeSelected}>Analyze recent readings</button>
                {analysis && <div className="analysis-grid"><Stat label="Average" value={`${analysis.average} km/h`} /><Stat label="Minimum" value={`${analysis.min} km/h`} /><Stat label="Maximum" value={`${analysis.max} km/h`} /><Stat label="Readings" value={analysis.count} /></div>}
              </>
            ) : <div className="empty">Click a traffic hotspot to view its history.</div>}
          </div>

          <div className="panel route-panel">
            <div className="panel-title"><div><h2>Route result</h2><p>{route ? `${route.distanceKm.toFixed(1)} km · live estimate` : 'Your selected route will appear here'}</p></div></div>
            {route ? (
              <>
                <div className="route-result">
                  <span className="route-label">Recommended</span>
                  <b>{route.origin.shortName} → {route.destination.shortName}</b>
                  <strong>{route.estimatedMinutes} min</strong>
                  <small>Estimated from current road conditions and live traffic activity.</small>
                </div>
                <div className="alternatives">
                  <h3>Available options</h3>
                  {route.candidates.map(c => <div className="option" key={c.id}><span>Option {c.rank}</span><b>{c.baseMinutes} min</b><small>{c.distanceKm} km</small></div>)}
                </div>
              </>
            ) : <div className="empty">Search two places and calculate a route.</div>}
          </div>
        </section>
      </main>
    </div>
  );
}

function Card({ title, value }) { return <div className="card"><span>{title}</span><b>{value}</b></div>; }
function Stat({ label, value }) { return <div><span>{label}</span><b>{value}</b></div>; }
