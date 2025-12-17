// script.js
const API = {
  generate: "/api/generate",
  solve: name => `/api/solve/${name}`
};

const algos = [
  { id: "bfs", name: "BFS", color: "#00A5FF", canvasId: "canvas-bfs", cardId: "card-bfs", timeId: "time-bfs", visitedId: "visited-bfs", pathId: "path-bfs", badgeId: "badge-bfs", glowClass: "canvas-glow-bfs" },
  { id: "astar", name: "AStar", color: "#9D4EDD", canvasId: "canvas-astar", cardId: "card-astar", timeId: "time-astar", visitedId: "visited-astar", pathId: "path-astar", badgeId: "badge-astar", glowClass: "canvas-glow-astar" }
];

let baseState = null;
let canvases = {};
let pathOrders = {};
let tracers = {};  // motion tracer per algorithm
let runResults = {}; // hold last run results per algo
let explorationTracers = {}; // NEW: for showing exploration process

// log helpers
const logEl = () => document.getElementById("log");
const winnerEl = () => document.getElementById("winner");
function ts(){
  const d = new Date();
  return d.toLocaleTimeString();
}
function appendLog(message){
  const el = logEl();
  if(!el) return;
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="ts">[${ts()}]</span>${message}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}
function clearLog(){
  const el = logEl();
  const w = winnerEl();
  if(el) el.innerHTML = '';
  if(w) w.textContent = '';
}

// Init canvases
algos.forEach(a => {
  const c = document.getElementById(a.canvasId);
  canvases[a.id] = { canvas: c, ctx: c.getContext("2d"), path: [], animReq: null, visitedOrder: [] };
  pathOrders[a.id] = new Map();
  tracers[a.id] = { index: 0, active: false }; // tracer setup
  explorationTracers[a.id] = { index: 0, active: false, phase: 'exploration' }; // exploration phase
});

function drawBaseOn(ctx, state) {
  const rows = state.rows, cols = state.cols;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const cellSize = Math.min(w/cols, h/rows);

  ctx.clearRect(0,0,w,h);

  for (let r=0; r<rows; r++){
    for (let c=0; c<cols; c++){
      const col = state.maze[r][c]===1 ? "#e6eefc" : "#ffffff";
      ctx.fillStyle = col;
      ctx.fillRect(c*cellSize, r*cellSize, cellSize-1, cellSize-1);
    }
  }

  // Start (green)
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(state.start.y*cellSize, state.start.x*cellSize, cellSize-1, cellSize-1);

  // Goal (red)
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(state.goal.y*cellSize, state.goal.x*cellSize, cellSize-1, cellSize-1);
}

// Draw tracer + partial path + animation wave
function drawAnimated(ctx, state, path, algoId, color) {
  if (!state) return;

  const rows = state.rows, cols = state.cols;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const cellSize = Math.min(w/cols, h/rows);

  drawBaseOn(ctx, state);

  const orderMap = pathOrders[algoId];
  const tracer = explorationTracers[algoId];
  const visitedOrder = canvases[algoId].visitedOrder || [];

  const now = Date.now();

  // Phase 1: Show exploration (visited cells)
  if (tracer.phase === 'exploration') {
    // Draw all explored cells up to current index
    for (let i = 0; i < tracer.index && i < visitedOrder.length; i++) {
      const cell = visitedOrder[i];
      
      // Light color for explored cells
      const rgb = hexToRgb(color);
      const fadeAmount = 0.3; // lighter shade for exploration
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${fadeAmount})`;
      ctx.fillRect(cell.y * cellSize, cell.x * cellSize, cellSize - 1, cellSize - 1);
    }

    // Current exploring cell (brighter)
    if (tracer.index < visitedOrder.length) {
      const cell = visitedOrder[tracer.index];
      const rgb = hexToRgb(color);
      
      // Pulse effect on current cell
      const pulse = Math.sin(now / 100) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${pulse})`;
      ctx.fillRect(cell.y * cellSize, cell.x * cellSize, cellSize - 1, cellSize - 1);

      // Add a glowing border around current cell
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.y * cellSize, cell.x * cellSize, cellSize - 1, cellSize - 1);
    }
  } 
  // Phase 2: Show final path
  else if (tracer.phase === 'path') {
    // Draw all explored cells (faded)
    for (let i = 0; i < visitedOrder.length; i++) {
      const cell = visitedOrder[i];
      const rgb = hexToRgb(color);
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
      ctx.fillRect(cell.y * cellSize, cell.x * cellSize, cellSize - 1, cellSize - 1);
    }

    // Draw completed part of path (bold)
    for (let i = 0; i < tracer.index && i < path.length; i++) {
      const p = path[i];
      const ord = orderMap.get(`${p.x},${p.y}`) || i;
      const pulse = Math.sin(now/120 + ord/3) * 25;
      const rgb = hexToRgb(color);

      const r = clamp(rgb.r + pulse, 0, 255);
      const g = clamp(rgb.g + pulse, 0, 255);
      const b = clamp(rgb.b, 0, 255);

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(p.y * cellSize, p.x * cellSize, cellSize - 1, cellSize - 1);
    }

    // Draw moving tracer on path (yellow dot)
    if (tracer.active && tracer.index < path.length) {
      const p = path[tracer.index];

      ctx.beginPath();
      ctx.arc(
        p.y * cellSize + cellSize/2,
        p.x * cellSize + cellSize/2,
        cellSize * 0.25,
        0, Math.PI*2
      );
      ctx.fillStyle = "#facc15";
      ctx.fill();
    }
  }
}

function hexToRgb(hex){
  hex = hex.replace("#","");
  const bigint = parseInt(hex,16);
  return { r:(bigint>>16)&255, g:(bigint>>8)&255, b:bigint&255 };
}
function clamp(v,a,b){ return v<a?a: (v>b?b:v); }

async function generateMaze(){
  try{
    const res = await fetch(API.generate);
    const data = await res.json();
    baseState = data;

    algos.forEach(a=>{
      const ctx = canvases[a.id].ctx;
      drawBaseOn(ctx, baseState);
      document.getElementById(a.timeId).innerText = "-";
      document.getElementById(a.visitedId).innerText = "-";
      document.getElementById(a.pathId).innerText = "-";
      document.getElementById(a.badgeId).innerText = "";
      tracers[a.id] = {index:0, active:false};
      explorationTracers[a.id] = {index:0, active:false, phase:'exploration'};
      canvases[a.id].visitedOrder = [];
    });

    showNotify("New maze generated");
    appendLog(`Maze generated: ${baseState.rows}x${baseState.cols} with multiple paths`);
  }catch(e){
    console.log(e);
    showNotify("Server offline?");
    appendLog("Error: could not generate maze (server offline?)");
  }
}

async function startAll(){
  if(!baseState){ showNotify("Generate maze first"); return; }

  // disable Start during run
  const startBtn = document.getElementById("startBtn");
  if(startBtn){ 
    startBtn.disabled = true; 
    startBtn.classList.add("disabled"); 
  }

  // reset stop/resume buttons
  const stopBtn = document.getElementById("stopBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  if(stopBtn) stopBtn.style.display = "inline-block";
  if(resumeBtn) resumeBtn.style.display = "none";

  algos.forEach(a=>{
    const tEl = document.getElementById(a.timeId);
    const vEl = document.getElementById(a.visitedId);
    const pEl = document.getElementById(a.pathId);
    const bEl = document.getElementById(a.badgeId);
    if(tEl) tEl.innerText = "...";
    if(vEl) vEl.innerText = "...";
    if(pEl) pEl.innerText = "...";
    if(bEl) bEl.innerText = "";
  });

  // remove winner glow
  algos.forEach(a=>{
    document.getElementById(a.cardId).classList.remove('winner-glow');
  });

  appendLog("Run started: BFS vs A* on current maze");

  const calls = [
    fetch(API.solve("BFS")).then(r=>r.json()).then(d=>({algo:"bfs",data:d})),
    fetch(API.solve("AStar")).then(r=>r.json()).then(d=>({algo:"astar",data:d}))
  ];

  let results = [];
  try{
    results = await Promise.all(calls);
  }catch(e){
    appendLog("Error running algorithms");
    showNotify("Error running algorithms");
  }
  if(results.length !== 2){
    if(startBtn){ 
      startBtn.disabled = false; 
      startBtn.classList.remove("disabled"); 
    }
    return;
  }

  // Determine fastest by time
  const times = results.map(r => ({algo:r.algo, time:r.data.timeMs||1e9}));
  times.sort((a,b)=>a.time-b.time);
  const fastest = times[0].algo;

  // Apply each result to UI
  results.forEach(res=>{
    const spec = algos.find(a=>a.id===res.algo);
    const ctx = canvases[spec.id].ctx;
    const path = res.data.path || [];
    const visitedOrder = res.data.visitedOrder || [];

    // Save path and visited order
    canvases[spec.id].path = path;
    canvases[spec.id].visitedOrder = visitedOrder;
    runResults[spec.id] = res.data || {};

    // Set per-pixel order map
    const orderMap = pathOrders[spec.id];
    orderMap.clear();
    path.forEach((p,i)=> orderMap.set(`${p.x},${p.y}`, i));

    // exploration tracer reset - start with exploration phase
    explorationTracers[spec.id] = { index:0, active:true, phase:'exploration' };

    // Stats
    const timeMs = typeof res.data.timeMs === 'number' ? res.data.timeMs : 0;
    const visited = typeof res.data.visitedNodes === 'number' ? res.data.visitedNodes : 0;
    const pathLen = typeof res.data.pathLength === 'number' ? res.data.pathLength : path.length;

    const tEl = document.getElementById(spec.timeId);
    const vEl = document.getElementById(spec.visitedId);
    const pEl = document.getElementById(spec.pathId);
    const bEl = document.getElementById(spec.badgeId);

    if(tEl) tEl.innerText = timeMs.toFixed(2);
    if(vEl) vEl.innerText = visited;
    if(pEl) pEl.innerText = pathLen;

    if(spec.id === fastest && bEl) {
      bEl.innerText = "Fastest";
    }

    // Glow
    const canvasEl = document.getElementById(spec.canvasId);
    if(canvasEl){
      canvasEl.classList.add(spec.glowClass);
      setTimeout(()=> canvasEl.classList.remove(spec.glowClass), 800);
    }

    // Log each algorithm result
    appendLog(`${spec.name}: visited=${visited}, pathLen=${pathLen}, time=${timeMs.toFixed(2)}ms`);
  });

  // Compare and declare winner (fewest visited; tie => faster time)
  const bfs = runResults['bfs'];
  const astar = runResults['astar'];
  if(bfs && astar){
    const bfsVisited = typeof bfs.visitedNodes === 'number' ? bfs.visitedNodes : 0;
    const astVisited = typeof astar.visitedNodes === 'number' ? astar.visitedNodes : 0;
    const bfsTime = typeof bfs.timeMs === 'number' ? bfs.timeMs : 1e9;
    const astTime = typeof astar.timeMs === 'number' ? astar.timeMs : 1e9;
    const bfsLen = typeof bfs.pathLength === 'number' ? bfs.pathLength : (canvases['bfs'].path?.length || 0);
    const astLen = typeof astar.pathLength === 'number' ? astar.pathLength : (canvases['astar'].path?.length || 0);

    let winner = null;
    if(bfsVisited !== astVisited){
      winner = bfsVisited < astVisited ? 'bfs' : 'astar';
    } else {
      winner = bfsTime <= astTime ? 'bfs' : 'astar';
    }
    const wSpec = algos.find(a=>a.id===winner);
    if(wSpec){
      const badgeEl = document.getElementById(wSpec.badgeId);
      if(badgeEl){
        badgeEl.innerText = (badgeEl.innerText ? `${badgeEl.innerText} · ` : "") + "Winner";
      }
      const cardEl = document.getElementById(wSpec.cardId);
      if(cardEl) cardEl.classList.add('winner-glow');
      const sameLen = (bfsLen === astLen) ? `Both shortest path length = ${bfsLen}` : `BFS=${bfsLen}, A*=${astLen}`;
      const text = `Winner: ${wSpec.name} (visited: BFS ${bfsVisited} vs A* ${astVisited}; time: BFS ${bfsTime.toFixed(2)}ms vs A* ${astTime.toFixed(2)}ms). ${sameLen}.`;
      const wEl = winnerEl();
      if(wEl) wEl.textContent = text;
      appendLog(text);
    }
  }

  // Start animation loops
  algos.forEach(a=>{
    const loop = ()=>{
      const ctx = canvases[a.id].ctx;
      const path = canvases[a.id].path;
      const visitedOrder = canvases[a.id].visitedOrder;
      const tracer = explorationTracers[a.id];

      if(tracer.active){
        // Phase 1: Exploration animation
        if(tracer.phase === 'exploration'){
          tracer.index += 1;
          if(tracer.index >= visitedOrder.length){
            // Switch to path phase after exploration
            tracer.phase = 'path';
            tracer.index = 0;
            appendLog(`${a.name}: Exploration complete, showing optimal path...`);
          }
        }
        // Phase 2: Path animation
        else if(tracer.phase === 'path'){
          tracer.index += 1;
          if(tracer.index >= path.length){
            tracer.index = Math.max(0, path.length - 1);
            tracer.active = false;
          }
        }
      }

      drawAnimated(ctx, baseState, path, a.id, a.color);
      canvases[a.id].animReq = requestAnimationFrame(loop);
    };
    if(canvases[a.id].animReq) cancelAnimationFrame(canvases[a.id].animReq);
    loop();
  });

  showNotify("Algorithms Running...");

  // re-enable Start shortly after animations begin
  setTimeout(()=>{ 
    if(startBtn){ 
      startBtn.disabled = false; 
      startBtn.classList.remove("disabled"); 
    } 
  }, 500);
}

function showNotify(msg, t=1000){
  const n = document.getElementById("notify");
  n.innerText = msg;
  n.style.display="block";
  setTimeout(()=>n.style.display="none", t);
}

document.getElementById("genBtn").addEventListener("click", generateMaze);
document.getElementById("startBtn").addEventListener("click", startAll);
const clrBtn = document.getElementById("clearLogBtn");
if(clrBtn){ clrBtn.addEventListener("click", clearLog); }

// Stop control: pause animations
const stopBtn = document.getElementById("stopBtn");
const resumeBtn = document.getElementById("resumeBtn");
if(stopBtn){
  stopBtn.addEventListener("click", ()=>{
    algos.forEach(a=>{
      const req = canvases[a.id].animReq;
      if(req) cancelAnimationFrame(req);
      canvases[a.id].animReq = null;
      explorationTracers[a.id].active = false; // pause, don't reset
    });
    showNotify("Animations paused", 1500);
    appendLog("Animations paused by user");
    if(stopBtn) stopBtn.style.display = "none";
    if(resumeBtn) resumeBtn.style.display = "inline-block";
  });
}

// Resume control: continue animations from current state
if(resumeBtn){
  resumeBtn.addEventListener("click", ()=>{
    algos.forEach(a=>{
      const tracer = explorationTracers[a.id];
      const path = canvases[a.id].path;
      const visitedOrder = canvases[a.id].visitedOrder;
      
      // Check if there's more to animate
      const hasMoreExploration = tracer.phase === 'exploration' && tracer.index < visitedOrder.length;
      const hasMorePath = tracer.phase === 'path' && tracer.index < path.length - 1;
      
      if(hasMoreExploration || hasMorePath){
        tracer.active = true; // resume
        const loop = ()=>{
          const ctx = canvases[a.id].ctx;
          
          if(tracer.active){
            // Phase 1: Exploration animation
            if(tracer.phase === 'exploration'){
              tracer.index += 1;
              if(tracer.index >= visitedOrder.length){
                tracer.phase = 'path';
                tracer.index = 0;
              }
            }
            // Phase 2: Path animation
            else if(tracer.phase === 'path'){
              tracer.index += 1;
              if(tracer.index >= path.length){
                tracer.index = Math.max(0, path.length - 1);
                tracer.active = false;
              }
            }
          }
          
          drawAnimated(ctx, baseState, path, a.id, a.color);
          canvases[a.id].animReq = requestAnimationFrame(loop);
        };
        if(canvases[a.id].animReq) cancelAnimationFrame(canvases[a.id].animReq);
        loop();
      }
    });
    showNotify("Animations resumed", 1500);
    appendLog("Animations resumed");
    if(stopBtn) stopBtn.style.display = "inline-block";
    if(resumeBtn) resumeBtn.style.display = "none";
  });
}
 
 window.addEventListener("load", generateMaze);