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
        RangeStats a = query(ql, qr, node * 2, l, m);
        RangeStats b = query(ql, qr, node * 2 + 1, m + 1, r);
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
        if (n > 0) build(values, 1, 0, n - 1);
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

struct RouteHeapItem {
    string id, name;
    double minutes = 0, distanceKm = 0, congestion = 0;
    double score = 0;
};

class RouteMinHeap {
    vector<RouteHeapItem> a;
    static bool better(const RouteHeapItem& x, const RouteHeapItem& y) {
        return x.score < y.score;
    }
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
    void push(RouteHeapItem x) { a.push_back(move(x)); up((int)a.size() - 1); }
    RouteHeapItem pop() {
        RouteHeapItem top = a.front();
        a.front() = a.back(); a.pop_back();
        if (!a.empty()) down(0);
        return top;
    }
    bool empty() const { return a.empty(); }
};

static string jsonEscape(const string& s) {
    string out;
    for (char c : s) {
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c == '\n') out += "\\n";
        else if (c == '\r') continue;
        else if (c == '\t') out += "\\t";
        else out += c;
    }
    return out;
}

static vector<string> split(const string& s, char delim) {
    vector<string> out; string cur;
    stringstream ss(s);
    while (getline(ss, cur, delim)) {
        if (!cur.empty() && cur.back() == '\r') cur.pop_back();
        out.push_back(cur);
    }
    return out;
}

static void runRange(const string& file) {
    ifstream in(file);
    if (!in.is_open()) {
        cout << "{\"ok\":true,\"count\":0,\"average\":0.00,\"min\":0.00,\"max\":0.00}\n";
        return;
    }
    int n = 0, ql = 0, qr = 0;
    if (!(in >> n >> ql >> qr) || n <= 0) {
        cout << "{\"ok\":true,\"count\":0,\"average\":0.00,\"min\":0.00,\"max\":0.00}\n";
        return;
    }
    vector<double> values(n, 0.0);
    for (int i = 0; i < n; ++i) {
        if (!(in >> values[i])) {
            values.resize(i);
            break;
        }
    }
    if (values.empty()) {
        cout << "{\"ok\":true,\"count\":0,\"average\":0.00,\"min\":0.00,\"max\":0.00}\n";
        return;
    }
    SegmentTree tree(values);
    RangeStats q = tree.range(ql, qr);
    cout << fixed << setprecision(2)
         << "{\"ok\":true,\"count\":" << q.count
         << ",\"average\":" << (q.count ? q.sum / q.count : 0.0)
         << ",\"min\":" << (q.count ? q.mn : 0.0)
         << ",\"max\":" << (q.count ? q.mx : 0.0) << "}\n";
}

static void runBottlenecks(const string& file) {
    ifstream in(file);
    if (!in.is_open()) { cout << "[]\n"; return; }
    int n = 0;
    if (!(in >> n) || n <= 0) { cout << "[]\n"; return; }
    string line;
    getline(in, line);
    MaxHeap heap;
    for (int i = 0; i < n; ++i) {
        if (!getline(in, line)) break;
        vector<string> p = split(line, '|');
        if (p.size() < 6) continue;
        try {
            heap.push({p[0], p[1], stod(p[2]), stod(p[3]), stod(p[4]), stoi(p[5])});
        } catch (...) {}
    }
    cout << "["; bool first = true;
    int count = min(5, n);
    for (int i = 0; i < count && !heap.empty(); ++i) {
        HeapItem x = heap.pop();
        if (!first) cout << ","; first = false;
        cout << fixed << setprecision(1)
             << "{\"segmentId\":\"" << jsonEscape(x.id) << "\",\"name\":\"" << jsonEscape(x.name)
             << "\",\"score\":" << x.score << ",\"speed\":" << x.speed
             << ",\"occupancy\":" << x.occupancy << ",\"volume\":" << x.volume << "}";
    }
    cout << "]\n";
}

static void runRankRoutes(const string& file) {
    ifstream in(file);
    if (!in.is_open()) { cout << "[]\n"; return; }
    int n = 0;
    if (!(in >> n) || n <= 0) { cout << "[]\n"; return; }
    string line;
    getline(in, line);
    RouteMinHeap heap;
    for (int i = 0; i < n; ++i) {
        if (!getline(in, line)) break;
        vector<string> p = split(line, '|');
        if (p.size() < 5) continue;
        try {
            double minutes = stod(p[2]);
            double distanceKm = stod(p[3]);
            double congestion = stod(p[4]);
            double score = minutes * (1.0 + (congestion / 200.0));
            heap.push({p[0], p[1], minutes, distanceKm, congestion, score});
        } catch (...) {}
    }
    cout << "["; bool first = true;
    int rank = 1;
    while (!heap.empty()) {
        RouteHeapItem x = heap.pop();
        if (!first) cout << ","; first = false;
        cout << fixed << setprecision(2)
             << "{\"id\":\"" << jsonEscape(x.id) << "\""
             << ",\"name\":\"" << jsonEscape(x.name) << "\""
             << ",\"estimatedMinutes\":" << x.minutes
             << ",\"distanceKm\":" << x.distanceKm
             << ",\"congestion\":" << setprecision(1) << x.congestion
             << ",\"rank\":" << rank++
             << "}";
    }
    cout << "]\n";
}

int main(int argc, char** argv) {
    if (argc < 3) {
        cerr << "Usage: traffic_engine <range|bottlenecks|rank-routes> <input-file>\n";
        return 2;
    }
    string cmd = argv[1], file = argv[2];
    try {
        if (cmd == "range") runRange(file);
        else if (cmd == "bottlenecks") runBottlenecks(file);
        else if (cmd == "rank-routes") runRankRoutes(file);
        else {
            cerr << "Unknown command: " << cmd << "\n";
            return 2;
        }
    } catch (const exception& e) {
        cout << "{\"ok\":false,\"message\":\"" << jsonEscape(e.what()) << "\"}\n";
        return 1;
    } catch (...) {
        cout << "{\"ok\":false,\"message\":\"Unknown engine error\"}\n";
        return 1;
    }
    return 0;
}
