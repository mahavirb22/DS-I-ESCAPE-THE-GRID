# Escape The Grid

A lightweight C++ web server that serves a visual comparison of BFS and A* pathfinding on a generated grid. The maze is intentionally loopy (multiple paths) so A* can show its efficiency vs BFS.

## Features
- Multi-path maze generation (loops added to a DFS-carved maze)
- Side-by-side BFS and A* canvases with animated paths
- Live stats: time (ms), visited nodes, path length
- Winner logic: fewer visited wins (tie-break by time); fastest badge by time
- Run Log panel with step-by-step messages
- Stop button to cancel animations

## Build & Run (Windows PowerShell)
```powershell
<<<<<<< HEAD
cd "d:\VIT\3-SEM\DS-I\DS_CP_FINAL\EscapeTheGrid"
=======
cd "D:\EscapeTheGrid"
>>>>>>> 469ce398b040d0e09beaef059fff1e8cc6ca8358
g++ server.cpp -o server.exe -lws2_32
./server.exe
```
Open `http://localhost:8081/` in your browser.

## Usage
- Click "Generate Maze" to create a new loopy grid.
- Click "Start" to run both algorithms and watch the animations.
- Read details and winner in the Run Log at the bottom.
- Click "Stop" to stop animations.

## Notes
- BFS finds a shortest path but explores broadly.
- A* (Manhattan heuristic) finds a shortest path and usually explores fewer nodes on loopy grids.
