#include <winsock2.h>
#include <ws2tcpip.h>
#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <queue>
#include <stack>
#include <tuple>
#include <map>
#include <set>
#include <algorithm>
#include <random>
#include <chrono>

#pragma comment(lib, "ws2_32.lib")

using namespace std;

#define SERVER_PORT 8081
#define WEBROOT "web/"

const int ROWS = 25;
const int COLS = 38;

struct Cell { int x, y; Cell(){} Cell(int a,int b):x(a),y(b){} };
struct SolveResult {
    vector<Cell> path;            // final shortest path 
    vector<Cell> visitedOrder;    // every cell visited in order, for visualization
    int visitedNodes = 0;
    double timeMs = 0.0;
};

vector<vector<int>> mazeGrid;
Cell startCell;
Cell goalCell;

mt19937 rng((unsigned)chrono::high_resolution_clock::now().time_since_epoch().count());

bool validCell(int x,int y){
    return x>=0 && x<ROWS && y>=0 && y<COLS && mazeGrid[x][y]==0;
}

string loadFile(const string &path){
    ifstream f(path, ios::binary);
    if(!f) return "";
    stringstream ss; ss<<f.rdbuf();
    return ss.str();
}

// Carve a maze with recursive backtracking + a few random openings
void generateMaze(){
    mazeGrid.assign(ROWS, vector<int>(COLS,1));
    startCell = {1,1};
    goalCell = {ROWS-2, COLS-2};

    auto carve = [&](auto&& self, int x, int y)->void{
        mazeGrid[x][y] = 0;
        int DX[4] = {1,-1,0,0};
        int DY[4] = {0,0,1,-1};
        vector<int> dirs = {0,1,2,3};
        shuffle(dirs.begin(), dirs.end(), rng);
        for(int d: dirs){
            int nx = x + DX[d]*2;
            int ny = y + DY[d]*2;
            if(nx>0 && nx<ROWS-1 && ny>0 && ny<COLS-1 && mazeGrid[nx][ny]==1){
                mazeGrid[x+DX[d]][y+DY[d]] = 0;
                self(self, nx, ny);
            }
        }
    };

    carve(carve, startCell.x, startCell.y); // start carving from the entrance
    mazeGrid[startCell.x][startCell.y] = 0;
    mazeGrid[goalCell.x][goalCell.y] = 0;

    uniform_real_distribution<double> prob(0.0, 1.0);
    for(int i=1;i<ROWS-1;i++){
        for(int j=1;j<COLS-1;j++){
            if(mazeGrid[i][j] != 1) continue; // only consider walls

            bool horizSep = (mazeGrid[i][j-1]==0 && mazeGrid[i][j+1]==0);
            bool vertSep  = (mazeGrid[i-1][j]==0 && mazeGrid[i+1][j]==0);

            double p = 0.18; 
            if((horizSep || vertSep) && prob(rng) < p){
                mazeGrid[i][j] = 0;
            }
        }
    }
}

// Breadth-First Search: guarantees shortest path in unweighted grid
SolveResult solveBFS(){
    SolveResult res;
    auto t1 = chrono::high_resolution_clock::now();

    queue<Cell> q;
    map<pair<int,int>, pair<int,int>> parent;
    set<pair<int,int>> visited;

    q.push(startCell);
    parent[{startCell.x,startCell.y}] = {-1,-1};
    visited.insert({startCell.x,startCell.y});
    res.visitedOrder.push_back(startCell);  // track visit order

    int DX[4] = {1,-1,0,0};
    int DY[4] = {0,0,1,-1};

    while(!q.empty()){
        Cell cur = q.front(); q.pop();
        res.visitedNodes++;

        if(cur.x==goalCell.x && cur.y==goalCell.y){
            // reconstruct shortest path by walking parents backward
            vector<Cell> path;
            pair<int,int> p = {cur.x,cur.y};
            while(p.first != -1){
                path.push_back(Cell(p.first,p.second));
                p = parent[p];
            }
            reverse(path.begin(), path.end());
            res.path = path;
            break;
        }

        for(int i=0;i<4;i++){
            int nx = cur.x + DX[i];
            int ny = cur.y + DY[i];
            if(validCell(nx,ny) && !visited.count({nx,ny})){
                visited.insert({nx,ny});
                parent[{nx,ny}] = {cur.x,cur.y};
                q.push(Cell(nx,ny));
                res.visitedOrder.push_back(Cell(nx,ny));  // track visit order
            }
        }
    }

    auto t2 = chrono::high_resolution_clock::now();
    res.timeMs = chrono::duration<double, milli>(t2 - t1).count();
    return res;
}

// A*: uses Manhattan heuristic to explore toward the goal faster
SolveResult solveAStar(){
    SolveResult res;
    auto t1 = chrono::high_resolution_clock::now();

    auto h = [&](int x,int y){
        return abs(x - goalCell.x) + abs(y - goalCell.y);
    };

    using Node = tuple<int,int,int,int>; // f,g,x,y
    priority_queue<Node, vector<Node>, greater<Node>> pq;
    map<pair<int,int>, int> gscore;
    map<pair<int,int>, pair<int,int>> parent;
    set<pair<int,int>> visited;

    pq.push({h(startCell.x,startCell.y), 0, startCell.x, startCell.y});
    gscore[{startCell.x,startCell.y}] = 0;
    parent[{startCell.x,startCell.y}] = {-1,-1};

    int DX[4] = {1,-1,0,0};
    int DY[4] = {0,0,1,-1};

    while(!pq.empty()){
        auto [f,g,x,y] = pq.top(); pq.pop();
        if(visited.count({x,y})) continue;
        visited.insert({x,y});
        res.visitedOrder.push_back(Cell(x,y));  // track visit order
        res.visitedNodes++;

        if(x==goalCell.x && y==goalCell.y){
            vector<Cell> path;
            pair<int,int> p = {x,y};
            while(p.first != -1){
                path.push_back(Cell(p.first,p.second));
                p = parent[p];
            }
            reverse(path.begin(), path.end());
            res.path = path;
            break;
        }

        for(int i=0;i<4;i++){
            int nx = x + DX[i];
            int ny = y + DY[i];
            if(!validCell(nx,ny)) continue;
            int ng = g + 1;
            if(!gscore.count({nx,ny}) || ng < gscore[{nx,ny}]){
                gscore[{nx,ny}] = ng;
                parent[{nx,ny}] = {x,y};
                pq.push({ng + h(nx,ny), ng, nx, ny});
            }
        }
    }

    auto t2 = chrono::high_resolution_clock::now();
    res.timeMs = chrono::duration<double, milli>(t2 - t1).count();
    return res;
}

// JSON builder
string buildStateJson(const vector<Cell>* path=nullptr, const SolveResult* s=nullptr){
    stringstream ss;
    ss << "{";
    ss << "\"rows\":"<<ROWS<<",\"cols\":"<<COLS<<",";
    ss << "\"maze\":[";
    for(int i=0;i<ROWS;i++){
        ss<<"[";
        for(int j=0;j<COLS;j++){
            ss<<mazeGrid[i][j];
            if(j+1<COLS) ss<<",";
        }
        ss<<"]";
        if(i+1<ROWS) ss<<",";
    }
    ss<<"],";
    ss<<"\"start\":{\"x\":"<<startCell.x<<",\"y\":"<<startCell.y<<"},";
    ss<<"\"goal\":{\"x\":"<<goalCell.x<<",\"y\":"<<goalCell.y<<"}";
    if(path && !path->empty()){
        ss<<",\"path\":[";
        for(size_t i=0;i<path->size();++i){
            ss<<"{\"x\":"<<(*path)[i].x<<",\"y\":"<<(*path)[i].y<<"}";
            if(i+1<path->size()) ss<<",";
        }
        ss<<"]";
    }
    if(s){
        ss<<",\"visitedNodes\":"<<s->visitedNodes;
        ss<<",\"timeMs\":"<<s->timeMs;
        ss<<",\"pathLength\":"<<(path?path->size():0);
        // Add visited order for visualization
        if(!s->visitedOrder.empty()){
            ss<<",\"visitedOrder\":[";
            for(size_t i=0;i<s->visitedOrder.size();++i){
                ss<<"{\"x\":"<<s->visitedOrder[i].x<<",\"y\":"<<s->visitedOrder[i].y<<"}";
                if(i+1<s->visitedOrder.size()) ss<<",";
            }
            ss<<"]";
        }
    }
    ss << "}";
    return ss.str();
}

void sendHttp(SOCKET client, const string &content, const string &type="text/html"){
    string header =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: " + type + "\r\n"
        "Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n"
        "Pragma: no-cache\r\n"
        "Expires: 0\r\n"
        "Connection: close\r\n\r\n";
    string resp = header + content;
    send(client, resp.c_str(), (int)resp.size(), 0);
}

void handleClient(SOCKET client){
    char buf[8192]; memset(buf,0,sizeof(buf));
    int n = recv(client, buf, sizeof(buf)-1, 0);
    if(n<=0){ closesocket(client); return;}
    string req(buf);

    if(req.find("GET / ") == 0 || req.find("GET /index") == 0){
        string html = loadFile(string(WEBROOT) + "index.html");
        if(html.empty()) html = "<h1>index.html missing</h1>";
        sendHttp(client, html, "text/html");
    }
    else if(req.find("GET /styles.css") == 0){
        string css = loadFile(string(WEBROOT) + "styles.css");
        sendHttp(client, css, "text/css");
    }
    else if(req.find("GET /script.js") == 0){
        string js = loadFile(string(WEBROOT) + "script.js");
        sendHttp(client, js, "application/javascript");
    }
    else if(req.find("GET /api/generate") == 0){
        generateMaze();
        string json = buildStateJson();
        sendHttp(client, json, "application/json");
    }
    else if(req.find("GET /api/solve/BFS") != string::npos){
        SolveResult r = solveBFS();
        sendHttp(client, buildStateJson(&r.path, &r), "application/json");
    }
    else if(req.find("GET /api/solve/AStar") != string::npos){
        SolveResult r = solveAStar();
        sendHttp(client, buildStateJson(&r.path, &r), "application/json");
    }
    else {
        sendHttp(client, "<h1>404 Not Found</h1>", "text/html");
    }

    closesocket(client);
}

int main(){
    WSADATA ws;
    if(WSAStartup(MAKEWORD(2,2), &ws) != 0){ cerr<<"WSAStartup failed\n"; return 1; }

    SOCKET serverSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if(serverSock == INVALID_SOCKET){ cerr<<"Socket creation failed\n"; WSACleanup(); return 1; }

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(SERVER_PORT);
    addr.sin_addr.s_addr = INADDR_ANY;

    if(bind(serverSock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR){
        cerr<<"Bind failed on port "<<SERVER_PORT<<"\n"; closesocket(serverSock); WSACleanup(); return 1;
    }
    if(listen(serverSock, SOMAXCONN) == SOCKET_ERROR){
        cerr<<"Listen failed\n"; closesocket(serverSock); WSACleanup(); return 1;
    }

    // initialize maze at server start
    generateMaze();

    cout << "  Escape The Grid \n";
    cout << "  Open: http://localhost:" << SERVER_PORT << "/\n";

    while(true){
        SOCKET client = accept(serverSock, NULL, NULL);
        if(client != INVALID_SOCKET) handleClient(client);
    }

    closesocket(serverSock);
    WSACleanup();
    return 0;
}
