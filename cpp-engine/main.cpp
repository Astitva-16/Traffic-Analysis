#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <queue>
#include <random>
#include <sstream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

using namespace std;

struct RangeStats {
    double sum = 0;
    double mn = numeric_limits<double>::infinity();
    double mx = -numeric_limits<double>::infinity();
    int count = 0;
};

class SegmentTree {
    int n = 0;
    vector<double> sum, mn, mx;
    void build(const vector<double>& a, int node, int l, int r) {
        if (l == r) { sum[node] = mn[node] = mx[node] = a[l]; return; }
        int m = (l + r) / 2;
        build(a, node * 2, l, m);
        build(a, node * 2 + 1, m + 1, r);
        pull(node);
    }
    void pull(int node) {
        sum[node] = sum[node * 2] + sum[node * 2 + 1];
        mn[node] = min(mn[node * 2], mn[node * 2 + 1]);
        mx[node] = max(mx[node * 2], mx[node * 2 + 1]);
    }
    RangeStats query(int ql, int qr, int node, int l, int r) const {
        if (!n || qr < l || r < ql) return {};
        if (ql <= l && r <= qr) return {sum[node], mn[node], mx[node], r - l + 1};
        int m = (l + r) / 2;
        auto a = query(ql, qr, node * 2, l, m);
        auto b = query(ql, qr, node * 2 + 1, m + 1, r);
        RangeStats out;
        out.sum = a.sum + b.sum;
        out.count = a.count + b.count;
        out.mn = min(a.mn, b.mn);
        out.mx = max(a.mx, b.mx);
        return out;
    }
public:
    explicit SegmentTree(const vector<double>& values) {
        n = static_cast<int>(values.size());
        sum.assign(max(4, n * 4), 0);
        mn.assign(max(4, n * 4), numeric_limits<double>::infinity());
        mx.assign(max(4, n * 4), -numeric_limits<double>::infinity());
        if (n) build(values, 1, 0, n - 1);
    }
    RangeStats range(int l, int r) const {
        if (!n) return {};
        l = max(0, l); r = min(n - 1, r);
        if (l > r) return {};
        return query(l, r, 1, 0, n - 1);
    }
};

struct HeapItem {
    string id, name;
    double score = 0, speed = 0, occupancy = 0;
    int volume = 0;
};

class MaxHeap {
    vector<HeapItem> a;
    static bool better(const HeapItem& x, const HeapItem& y) { return x.score > y.score; }
    void up(int i) {
        while (i > 0) {
            int p = (i - 1) / 2;
            if (!better(a[i], a[p])) break;
            swap(a[i], a[p]);
            i = p;
        }
    }
    void down(int i) {
        while (true) {
            int best = i, l = i * 2 + 1, r = l + 1;
            if (l < (int)a.size() && better(a[l], a[best])) best = l;
            if (r < (int)a.size() && better(a[r], a[best])) best = r;
            if (best == i) break;
            swap(a[i], a[best]); i = best;
        }
    }
public:
    void push(HeapItem x) { a.push_back(move(x)); up((int)a.size() - 1); }
    HeapItem pop() {
        HeapItem top = a.front();
        a.front() = a.back(); a.pop_back();
        if (!a.empty()) down(0);
        return top;
    }
    bool empty() const { return a.empty(); }
};

struct Edge { int to; double weight; };

class Graph {
    vector<vector<Edge>> adj;
public:
    explicit Graph(int n): adj(n) {}
    void addEdge(int u, int v, double w) { adj[u].push_back({v, w}); }
    pair<double, vector<int>> dijkstra(int src, int dst) const {
        const double INF = numeric_limits<double>::infinity();
        vector<double> dist(adj.size(), INF);
        vector<int> prev(adj.size(), -1);
        using State = pair<double,int>;
        priority_queue<State, vector<State>, greater<State>> pq;
        dist[src] = 0; pq.push({0, src});
        while (!pq.empty()) {
            auto [d, u] = pq.top(); pq.pop();
            if (d != dist[u]) continue;
            if (u == dst) break;
            for (auto e : adj[u]) {
                double nd = d + e.weight;
                if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; pq.push({nd, e.to}); }
            }
        }
        if (!isfinite(dist[dst])) return {INF, {}};
        vector<int> path;
        for (int cur = dst; cur != -1; cur = prev[cur]) path.push_back(cur);
        reverse(path.begin(), path.end());
        return {dist[dst], path};
    }
};

static string jsonEscape(const string& s) {
    string out;
    for (char c : s) {
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c == '\n') out += "\\n";
        else out += c;
    }
    return out;
}

static vector<string> split(const string& s, char delim) {
    vector<string> out; string cur;
    stringstream ss(s);
    while (getline(ss, cur, delim)) out.push_back(cur);
    return out;
}

static void runRange(const string& file) {
    ifstream in(file);
    int n, ql, qr; in >> n >> ql >> qr;
    vector<double> values(n);
    for (double& x : values) in >> x;
    SegmentTree tree(values);
    auto q = tree.range(ql, qr);
    cout << fixed << setprecision(2)
         << "{\"ok\":true,\"count\":" << q.count
         << ",\"average\":" << (q.count ? q.sum / q.count : 0)
         << ",\"min\":" << (q.count ? q.mn : 0)
         << ",\"max\":" << (q.count ? q.mx : 0) << "}\n";
}

static void runBottlenecks(const string& file) {
    ifstream in(file);
    int n; in >> n; string line; getline(in, line);
    MaxHeap heap;
    for (int i = 0; i < n; ++i) {
        getline(in, line); auto p = split(line, '|');
        if (p.size() < 6) continue;
        heap.push({p[0], p[1], stod(p[2]), stod(p[3]), stod(p[4]), stoi(p[5])});
    }
    cout << "["; bool first = true;
    int count = min(5, n);
    for (int i = 0; i < count && !heap.empty(); ++i) {
        auto x = heap.pop();
        if (!first) cout << ","; first = false;
        cout << fixed << setprecision(1)
             << "{\"segmentId\":\"" << jsonEscape(x.id) << "\",\"name\":\"" << jsonEscape(x.name)
             << "\",\"score\":" << x.score << ",\"speed\":" << x.speed
             << ",\"occupancy\":" << x.occupancy << ",\"volume\":" << x.volume << "}";
    }
    cout << "]\n";
}

static void runRoute(const string& file) {
    ifstream in(file);
    int n, m, src, dst; in >> n >> m;
    vector<string> labels(n); string line; getline(in, line);
    for (int i = 0; i < n; ++i) getline(in, labels[i]);
    Graph g(n);
    for (int i = 0; i < m; ++i) {
        getline(in, line); auto p = split(line, '|');
        if (p.size() >= 3) g.addEdge(stoi(p[0]), stoi(p[1]), stod(p[2]));
    }
    in >> src >> dst;
    auto [distance, path] = g.dijkstra(src, dst);
    if (path.empty()) { cout << "{\"ok\":false,\"message\":\"No route found\"}\n"; return; }
    cout << fixed << setprecision(2) << "{\"ok\":true,\"minutes\":" << distance << ",\"nodes\":[";
    for (size_t i = 0; i < path.size(); ++i) {
        if (i) cout << ",";
        cout << "\"" << jsonEscape(labels[path[i]]) << "\"";
    }
    cout << "]}\n";
}


static void runCandidateRoute(const string& file) {
    ifstream in(file);
    int n; double trafficAverage;
    in >> n >> trafficAverage;
    // START + one pair of nodes for each candidate + END.
    int totalNodes = 2 + n * 2;
    int endIndex = totalNodes - 1;
    Graph g(totalNodes);
    vector<double> base(n);
    for (double& x : base) in >> x;
    double factor = 1.0 + min(0.35, trafficAverage / 300.0);
    for (int i = 0; i < n; ++i) {
        int branch = 1 + i * 2;
        int branchEnd = branch + 1;
        double liveWeight = base[i] * factor * (1.0 + i * 0.025);
        g.addEdge(0, branch, liveWeight / 2.0);
        g.addEdge(branch, branchEnd, liveWeight / 2.0);
        g.addEdge(branchEnd, endIndex, 0.0);
    }
    auto [minutes, path] = g.dijkstra(0, endIndex);
    if (path.empty()) { cout << "{\"ok\":false,\"message\":\"No route found\"}\n"; return; }
    int selected = -1;
    for (int node : path) if (node >= 1 && node <= n * 2 && node % 2 == 1) { selected = (node - 1) / 2; break; }
    cout << fixed << setprecision(2)
         << "{\"ok\":true,\"minutes\":" << minutes
         << ",\"selectedIndex\":" << selected
         << ",\"trafficFactor\":" << factor << "}\n";
}

static void runSimulate(const string& file) {
    ifstream in(file);
    int n; in >> n; string line; getline(in, line);
    struct Segment { string id, name; double limit, capacity; int seed; };
    vector<Segment> segs;
    for (int i = 0; i < n; ++i) {
        getline(in, line); auto p = split(line, '|');
        if (p.size() >= 5) segs.push_back({p[0], p[1], stod(p[2]), stod(p[3]), stoi(p[4])});
    }
    mt19937 rng((unsigned)chrono::high_resolution_clock::now().time_since_epoch().count());
    uniform_real_distribution<double> noise(-5.0, 5.0);
    uniform_real_distribution<double> jitter(0.0, 8.0);
    queue<string> events;
    double t = chrono::duration<double>(chrono::system_clock::now().time_since_epoch()).count();
    for (auto& s : segs) {
        double pressure = 0.35 + 0.45 * fabs(sin(t / 45.0 + s.seed));
        double speed = max(8.0, min(s.limit, s.limit * (1.0 - pressure * 0.72) + noise(rng)));
        int volume = (int)llround(s.capacity * (0.35 + pressure * 0.8));
        int occupancy = min(100, (int)llround((volume / s.capacity) * 100.0 + jitter(rng)));
        int congestion = (int)llround(max(0.0, min(100.0, (1.0 - speed / s.limit) * 70.0 + (occupancy / 100.0) * 30.0)));
        ostringstream e;
        e << "{\"segmentId\":\"" << jsonEscape(s.id) << "\",\"name\":\"" << jsonEscape(s.name)
          << "\",\"speed\":" << fixed << setprecision(1) << speed
          << ",\"volume\":" << volume << ",\"occupancy\":" << occupancy << ",\"congestion\":" << congestion << "}";
        events.push(e.str());
    }
    cout << "["; bool first = true;
    while (!events.empty()) { if (!first) cout << ","; first = false; cout << events.front(); events.pop(); }
    cout << "]\n";
}

int main(int argc, char** argv) {
    if (argc < 3) { cerr << "Usage: traffic_engine <range|bottlenecks|route|candidate-route|simulate> <input-file>\n"; return 2; }
    string cmd = argv[1], file = argv[2];
    try {
        if (cmd == "range") runRange(file);
        else if (cmd == "bottlenecks") runBottlenecks(file);
        else if (cmd == "route") runRoute(file);
        else if (cmd == "candidate-route") runCandidateRoute(file);
        else if (cmd == "simulate") runSimulate(file);
        else return 2;
    } catch (const exception& e) {
        cout << "{\"ok\":false,\"message\":\"" << jsonEscape(e.what()) << "\"}\n";
        return 1;
    }
    return 0;
}
