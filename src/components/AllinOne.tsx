import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
  Suspense,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  Sky,
  PointerLockControls,
  useGLTF,
  useAnimations,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import { create } from "zustand";

/* ---------------- Audio manager (unchanged logic but concise) */
type WeaponId = "AKM" | "M416" | "AWM";
type ScopeId = "redDot" | "2x" | "3x" | "4x" | "6x" | "8x";
type TeamId = "red" | "blue";
type PreferredTeam = "auto" | TeamId;
class GunSoundManager {
  fire: Partial<Record<WeaponId, HTMLAudioElement>> = {};
  reload: Partial<Record<WeaponId, HTMLAudioElement>> = {};
  empty: Partial<Record<WeaponId, HTMLAudioElement>> = {};
  hitEnemy?: HTMLAudioElement;
  hitPlayer?: HTMLAudioElement;
  initialized = false;
  currentWeapon: WeaponId | null = null;
  isFiring = false;
  ensureInit() {
    if (this.initialized || typeof Audio === "undefined") return;
    const make = (src: string, loop = false) => {
      const a = new Audio(src);
      a.loop = loop;
      a.volume = 0.6;
      return a;
    };
    this.fire.AKM = make("/audio/awm_fire.mp3", true);
    this.fire.M416 = make("/audio/m416_fire.mp3", true);
    this.fire.AWM = make("/audio/awm_fire.mp3", false);
    this.reload.AKM = make("/audio/akm_reload.mp3");
    this.reload.M416 = make("/audio/m416_reload.mp3");
    this.reload.AWM = make("/audio/awm_reload.mp3");
    this.empty.AKM = make("/audio/akm_empty.mp3");
    this.empty.M416 = make("/audio/m416_empty.mp3");
    this.empty.AWM = make("/audio/awm_empty.mp3");
    this.hitEnemy = make("/audio/bullet_hit_enemy.mp3");
    this.hitPlayer = make("/audio/bullet_hit_player.mp3");
    this.initialized = true;
  }
  startFire(weapon: WeaponId) {
    this.ensureInit();
    const a = this.fire[weapon];
    if (!a) return;
    if (this.currentWeapon !== weapon || !this.isFiring) {
      this.stopFire();
      a.currentTime = 0;
      a.play().catch(()=>{});
      this.currentWeapon = weapon;
      this.isFiring = true;
    }
  }
  stopFire() {
    this.ensureInit();
    Object.values(this.fire).forEach(a=>{ if(a){ a.pause(); a.currentTime = 0;} });
    this.isFiring = false;
    this.currentWeapon = null;
  }
  playReload(w: WeaponId){ this.ensureInit(); const a=this.reload[w]; if(a){ a.pause(); a.currentTime=0; a.play().catch(()=>{});} }
  playEmpty(w: WeaponId){ this.ensureInit(); const a=this.empty[w]; if(a){ a.pause(); a.currentTime=0; a.play().catch(()=>{});} }
  playHitEnemy(){ this.ensureInit(); if(this.hitEnemy){ this.hitEnemy.pause(); this.hitEnemy.currentTime=0; this.hitEnemy.play().catch(()=>{}); } }
  playHitPlayer(){ this.ensureInit(); if(this.hitPlayer){ this.hitPlayer.pause(); this.hitPlayer.currentTime=0; this.hitPlayer.play().catch(()=>{}); } }
  dispose(){ this.stopFire(); }
}
const gunSoundManager = new GunSoundManager();

/* ---------------- types & constants ---------------- */
type CameraView = "fps" | "tps" | "topdown";
type EnemyWeapon = "knife" | "gun";
type Bullet = { id: string; position: THREE.Vector3; velocity: THREE.Vector3; fromEnemy: boolean; damage: number; };
type GameState = {
  running: boolean; playerHP:number; maxHP:number; currentWeapon:WeaponId; ammo: Record<string, number>;
  kills:number; totalEnemies:number; selectedMap:string; cameraView:CameraView;
  gamePhase: "menu" | "playing" | "victory" | "gameOver";
  isScoped:boolean; selectedScope:ScopeId; infiniteLives:boolean; gameMode: "ai" | "mp";
  playerName:string; preferredTeam:PreferredTeam; playerSlot: "P1" | "P2" | null;
  roomId?: string | null; isHost?: boolean; playersInRoom?: number;
};
interface GameStore extends GameState {
  setPlayerHP:(hp:number)=>void; setGameMode:(m:"ai"|"mp")=>void; setCurrentWeapon:(w:WeaponId)=>void;
  setAmmo:(w:string,a:number)=>void; decrementAmmo:(w:string)=>void; incrementKills:()=>void;
  setCameraView:(v:CameraView)=>void; setGamePhase:(p:GameState["gamePhase"])=>void;
  toggleScope:()=>void; setScope:(s:ScopeId)=>void; resetGame:()=>void; damagePlayer:(n:number)=>void; setInfiniteLives:(b:boolean)=>void;
  setPlayerName:(n:string)=>void; setPreferredTeam:(t:PreferredTeam)=>void; setPlayerSlot:(s:"P1"|"P2"|null)=>void;
  setRoomInfo:(roomId:string|null,isHost:boolean,players:number)=>void;
}
const MAX_AMMO: Record<string,number> = { AKM:30, M416:40, AWM:5 };
const ALLOWED_SCOPES: Record<WeaponId, ScopeId[]> = { AKM:["redDot","2x","3x","4x"], M416:["redDot","2x","3x","4x","6x"], AWM:["4x","6x","8x"]};
const BASE_FOV = 70;
const SCOPE_FOV: Record<ScopeId, number> = { redDot:70, "2x":58, "3x":50, "4x":42, "6x":32, "8x":24 };
const PLAYER_HEIGHT = 1.8;
const EYE = 2.1;

/* ----------------- Zustand store (compact) ----------------- */
const useGameStore = create<GameStore>((set, get) => ({
  running:true, playerHP:100, maxHP:100, currentWeapon:"AKM", ammo:{AKM:30,M416:40,AWM:5},
  kills:0, totalEnemies:8, selectedMap:"warehouse", cameraView:"fps",
  gamePhase:"menu", isScoped:false, selectedScope:"redDot", infiniteLives:false, gameMode:"ai",
  playerName:"Player", preferredTeam:"auto", playerSlot:null, roomId:null, isHost:false, playersInRoom:0,

  setGameMode:(mode)=>set({gameMode:mode}),
  setPlayerHP:(hp)=>set({playerHP:hp}),
  setCurrentWeapon:(w)=>set({currentWeapon:w, isScoped:false}),
  setAmmo:(w,a)=>set((s)=>({ammo:{...s.ammo,[w]:a}})),
  decrementAmmo:(w)=>set((s)=>({ammo:{...s.ammo,[w]:Math.max(0,(s.ammo as any)[w]-1)}})),
  incrementKills:()=>set((s)=>{ const nk=s.kills+1; return {kills:nk, gamePhase: nk>=s.totalEnemies ? "victory" : s.gamePhase}; }),
  setCameraView:(v)=>set({cameraView:v, isScoped:false}),
  setGamePhase:(p)=>set({gamePhase:p}),
  toggleScope:()=>set((s)=>({isScoped:!s.isScoped})),
  setScope:(sc)=>set({selectedScope:sc, isScoped:true}),
  resetGame:()=> set((s)=>({ running:true, playerHP:100, maxHP:100, currentWeapon:"AKM", ammo:{AKM:30,M416:40,AWM:5}, kills:0, totalEnemies:8, cameraView:"fps", gamePhase:"playing", isScoped:false, selectedScope:"redDot", infiniteLives:s.infiniteLives, selectedMap:s.selectedMap })),
  damagePlayer:(amount)=> set((s)=>{ if(s.infiniteLives) return s; const newHP=Math.max(0,s.playerHP-amount); if(newHP<=0) return {playerHP:0, gamePhase:"gameOver"}; return {playerHP:newHP}; }),
  setInfiniteLives:(b)=>set({infiniteLives:b}),
  setPlayerName:(n)=>set({playerName:n && n.trim() ? n.trim() :"Player"}),
  setPreferredTeam:(t)=>set({preferredTeam:t}),
  setPlayerSlot:(slot)=>set({playerSlot:slot}),
  setRoomInfo:(roomId,isHost,players)=>set({roomId, isHost, playersInRoom:players})
}));

/* ----------------- WorldContext (colliders, enemies, bullets) ----------------- */
type AABB = { min: THREE.Vector3; max: THREE.Vector3 };
type EnemyHandle = { id:string; mesh: THREE.Object3D; position: THREE.Vector3; getHealth:()=>number; setHealth:(v:number)=>void; isAlive:()=>boolean; weapon:EnemyWeapon; };
type WorldCtx = {
  colliders: React.MutableRefObject<AABB[]>;
  registerEnemy: (h:EnemyHandle)=>void;
  unregisterEnemy: (id:string)=>void;
  enemies: React.MutableRefObject<Map<string,EnemyHandle>>;
  getPlayerPosition: ()=>THREE.Vector3;
  bullets: React.MutableRefObject<Bullet[]>;
  addBullet: (b:Bullet)=>void;
  checkCollision: (pos:THREE.Vector3, radius:number)=>boolean;
  getGroundHeightAt: (x:number,z:number,radius:number)=>number;
};
const WorldContext = createContext<WorldCtx | null>(null);
export const useWorld = () => { const v=useContext(WorldContext); if(!v) throw new Error("useWorld must be inside WorldProvider"); return v; };

const WorldProvider: React.FC<React.PropsWithChildren> = ({children})=>{
  const colliders = useRef<AABB[]>([]);
  const enemies = useRef<Map<string,EnemyHandle>>(new Map());
  const playerPosRef = useRef(new THREE.Vector3(0, EYE, 5));
  const bullets = useRef<Bullet[]>([]);

  const registerEnemy = (h:EnemyHandle)=> enemies.current.set(h.id,h);
  const unregisterEnemy = (id:string)=> enemies.current.delete(id);
  const getPlayerPosition = ()=> playerPosRef.current;
  const addBullet = (b:Bullet)=> bullets.current.push(b);
  const checkCollision = (pos:THREE.Vector3, radius:number)=>{
    for(const box of colliders.current){
      const closestX = Math.max(box.min.x, Math.min(pos.x, box.max.x));
      const closestY = Math.max(box.min.y, Math.min(pos.y, box.max.y));
      const closestZ = Math.max(box.min.z, Math.min(pos.z, box.max.z));
      const dx = pos.x - closestX, dy = pos.y - closestY, dz = pos.z - closestZ;
      if(dx*dx+dy*dy+dz*dz < radius*radius) return true;
    }
    return false;
  };
  const getGroundHeightAt = (x:number,z:number,radius:number)=>{
    let ground=0;
    for(const box of colliders.current){
      const insideX = x>=box.min.x-radius && x<=box.max.x+radius;
      const insideZ = z>=box.min.z-radius && z<=box.max.z+radius;
      if(insideX && insideZ) if(box.max.y>ground) ground=box.max.y;
    }
    return ground;
  };

  return (
    <WorldContext.Provider value={{ colliders, enemies, registerEnemy, unregisterEnemy, getPlayerPosition, bullets, addBullet, checkCollision, getGroundHeightAt }}>
      <PlayerPositionSync playerPosRef={playerPosRef} />
      {children}
    </WorldContext.Provider>
  );
};

function PlayerPositionSync({playerPosRef}:{playerPosRef:React.MutableRefObject<THREE.Vector3>}){
  const syncRef = useRef<THREE.Vector3 | null>(null);
  useEffect(()=>{ syncRef.current = playerPosRef.current; }, [playerPosRef]);
  return null;
}

/* ---------------- small helpers ---------------- */
const CONTAINER_HEIGHT = EYE * 3;
const CONTAINER_WIDTH = 4;
const CONTAINER_LENGTH = CONTAINER_WIDTH * 7;
const CONTAINER_POSITIONS: [number,number,number][] = [
  [-20, CONTAINER_HEIGHT/2, -20],
  [20, CONTAINER_HEIGHT/2, -20],
  [-20, CONTAINER_HEIGHT/2, 20],
  [20, CONTAINER_HEIGHT/2, 20],
  [-8, CONTAINER_HEIGHT/2, 0],
  [8, CONTAINER_HEIGHT/2, 0],
];
function getRandomLightColor(){ const colors = ["#72c9ff","#8be3ff","#7fd6f9","#9ad9ff","#b0ecff","#a6d7ff"]; return colors[Math.floor(Math.random()*colors.length)];}

/* ------------------- matchmaking frontend WS helpers (global) ------------------- */
/*
  We expose window.createOrJoin to be invoked from menu UI.
  The server implementation used earlier responds to:
  - create_game -> { type: "room_created", roomId, slot: "P1", players: 1 }
  - join_game -> { type: "joined_room", roomId, slot: "P2", players: 2 }
  - player_joined -> { type: "player_joined", players: N }
  - match_started -> { type: "match_started" }
  - state messages are proxied (type: "state")
*/
if (typeof window !== "undefined") {
  (window as any).MP = {
    ws: null as WebSocket | null,
    roomId: null as string | null,
    slot: null as ("P1"|"P2"|null),
    connect(action:string, roomIdInput?:string) {
      if(this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
      this.ws = new WebSocket("ws://localhost:8005");
      this.ws.onopen = ()=>{
        if(action==="create") this.ws!.send(JSON.stringify({type:"create_game"}));
        if(action==="join") this.ws!.send(JSON.stringify({type:"join_game", roomId: roomIdInput||""}));
      };
      this.ws.onmessage = (e)=>{
        const data = JSON.parse(e.data);
        // propagate into store and DOM status elements
        if(data.type === "room_created"){
          this.roomId = data.roomId;
          this.slot = data.slot;
          useGameStore.getState().setRoomInfo(data.roomId, true, data.players);
          // update small dom status if exists
          const el = document.getElementById("mp-status"); if(el) el.innerText = `Room ${data.roomId} (waiting...)`;
        } else if (data.type === "joined_room"){
          this.roomId = data.roomId; this.slot = data.slot;
          useGameStore.getState().setRoomInfo(data.roomId, false, data.players);
          const el = document.getElementById("mp-status"); if(el) el.innerText = `Joined ${data.roomId} — players: ${data.players}/20`;
        } else if (data.type === "player_joined"){
          useGameStore.getState().setRoomInfo(this.roomId, this.slot==="P1", data.players);
          const el = document.getElementById("mp-status"); if(el) el.innerHTML = `Players: ${data.players}/2` + (this.slot==="P1" ? "<br><button id='start-match-btn'>Start Match</button>":"");
          // attach handler for start button if host
          setTimeout(()=>{ const b = document.getElementById("start-match-btn"); if(b) b.onclick = ()=>{ this.ws!.send(JSON.stringify({type:"start_match"})); } }, 50);
        } else if (data.type === "match_started"){
          // start locally
          useGameStore.getState().setGameMode("mp");
          useGameStore.getState().setGamePhase("playing");
        } else if (data.type === "opponent_left"){
          // notify player and return to menu
          alert("Opponent disconnected. Returning to menu.");
          useGameStore.getState().setGamePhase("menu");
        } else if (data.type === "error"){
          alert("Server: " + (data.message || "error"));
        } else if (data.type === "state"){
          // we'll let the player rig's useMultiplayer handle incoming state by reading window.MP.ws messages directly
        }
      };
      this.ws.onclose = ()=>{ useGameStore.getState().setRoomInfo(null,false,0); const el = document.getElementById("mp-status"); if(el) el.innerText = `Not connected`; };
      this.ws.onerror = (err)=>{ console.error("ws err", err); };
    },
    send(obj:any){
      if(this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
    }
  };
}

/* ---------------- EnemyCharacter (GLTF) ---------------- */
function EnemyCharacter({url, position, rotation, isMoving, isDying, scale=0.52}:{url:string; position:THREE.Vector3; rotation:number; isMoving:boolean; isDying:boolean; scale?:number}){
  const group = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF(url);
  const { actions, mixer } = useAnimations(animations, group);
  useEffect(()=>{
    if(!actions) return;
    const idle = actions["Idle"]||actions["idle"];
    const walk = actions["Walk"]||actions["walk"];
    const death = actions["Death"]||actions["die"];
    if(isDying && death){ walk?.stop(); idle?.stop(); death.reset().fadeIn(0.2).play(); }
    else if(isMoving && walk){ idle?.fadeOut(0.2); walk.reset().fadeIn(0.2).play(); }
    else if(idle){ walk?.fadeOut(0.2); idle.reset().fadeIn(0.2).play(); }
  }, [isMoving, isDying, actions]);
  useFrame((_,delta)=>{ mixer.update(delta); if(group.current){ group.current.position.copy(position); group.current.rotation.set(0, rotation, 0); } });
  return <group ref={group} scale={[scale,scale,scale]}><primitive object={scene} /></group>;
}

/* ---------------- Enemy (AI) - unchanged logic but slightly trimmed ---------------- */
function Enemy({id, start, weapon}:{id:string; start:THREE.Vector3; weapon:EnemyWeapon;}){
  const meshRef = useRef<THREE.Group>(null!);
  const [health, setHealth] = useState(100);
  const [alive, setAlive] = useState(true);
  const [dying, setDying] = useState(false);
  const [showBlood, setShowBlood] = useState(false);
  const { registerEnemy, unregisterEnemy, getPlayerPosition, addBullet, checkCollision, colliders, enemies } = useWorld();
  const damagePlayer = useGameStore(s=>s.damagePlayer);
  const enemyPosition = useRef(start.clone());
  const [isMoving, setIsMoving] = useState(false);
  const lastAttack = useRef(0);
  const lastShot = useRef(0);
  const coverPosition = useRef<THREE.Vector3|null>(null);
  const isInCover = useRef(false);
  const lastCoverCheck = useRef(0);

  useEffect(()=>{
    registerEnemy({
      id, mesh: meshRef.current, position: enemyPosition.current,
      getHealth: ()=>health, setHealth: (v)=>{ setHealth(v); if(v<=0 && !dying){ setDying(true); setShowBlood(true); setTimeout(()=>setAlive(false),2000);} },
      isAlive: ()=>alive && !dying, weapon
    });
    return ()=>unregisterEnemy(id);
  }, [health, alive, dying, id, registerEnemy, unregisterEnemy, weapon]);

  const findNearestCover = (fromPos:THREE.Vector3, targetPos:THREE.Vector3)=>{
    let bestCover:THREE.Vector3|null = null; let bestScore=-Infinity;
    for(const box of colliders.current){
      const positions = [
        new THREE.Vector3((box.min.x+box.max.x)/2, 0, box.min.z-1.5),
        new THREE.Vector3((box.min.x+box.max.x)/2, 0, box.max.z+1.5),
        new THREE.Vector3(box.min.x-1.5, 0, (box.min.z+box.max.z)/2),
        new THREE.Vector3(box.max.x+1.5, 0, (box.min.z+box.max.z)/2),
      ];
      for(const pos of positions){
        if(checkCollision(pos,0.5)) continue;
        const distToEnemy = pos.distanceTo(fromPos);
        const obstacleCenter = new THREE.Vector3((box.min.x+box.max.x)/2,(box.min.y+box.max.y)/2,(box.min.z+box.max.z)/2);
        const toPlayer = new THREE.Vector3().subVectors(targetPos,pos).normalize();
        const toObstacle = new THREE.Vector3().subVectors(obstacleCenter,pos).normalize();
        const coverScore = toPlayer.dot(toObstacle);
        const score = coverScore*10 - distToEnemy*0.1;
        if(score>bestScore && distToEnemy<30){ bestScore=score; bestCover=pos.clone(); }
      }
    }
    return bestCover;
  };

  useFrame((_, dt)=>{
    if(!alive || dying) return;
    const playerPos = getPlayerPosition();
    const dir = new THREE.Vector3().subVectors(playerPos, enemyPosition.current); dir.y = 0;
    const dist = dir.length();
    const now = performance.now();
    let aliveCount = 0; enemies.current.forEach(e=>{ if(e.isAlive()) aliveCount++; });
    const hideEnabled = aliveCount === 1;
    const validatePosition = (pos:THREE.Vector3)=>{
      for(const box of colliders.current){
        const centerX=(box.min.x+box.max.x)/2, centerZ=(box.min.z+box.max.z)/2;
        const distToCollider = Math.sqrt(Math.pow(pos.x-centerX,2)+Math.pow(pos.z-centerZ,2));
        if(distToCollider < 1.5) return false;
      }
      return true;
    };

    if(!validatePosition(enemyPosition.current)){
      const pushDir = dir.clone().normalize();
      enemyPosition.current.addScaledVector(pushDir, 2*dt);
      setIsMoving(true);
    }
    if(now - lastCoverCheck.current > 2000){ lastCoverCheck.current = now; coverPosition.current = findNearestCover(enemyPosition.current, playerPos); }
    if(!hideEnabled && isInCover.current) isInCover.current = false;

    if(weapon === "knife"){
      if(dist>2 && dist<30){
        dir.normalize();
        const perpDir = new THREE.Vector3(-dir.z,0,dir.x);
        const flankAngle = Math.sin(now*0.001)*0.3;
        const moveDir = dir.clone().addScaledVector(perpDir, flankAngle).normalize();
        const moveAmount = Math.min(3.5 * dt, dist);
        const newPos = enemyPosition.current.clone().addScaledVector(moveDir, moveAmount);
        if(!checkCollision(newPos, 0.5) && validatePosition(newPos)){ enemyPosition.current.copy(newPos); setIsMoving(true); }
        else setIsMoving(false);
      } else setIsMoving(false);
      if(dist < 2.5 && now - lastAttack.current > 1000){ lastAttack.current = now; damagePlayer(15); }
    } else {
      const optimalRange = 15;
      if(hideEnabled && health < 40 && coverPosition.current){
        const toCover = new THREE.Vector3().subVectors(coverPosition.current, enemyPosition.current);
        toCover.y = 0; const distToCover = toCover.length();
        if(distToCover > 1){ toCover.normalize(); const moveAmount = Math.min(2.5*dt, distToCover); const newPos = enemyPosition.current.clone().addScaledVector(toCover, moveAmount); if(!checkCollision(newPos,0.5) && validatePosition(newPos)){ enemyPosition.current.copy(newPos); setIsMoving(true); isInCover.current=false; } else setIsMoving(false); }
        else { isInCover.current = true; setIsMoving(false); }
      } else if(dist < 8){ dir.normalize().multiplyScalar(-1); const moveAmount = Math.min(2*dt,5); const newPos = enemyPosition.current.clone().addScaledVector(dir, moveAmount); if(!checkCollision(newPos,0.5) && validatePosition(newPos)){ enemyPosition.current.copy(newPos); setIsMoving(true);} else setIsMoving(false); }
      else if(dist > optimalRange && dist < 30){
        if(hideEnabled && coverPosition.current && dist > 20){ const toCover = new THREE.Vector3().subVectors(coverPosition.current, enemyPosition.current); toCover.y = 0; if(toCover.length()>1){ toCover.normalize(); const moveAmount = Math.min(2*dt, toCover.length()); const newPos = enemyPosition.current.clone().addScaledVector(toCover, moveAmount); if(!checkCollision(newPos,0.5) && validatePosition(newPos)){ enemyPosition.current.copy(newPos); setIsMoving(true);} else setIsMoving(false); } }
        else { dir.normalize(); const moveAmount = Math.min(2*dt, dist - optimalRange); const newPos = enemyPosition.current.clone().addScaledVector(dir, moveAmount); if(!checkCollision(newPos,0.5) && validatePosition(newPos)){ enemyPosition.current.copy(newPos); setIsMoving(true);} else setIsMoving(false); }
      } else setIsMoving(false);

      if(dist < 30 && dist > 3 && now - lastShot.current > (isInCover.current ? 2000 : 1200)){
        lastShot.current = now;
        const accuracy = isMoving ? 0.95 : 0.98;
        const spread = (1 - accuracy) * 2;
        const bulletDir = dir.clone().normalize();
        bulletDir.x += (Math.random() - 0.5) * spread;
        bulletDir.z += (Math.random() - 0.5) * spread;
        bulletDir.normalize();
        const bulletStart = enemyPosition.current.clone().add(new THREE.Vector3(0,1.2,0));
        addBullet({ id:`enemy-${id}-${now}`, position:bulletStart, velocity:bulletDir.multiplyScalar(50), fromEnemy:true, damage:20 });
      }
    }
  });

  if(!alive) return null;
  const rotation = Math.atan2(getPlayerPosition().x - enemyPosition.current.x, getPlayerPosition().z - enemyPosition.current.z);

  return (
    <group ref={meshRef}>
      {showBlood && <mesh position={[0,1.5,0]}><sphereGeometry args={[0.2]} /><meshBasicMaterial color="red" /></mesh>}
      <EnemyCharacter url="/models/player.glb" position={enemyPosition.current} rotation={rotation} isMoving={isMoving} isDying={dying} />
    </group>
  );
}

/* -------------- Bullet Manager -------------- */
function BulletManager(){
  const { bullets, enemies, getPlayerPosition } = useWorld();
  const damagePlayer = useGameStore(s=>s.damagePlayer);
  const incrementKills = useGameStore(s=>s.incrementKills);

  useFrame((_, dt)=>{
    const playerPos = getPlayerPosition();
    for(let i = bullets.current.length - 1; i >= 0; i--){
      const b = bullets.current[i];
      b.position.add(b.velocity.clone().multiplyScalar(dt));
      if(b.fromEnemy){
        const distToPlayer = b.position.distanceTo(playerPos);
        if(distToPlayer < 0.8){
          damagePlayer(b.damage);
          gunSoundManager.playHitPlayer();
          bullets.current.splice(i,1);
          continue;
        }
      } else {
        let hitEnemy = false;
        enemies.current.forEach((enemy)=>{
          if(!enemy.isAlive() || hitEnemy) return;
          const distToEnemy = b.position.distanceTo(enemy.position);
          if(distToEnemy < 1.2){
            const currentHealth = enemy.getHealth();
            const newHealth = Math.max(0, currentHealth - b.damage);
            enemy.setHealth(newHealth);
            gunSoundManager.playHitEnemy();
            if(newHealth <= 0 && currentHealth > 0) incrementKills();
            hitEnemy = true;
          }
        });
        if(hitEnemy){ bullets.current.splice(i,1); continue; }
      }
      if(b.position.length() > 150 || b.position.y < -5) bullets.current.splice(i,1);
    }
  });

  return (
    <>
      {bullets.current.map((bullet, i)=>(
        <mesh key={`bullet-${bullet.id}-${i}`} position={bullet.position}>
          <sphereGeometry args={[0.2,8,8]} />
          <meshBasicMaterial color={bullet.fromEnemy ? "#ff0000" : "#ffff00"} emissive={bullet.fromEnemy? "#ff0000" : "#ffff00"} emissiveIntensity={3} />
        </mesh>
      ))}
    </>
  );
}

/* -------------- ContainerModel and Map -------------- */
function ContainerModel({position, rotation=[0,0,0], scale=1}:{position:[number,number,number]; rotation?:[number,number,number]; scale?:number}){
  const [color] = useState(getRandomLightColor());
  const { scene } = useGLTF("/models/container.glb");
  const [finalScale, setFinalScale] = useState<[number,number,number] | null>(null);
  const root = useMemo(()=> scene.clone(true), [scene]);
  useEffect(()=>{
    if(!root) return;
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(), center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    if(size.x===0||size.y===0||size.z===0) return;
    root.position.sub(center); root.position.y -= size.y/2;
    const sx = (CONTAINER_LENGTH/size.x)*scale, sy=(CONTAINER_HEIGHT/size.y)*scale, sz=(CONTAINER_WIDTH/size.z)*scale;
    root.traverse((child:any)=>{ if(child.isMesh && child.material){ const mat = child.material.clone(); mat.color = new THREE.Color(color); child.material = mat; }});
    setFinalScale([sx,sy,sz]);
  }, [root, scale, color]);
  if(!finalScale) return null;
  return (<group position={position} rotation={rotation} scale={finalScale}><primitive object={root} dispose={null} /></group>);
}

function FPSMap(){
  const { colliders } = useWorld();
  const wallMat = useMemo(()=> new THREE.MeshStandardMaterial({color:"#5D4037", metalness:0.1, roughness:0.8}), []);
  const obstacleMat = useMemo(()=> new THREE.MeshStandardMaterial({color:"#37474F", metalness:0.3, roughness:0.7}), []);
  const stepMat = useMemo(()=> new THREE.MeshStandardMaterial({color:"#795548", metalness:0.2, roughness:0.8}), []);

  useEffect(()=>{
    colliders.current = [
      { min: new THREE.Vector3(-35,0,-35.5), max: new THREE.Vector3(35,4,-34.5) },
      { min: new THREE.Vector3(-35,0,34.5), max: new THREE.Vector3(35,4,35.5) },
      { min: new THREE.Vector3(-35.5,0,-35), max: new THREE.Vector3(-34.5,4,35) },
      { min: new THREE.Vector3(34.5,0,-35), max: new THREE.Vector3(35.5,4,35) },
    ];
    const obstaclePositions = [[-10,1,-10],[10,1,-10],[-10,1,10],[10,1,10],[-15,1,0],[15,1,0],[0,1,-15],[0,1,15],[-5,1,-20],[5,1,20]];
    obstaclePositions.forEach((pos)=>{ const w=1.2,h=2,d=1.2; colliders.current.push({ min:new THREE.Vector3(pos[0]-w/2,0,pos[2]-d/2), max:new THREE.Vector3(pos[0]+w/2,h,pos[2]+d/2)}); });

    CONTAINER_POSITIONS.forEach((pos)=>{
      const w = CONTAINER_LENGTH, h = CONTAINER_HEIGHT, d = CONTAINER_WIDTH;
      colliders.current.push({ min:new THREE.Vector3(pos[0]-w/2,0,pos[2]-d/2), max:new THREE.Vector3(pos[0]+w/2,h,pos[2]+d/2) });
    });

    const stepSize = { w:1.0, h:0.8, d:0.8 };
    CONTAINER_POSITIONS.forEach((pos)=>{
      const containerPos = new THREE.Vector3(pos[0], pos[1], pos[2]);
      const dirToCenter = new THREE.Vector3(0,0,0).sub(containerPos); dirToCenter.y = 0;
      if(dirToCenter.length()===0) dirToCenter.set(0,0,1); else dirToCenter.normalize();
      const offsetDist = CONTAINER_WIDTH/2 + stepSize.d/2 + 0.3;
      const stepCenter = containerPos.clone().add(dirToCenter.clone().multiplyScalar(offsetDist));
      stepCenter.y = stepSize.h/2;
      colliders.current.push({ min:new THREE.Vector3(stepCenter.x - stepSize.w/2, 0, stepCenter.z - stepSize.d/2), max:new THREE.Vector3(stepCenter.x + stepSize.w/2, stepCenter.y*2, stepCenter.z + stepSize.d/2) });
    });
  }, [colliders]);

  const stepMeshes = useMemo(()=>{
    const arr:[number,number,number][] = [];
    const stepSizeH = 0.8, stepSizeD = 0.8;
    CONTAINER_POSITIONS.forEach((pos)=>{
      const containerPos = new THREE.Vector3(pos[0], pos[1], pos[2]);
      const dirToCenter = new THREE.Vector3(0,0,0).sub(containerPos); dirToCenter.y = 0;
      if(dirToCenter.length()===0) dirToCenter.set(0,0,1); else dirToCenter.normalize();
      const offsetDist = CONTAINER_WIDTH/2 + stepSizeD/2 + 0.3;
      const stepCenter = containerPos.clone().add(dirToCenter.clone().multiplyScalar(offsetDist));
      arr.push([stepCenter.x, stepSizeH/2, stepCenter.z]);
    });
    return arr;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} receiveShadow>
        <planeGeometry args={[70,70]} />
        <meshStandardMaterial color="#607D3B" />
      </mesh>

      {[[0,2,-35],[0,2,35],[-35,2,0],[35,2,0]].map(([x,y,z],i)=>(
        <mesh key={i} position={[x,y,z]} material={wallMat} receiveShadow castShadow>
          <boxGeometry args={i<2 ? [70,4,1] : [1,4,70]} />
        </mesh>
      ))}

      {[
        [-10,1,-10],[10,1,-10],[-10,1,10],[10,1,10],[-15,1,0],[15,1,0],[0,1,-15],[0,1,15],[-5,1,-20],[5,1,20]
      ].map((pos,i)=>(
        <mesh key={i} position={pos as [number,number,number]} material={obstacleMat} castShadow receiveShadow>
          <boxGeometry args={[1.2,2,1.2]} />
        </mesh>
      ))}

      {CONTAINER_POSITIONS.map((pos,i)=>(
        <ContainerModel key={`container-${i}`} position={[pos[0], pos[1], pos[2]]} rotation={[0, Math.PI/2, 0]} />
      ))}

      {stepMeshes.map((pos,i)=>(
        <mesh key={`step-${i}`} position={pos as [number,number,number]} material={stepMat} castShadow receiveShadow>
          <boxGeometry args={[1.0, 0.8, 0.8]} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Enemies manager ---------- */
function Enemies({count=8, enemyWeapons}:{count?:number; enemyWeapons:EnemyWeapon[];}){
  const { colliders } = useWorld();
  const starts = useMemo(()=>{
    const s:THREE.Vector3[] = [];
    const coverPositions = [[-20,0,-22],[20,0,-22],[-20,0,22],[20,0,22],[-12,0,-10],[12,0,-10],[-10,0,12],[10,0,12]];
    const usedPositions = new Set<string>();
    for(let i=0;i<count;i++){
      let attempts=0; let finalPos:THREE.Vector3|null=null;
      do{
        const basePos = coverPositions[i % coverPositions.length];
        const randomOffset = [(Math.random()-0.5)*3,0,(Math.random()-0.5)*3];
        finalPos = new THREE.Vector3(basePos[0]+randomOffset[0], basePos[1], basePos[2]+randomOffset[2]);
        const posKey = `${Math.round(finalPos.x)},${Math.round(finalPos.z)}`;
        if(!usedPositions.has(posKey)){ usedPositions.add(posKey); break; }
        attempts++;
      } while(attempts<10);
      s.push(finalPos!);
    }
    return s;
  }, [count, colliders]);
  return (<>{starts.map((v,i)=>(<Enemy key={`enemy-${i}`} id={`enemy-${i}`} start={v} weapon={enemyWeapons[i]||"knife"} />))}</>);
}

/* ---------------- PlayerRig + Multiplayer ---------------- */
const GRAVITY = 18;
const JUMP_VELOCITY = 17.2;
const FIRE_RATES: Record<string,number> = { AKM:600, M416:750, AWM:50 };
const DAMAGE: Record<string,number> = { AKM:35, M416:28, AWM:95 };
const RELOAD_TIMES: Record<string,number> = { AKM:1800, M416:2000, AWM:2800 };

function useMultiplayerSend() {
  // returns send function that posts 'state' messages to server
  const send = (payload:any) => {
    const msg = { type: "state", ...payload };
    if((window as any).MP && (window as any).MP.ws && (window as any).MP.ws.readyState === WebSocket.OPEN) {
      (window as any).MP.ws!.send(JSON.stringify(msg));
    }
  };
  return send;
}

function PlayerRig(){
  const { camera, gl } = useThree();
  const { addBullet, getPlayerPosition: getWorldPlayerPosition, checkCollision, getGroundHeightAt } = useWorld();
  const currentWeapon = useGameStore(s=>s.currentWeapon);
  const ammo = useGameStore(s=>s.ammo);
  const cameraView = useGameStore(s=>s.cameraView);
  const isScoped = useGameStore(s=>s.isScoped);
  const selectedScope = useGameStore(s=>s.selectedScope);
  const setCurrentWeapon = useGameStore(s=>s.setCurrentWeapon);
  const decrementAmmo = useGameStore(s=>s.decrementAmmo);
  const setCameraView = useGameStore(s=>s.setCameraView);
  const toggleScope = useGameStore(s=>s.toggleScope);
  const setAmmo = useGameStore(s=>s.setAmmo);
  const setScope = useGameStore(s=>s.setScope);
  const gameMode = useGameStore(s=>s.gameMode);
  const preferredTeam = useGameStore(s=>s.preferredTeam);
  const playerSlot = useGameStore(s=>s.playerSlot);
  const setPlayerSlot = useGameStore(s=>s.setPlayerSlot);
  const setRoomInfo = useGameStore(s=>s.setRoomInfo);
  const setPlayerName = useGameStore(s=>s.setPlayerName);

  // local state
  const opponentPos = useRef(new THREE.Vector3(5, EYE, 5));
  const opponentRot = useRef(0);

  const onRemoteUpdate = (msg:any)=>{
    if(typeof msg.x === "number" && typeof msg.z === "number"){
      opponentPos.current.set(msg.x, msg.y, msg.z);
      opponentRot.current = msg.rot || 0;
    }
  };

  // subscribe to global ws messages
  useEffect(()=>{
    const handler = (e:MessageEvent)=>{
      try{
        const d = JSON.parse(e.data);
        if(d.type === "state"){
          // ignore our own state -> onRemoteUpdate
          onRemoteUpdate(d);
        } else if (d.type === "room_created" || d.type === "joined_room" || d.type === "player_joined"){
          // sync store with window.MP values (already handled in global MP, but we also set player slot if available)
          if((window as any).MP){
            const mp = (window as any).MP;
            if(mp.slot) setPlayerSlot(mp.slot);
            if(mp.roomId) setRoomInfo(mp.roomId, mp.slot==="P1", mp.ws ? (mp.ws.readyState===WebSocket.OPEN ? (useGameStore.getState().playersInRoom || 1) : 1) : 1);
          }
        } else if (d.type === "match_started"){
          // handled by MP global handler - ensure spawn assignment below
        } else if (d.type === "opponent_left"){
          // handled earlier
        }
      }catch(err){ /* ignore */ }
    };
    (window as any).addEventListener && (window as any).addEventListener("message", handler as any);
    // also attach to MP.ws if exists
    if((window as any).MP && (window as any).MP.ws){
      (window as any).MP.ws.onmessage = (ev:MessageEvent)=>{ handler(ev); }; // note: this will override earlier handler but MP.ws already handled store updates too
    }
    return ()=>{ /* nothing to cleanup (MP.ws closed elsewhere) */ };
  }, []);

  // compute team
  const computeTeam = (): TeamId | null => {
    if(preferredTeam !== "auto") return preferredTeam;
    if(!playerSlot) return null;
    return playerSlot === "P1" ? "red" : "blue";
  };
  const myTeam = computeTeam();

  const [onGround, setOnGround] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const playerPos = useRef(new THREE.Vector3(0, EYE, 5));
  const velocity = useRef(new THREE.Vector3());
  const playerRotation = useRef(0);
  const fireCooldown = useRef(0);
  const leftMouseDown = useRef(false);
  const keys = useRef<{[k:string]:boolean}>({});
  const controlsRef = useRef<any>(null);
  const orbitControlsRef = useRef<any>(null);

  const ammoRef = useRef(ammo);
  const currentWeaponRef = useRef(currentWeapon);
  const isReloadingRef = useRef(isReloading);
  const isFiringSoundOnRef = useRef(false);
  useEffect(()=>{ ammoRef.current = ammo; }, [ammo]);
  useEffect(()=>{ currentWeaponRef.current = currentWeapon; }, [currentWeapon]);
  useEffect(()=>{ isReloadingRef.current = isReloading; }, [isReloading]);
  useEffect(()=>{ return ()=> gunSoundManager.dispose(); }, []);

  // mouse handlers
  useEffect(()=>{
    const dom = gl.domElement;
    const onMouseDown = (e:MouseEvent)=>{ if(e.button===0){ leftMouseDown.current=true; e.preventDefault(); } if(e.button===2){ e.preventDefault(); if(cameraView==="fps") toggleScope(); } };
    const onMouseUp = (e:MouseEvent)=>{ if(e.button===0) leftMouseDown.current=false; };
    const preventContext = (e:MouseEvent)=> e.preventDefault();
    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("contextmenu", preventContext);
    return ()=>{ dom.removeEventListener("mousedown", onMouseDown); window.removeEventListener("mouseup", onMouseUp); dom.removeEventListener("contextmenu", preventContext); };
  }, [gl.domElement, cameraView, toggleScope]);

  // keyboard
  useEffect(()=>{
    const handleKeyDown = (e:KeyboardEvent)=>{
      const key = e.key.toLowerCase(); keys.current[key]=true;
      if(key==="1"){ setCurrentWeapon("AKM"); gunSoundManager.stopFire(); return; }
      if(key==="2"){ setCurrentWeapon("M416"); gunSoundManager.stopFire(); return; }
      if(key==="3"){ setCurrentWeapon("AWM"); gunSoundManager.stopFire(); return; }
      if(["4","5","6","7","8","9"].includes(key)){
        const weapon = currentWeaponRef.current; const map:any = {"4":"redDot","5":"2x","6":"3x","7":"4x","8":"6x","9":"8x"}; const selected = map[key];
        if(ALLOWED_SCOPES[weapon].includes(selected)) setScope(selected); else console.warn("Scope not allowed");
        return;
      }
      if(key==="q"){ toggleScope(); return; }
      if(key==="v"){ const views:CameraView[] = ["fps","tps","topdown"]; const next = views[(views.indexOf(cameraView)+1)%views.length]; setCameraView(next); return; }
      if(key==="r" && !isReloading){ const w = currentWeaponRef.current; setIsReloading(true); gunSoundManager.stopFire(); gunSoundManager.playReload(w); setTimeout(()=>{ setIsReloading(false); setAmmo(w, MAX_AMMO[w]); }, RELOAD_TIMES[w]); }
    };
    const handleKeyUp = (e:KeyboardEvent)=> { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return ()=>{ window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("keyup", handleKeyUp); };
  }, [isReloading, cameraView, setCurrentWeapon, setCameraView, toggleScope, setAmmo]);

  const shoot = ()=>{
    if(isReloading) return;
    const w = currentWeaponRef.current;
    if(ammoRef.current[w] <= 0){ gunSoundManager.playEmpty(w); return; }
    const rpm = FIRE_RATES[w]; const perShot = 60 / rpm; const now = performance.now() * 0.001;
    if(now < fireCooldown.current) return; fireCooldown.current = now + perShot;
    decrementAmmo(w);
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const bulletStart = origin.clone().add(dir.clone().multiplyScalar(0.5));
    addBullet({ id:`player-${Date.now()}-${Math.random()}`, position:bulletStart, velocity:dir.clone().multiplyScalar(80), fromEnemy:false, damage:DAMAGE[w] });
  };

  // spawn assignment when mp & slot change
  useEffect(() => {
    if (gameMode === "mp") {
      if (playerSlot === "P1") {
        playerPos.current.set(0, EYE, 5);
      } else if (playerSlot === "P2") {
        playerPos.current.set(5, EYE, 5);
      }
    }
  }, [gameMode, playerSlot]);


  // subscribe to MP ws proxied state messages (window.MP.ws)
  useEffect(()=>{
    const localHandler = (ev:MessageEvent)=>{
      try{
        const d = JSON.parse(ev.data);
        if(d.type === "state"){
          // remote player's state arrives -> update opponent visual
          if(typeof d.x === "number" && typeof d.z === "number"){
            opponentPos.current.set(d.x, d.y, d.z);
            opponentRot.current = d.rot || 0;
          }
        }
      }catch(err){}
    };
    if((window as any).MP && (window as any).MP.ws){
      (window as any).MP.ws.addEventListener("message", localHandler);
    }
    return ()=>{
      if((window as any).MP && (window as any).MP.ws){
        (window as any).MP.ws.removeEventListener("message", localHandler);
      }
    };
  }, []);

  // function to send state periodically (we will send each frame)
  const sendState = useMultiplayerSend();

  useFrame((_, dt)=>{
    // firing
    const wantsToShoot = leftMouseDown.current || keys.current["control"];
    const weaponId = currentWeaponRef.current;
    const weaponAmmo = ammoRef.current[weaponId];
    const isReloadingNow = isReloadingRef.current;
    if(wantsToShoot && weaponAmmo > 0 && !isReloadingNow){
      if(!isFiringSoundOnRef.current){ gunSoundManager.startFire(weaponId); isFiringSoundOnRef.current = true; }
      shoot();
    } else {
      if(isFiringSoundOnRef.current){ gunSoundManager.stopFire(); isFiringSoundOnRef.current=false; }
      if(wantsToShoot && weaponAmmo <= 0 && !isReloadingNow) gunSoundManager.playEmpty(weaponId);
    }

    const speed = keys.current["shift"] ? 10 : 5;
    const dir = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3();
    if(cameraView === "fps"){ camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(new THREE.Vector3(0,1,0), forward).normalize(); }
    else {
      if(orbitControlsRef.current){
        const phi = orbitControlsRef.current.getAzimuthalAngle();
        forward.set(Math.sin(phi),0,Math.cos(phi)).multiplyScalar(-1);
        right.set(Math.cos(phi),0,-Math.sin(phi));
      } else { forward.set(0,0,-1); right.set(1,0,0); }
    }
    dir.set(0,0,0); if(keys.current["w"]) dir.add(forward); if(keys.current["s"]) dir.sub(forward); if(keys.current["a"]) dir.add(right); if(keys.current["d"]) dir.sub(right);

    const moveRadius = 0.45;
    if(dir.length()>0){ dir.normalize(); velocity.current.x = dir.x * speed; velocity.current.z = dir.z * speed; setIsMoving(true); playerRotation.current = Math.atan2(dir.x, dir.z); }
    else { velocity.current.x = 0; velocity.current.z = 0; setIsMoving(false); }

    if(keys.current[" "] && onGround){ velocity.current.y = JUMP_VELOCITY; setOnGround(false); }
    velocity.current.y -= GRAVITY * dt;

    const nextPos = playerPos.current.clone().addScaledVector(velocity.current, dt);
    const horizontalPos = new THREE.Vector3(nextPos.x, playerPos.current.y, nextPos.z);
    if(!checkCollision(horizontalPos, moveRadius)){ playerPos.current.x = horizontalPos.x; playerPos.current.z = horizontalPos.z; }
    else {
      const xOnly = new THREE.Vector3(nextPos.x, playerPos.current.y, playerPos.current.z);
      if(!checkCollision(xOnly, moveRadius)) playerPos.current.x = xOnly.x;
      const zOnly = new THREE.Vector3(playerPos.current.x, playerPos.current.y, nextPos.z);
      if(!checkCollision(zOnly, moveRadius)) playerPos.current.z = zOnly.z;
    }

    const feetY = playerPos.current.y - EYE;
    const groundUnderFeet = getGroundHeightAt(playerPos.current.x, playerPos.current.z, moveRadius);
    let newFeetY = feetY + velocity.current.y * dt;
    if(newFeetY <= groundUnderFeet + 0.02 && velocity.current.y <= 0){ newFeetY = groundUnderFeet; velocity.current.y = 0; setOnGround(true); }
    else setOnGround(false);
    let newEyeY = newFeetY + EYE;
    if(newFeetY < 0){ newFeetY = 0; newEyeY = newFeetY + EYE; velocity.current.y = 0; setOnGround(true); }
    playerPos.current.y = newEyeY;

    // camera follow & offsets
    if (cameraView === "fps") {
      // keep camera at eye position (first-person)
      camera.position.lerp(playerPos.current, 0.22);
    } else if (cameraView === "tps") {
      // third-person: camera should be behind & slightly above the player
      // compute backward vector from playerRotation (playerRotation is atan2(dir.x, dir.z))
      const back = new THREE.Vector3(0, 0, 6); // distance behind player
      back.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRotation.current); // rotate around Y
      const up = new THREE.Vector3(0, 1.6, 0); // height above eye
      const desired = playerPos.current.clone().add(back).add(up);
      camera.position.lerp(desired, 0.15);

      // keep orbit target on player eye
      if (orbitControlsRef.current) {
        orbitControlsRef.current.target.lerp(playerPos.current, 0.22);
        orbitControlsRef.current.update();
      }
    } else if (cameraView === "topdown") {
      // topdown: camera placed high above player, looking down
      const desired = playerPos.current.clone().add(new THREE.Vector3(0, 22, 0));
      // small offset to keep perspective slightly backward
      desired.z += 3;
      camera.position.lerp(desired, 0.18);
      if (orbitControlsRef.current) {
        orbitControlsRef.current.target.lerp(playerPos.current, 0.22);
        orbitControlsRef.current.update();
      }
    }


    if(cameraView === "fps" && isScoped){ const targetFov = SCOPE_FOV[selectedScope]; camera.fov += (targetFov - camera.fov) * 0.15; camera.updateProjectionMatrix(); }
    else { camera.fov += (BASE_FOV - camera.fov) * 0.15; camera.updateProjectionMatrix(); }

    // update world player pos reference
    const worldPos = getWorldPlayerPosition(); worldPos.copy(playerPos.current);

    // send mp state if in mp and connected & match started
    if(gameMode === "mp" && (window as any).MP && (window as any).MP.ws && (window as any).MP.ws.readyState === WebSocket.OPEN){
      const mp = (window as any).MP;
      // Only send state once we have a slot assigned
      if(mp.slot){
        sendState({ id: mp.slot, x: playerPos.current.x, y: playerPos.current.y, z: playerPos.current.z, rot: playerRotation.current });
      }
    }
  });

  return (
    <>
      {cameraView !== "fps" && <EnemyCharacter url="/models/player.glb" position={playerPos.current} rotation={playerRotation.current} isMoving={isMoving} isDying={false} />}
      {gameMode === "mp" && <EnemyCharacter url="/models/player.glb" position={opponentPos.current} rotation={opponentRot.current} isMoving={false} isDying={false} />}
      {cameraView === "fps" && <PointerLockControls ref={controlsRef} />}
      {cameraView === "tps" && <OrbitControls ref={orbitControlsRef} target={playerPos.current} enablePan={false} minDistance={4} maxDistance={10} maxPolarAngle={Math.PI/2.1} enableDamping dampingFactor={0.15} />}
      {cameraView === "topdown" && <OrbitControls ref={orbitControlsRef} target={playerPos.current} enablePan={false} minDistance={15} maxDistance={30} minPolarAngle={0} maxPolarAngle={Math.PI/3} enableDamping dampingFactor={0.15} />}
    </>
  );
}

/* ---------------- HUD, Minimap, ScopeOverlay (kept simple) ---------------- */
function Crosshair(){ const isScoped = useGameStore(s=>s.isScoped); if(isScoped) return null; return <div style={{position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:8, height:8, borderRadius:"50%", backgroundColor:"rgba(255,255,255,0.9)", border:"2px solid rgba(0,0,0,0.8)", pointerEvents:"none", zIndex:100, boxShadow:"0 0 4px rgba(255,255,255,0.6)"}} />; }
function ScopeOverlay(){ const isScoped = useGameStore(s=>s.isScoped); const weapon = useGameStore(s=>s.currentWeapon); const selectedScope = useGameStore(s=>s.selectedScope); if(!isScoped) return null; return (<div style={{position:"fixed", inset:0, pointerEvents:"none", zIndex:150}}><div style={{position:"absolute", inset:0, background:"radial-gradient(circle at center, transparent 22%, rgba(0,0,0,0.96) 24%)"}} /><div style={{position:"absolute", top:"50%", left:"50%", width:"44vmin", height:"44vmin", transform:"translate(-50%,-50%)", borderRadius:"50%", border:"3px solid rgba(0,0,0,0.9)", boxShadow:"0 0 10px rgba(0,0,0,0.9)"}} /><div style={{position:"absolute", top:"50%", left:"50%", width:"40vmin", height:1, background:"rgba(255,255,255,0.7)", transform:"translate(-50%,-50%)"}} /><div style={{position:"absolute", top:"50%", left:"50%", width:1, height:"40vmin", background:"rgba(255,255,255,0.7)", transform:"translate(-50%,-50%)"}} /><div style={{width:6, height:6, borderRadius:"50%", background:"red", position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", boxShadow:"0 0 6px rgba(255,0,0,0.8)"}} /><div style={{position:"absolute", bottom:"12%", width:"100%", textAlign:"center", color:"#fff", fontSize:16, fontWeight:700, textShadow:"0 0 4px rgba(0,0,0,0.9)"}}>{weapon} | {selectedScope.toUpperCase()}</div></div>); }

/* ---------------- Minimap (kept) ---------------- */
const RADAR_RANGE = 25, WORLD_HALF_SIZE = 35;
function Minimap(){ const { getPlayerPosition, enemies } = useWorld(); const [showFullMap,setShowFullMap]=useState(false); const [mapState,setMapState]=useState({player:{x:0,z:0}, enemies:[] as {x:number;z:number}[]});
  useEffect(()=>{ const h=(e:KeyboardEvent)=>{ if(e.key.toLowerCase()==="m") setShowFullMap(s=>!s); }; window.addEventListener("keydown", h); return ()=>window.removeEventListener("keydown", h); }, []);
  useEffect(()=>{ const interval = setInterval(()=>{ const p = getPlayerPosition(); const enemyArr:{x:number;z:number}[] = []; enemies.current.forEach((e)=>{ if(!e.isAlive()) return; const dx = e.position.x - p.x, dz = e.position.z - p.z; const dist = Math.sqrt(dx*dx + dz*dz); if(dist <= RADAR_RANGE) enemyArr.push({x:e.position.x, z:e.position.z}); }); setMapState({ player:{x:p.x,z:p.z}, enemies:enemyArr }); }, 100); return ()=>clearInterval(interval); }, [getPlayerPosition, enemies]);

  const toMapCoord = (x:number,z:number,size:number)=>{ const nx = (x+WORLD_HALF_SIZE)/(WORLD_HALF_SIZE*2); const nz = (-z+WORLD_HALF_SIZE)/(WORLD_HALF_SIZE*2); return { x: nx*size, y: nz*size }; };
  const renderMap = (size:number)=>{ const playerDot = toMapCoord(mapState.player.x, mapState.player.z, size);
    return (<div style={{position:"relative", width:size, height:size, borderRadius:12, background:"rgba(0,0,0,0.8)", border:"1px solid rgba(255,255,255,0.3)", overflow:"hidden"}}>
      <div style={{position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize:"16px 16px"}} />
      {CONTAINER_POSITIONS.map((c, idx)=>{ const pos = toMapCoord(c[0], c[2], size); return <div key={`cm-${idx}`} style={{position:"absolute", width:10, height:6, left:pos.x-5, top:pos.y-3, background:"rgba(0,150,255,0.9)", borderRadius:2}} />; })}
      <div style={{position:"absolute", width:10, height:10, borderRadius:"50%", background:"#ffffff", left:playerDot.x-5, top:playerDot.y-5, boxShadow:"0 0 8px rgba(255,255,255,0.9)"}} />
      {mapState.enemies.map((e, idx)=>{ const pos = toMapCoord(e.x, e.z, size); return <div key={`enemy-dot-${idx}`} style={{position:"absolute", width:8, height:8, borderRadius:"50%", background:"#ff4444", left:pos.x-4, top:pos.y-4, boxShadow:"0 0 6px rgba(255,80,80,0.9)"}} />; })}
    </div>); };

  return (<>
    <div style={{position:"fixed", right:16, top:70, zIndex:40}}>{renderMap(160)}<div style={{marginTop:4,fontSize:10,color:"#fff",textAlign:"right",textShadow:"0 0 3px #000"}}>M = Full Map</div></div>
    {showFullMap && <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:60}}>{renderMap(400)}</div>}
  </>);
}

/* ---------------- HUD ---------------- */
function HUD(){
  const { playerHP, maxHP, currentWeapon, ammo, kills, totalEnemies, cameraView } = useGameStore();
  const setCameraView = useGameStore(s=>s.setCameraView);
  const selectedScope = useGameStore(s=>s.selectedScope);
  const playerName = useGameStore(s=>s.playerName);
  const preferredTeam = useGameStore(s=>s.preferredTeam);
  const playerSlot = useGameStore(s=>s.playerSlot);
  const gameMode = useGameStore(s=>s.gameMode);
  let teamLabel = "AUTO";
  if(playerSlot){ let team:TeamId; if(preferredTeam!=="auto") team = preferredTeam as TeamId; else team = playerSlot==="P1" ? "red" : "blue"; teamLabel = team.toUpperCase(); }
  const toggleCamera = ()=>{ const views:CameraView[] = ["fps","tps","topdown"]; const next = views[(views.indexOf(cameraView)+1)%views.length]; setCameraView(next); };
  return (<>
    <Crosshair />
    <div style={{position:"fixed", left:20, top:20, color:"#fff", zIndex:20, fontFamily:"sans-serif", fontWeight:600, background:"#000", padding:"8px 12px", borderRadius:8, opacity:0.8, minWidth:210}}>
      👤 {playerName} <br />
      {gameMode === "mp" && <>🛡 Team: {teamLabel} <br/></>}
      ❤️ {playerHP}/{maxHP} <br />
      🔫 {currentWeapon} ({ammo[currentWeapon]}) <br />
      🎯 Scope: {selectedScope.toUpperCase()} <br />
      💀 {kills}/{totalEnemies}
    </div>
    <button onClick={toggleCamera} style={{position:"fixed", right:20, top:20, padding:"10px 16px", background:"#3498db", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", zIndex:20}}>Change View ({cameraView.toUpperCase()})</button>
    <div style={{position:"fixed", bottom:20, left:20, padding:"6px 10px", background:"rgba(0,0,0,0.6)", color:"#fff", fontSize:11, borderRadius:6, fontFamily:"monospace", zIndex:20}}>1/2/3 = Weapons | 4=RedDot 5=2x 6=3x 7=4x 8=6x 9=8x | Q / Right Click = Scope | M = Map</div>
    <ScopeOverlay />
    <Minimap />
  </>);
}

/* ---------------- Menu Screen (with mp create/join UI integrated) ---------------- */
function MenuScreen({ onStart }:{ onStart:(infiniteLives:boolean, mode:"ai"|"mp", name:string, team:PreferredTeam)=>void }){
  const [infiniteLives, setInfiniteLivesLocal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<"ai"|"mp">("ai");
  const [name, setName] = useState("Player");
  const [teamChoice, setTeamChoice] = useState<PreferredTeam>("auto");
  const [joinRoomInput, setJoinRoomInput] = useState("");
  const start = ()=> onStart(infiniteLives, selectedMode, name, teamChoice);

  useEffect(()=>{ useGameStore.getState().setPlayerName(name); }, [name]);

  return (
    <div style={{width:"100vw", height:"100vh", background:"linear-gradient(135deg,#1e3c72 0%,#2a5298 100%)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column"}}>
      <h1 style={{fontSize:60, marginBottom:20}}>🎯 FPS ARENA</h1>
      <div style={{marginBottom:16, display:"flex", flexDirection:"column", alignItems:"center", gap:6}}>
        <span style={{fontSize:18}}>Player Name</span>
        <input value={name} onChange={(e)=>setName(e.target.value)} maxLength={16} style={{padding:"8px 12px", borderRadius:8, border:"none", outline:"none", textAlign:"center", fontSize:16, minWidth:220}} />
      </div>
      <label style={{display:"flex", alignItems:"center", gap:10, marginBottom:20, fontSize:18, cursor:"pointer"}}>
        <input type="checkbox" checked={infiniteLives} onChange={(e)=>setInfiniteLivesLocal(e.target.checked)} style={{width:20,height:20}} /> <span>Infinite Lives Mode</span>
      </label>

      <div style={{marginBottom:10, fontSize:20}}><strong>Game Mode</strong></div>
      <div style={{display:"flex", gap:15, marginBottom:24}}>
        <button onClick={()=>setSelectedMode("ai")} style={{padding:"10px 20px", borderRadius:8, border:"none", cursor:"pointer", background:selectedMode==="ai"?"#2ecc71":"#555", color:"#fff", fontWeight:600}}>VS Computer</button>
        <button onClick={()=>setSelectedMode("mp")} style={{padding:"10px 20px", borderRadius:8, border:"none", cursor:"pointer", background:selectedMode==="mp"?"#9b59b6":"#555", color:"#fff", fontWeight:600}}>Multiplayer</button>
      </div>

      {selectedMode === "mp" && (
        <>
          <div style={{marginBottom:8, fontSize:18}}>Select Team</div>
          <div style={{display:"flex", gap:10, marginBottom:12}}>
            <button onClick={()=>setTeamChoice("auto")} style={{padding:"8px 16px", borderRadius:8, border:"none", cursor:"pointer", background:teamChoice==="auto"?"#3498db":"#555", color:"#fff", fontWeight:600}}>Auto</button>
            <button onClick={()=>setTeamChoice("red")} style={{padding:"8px 16px", borderRadius:8, border:"none", cursor:"pointer", background:teamChoice==="red"?"#e74c3c":"#555", color:"#fff", fontWeight:600}}>Red</button>
            <button onClick={()=>setTeamChoice("blue")} style={{padding:"8px 16px", borderRadius:8, border:"none", cursor:"pointer", background:teamChoice==="blue"?"#2980b9":"#555", color:"#fff", fontWeight:600}}>Blue</button>
          </div>
          <div style={{fontSize:12, opacity:0.8, marginBottom:12}}>If you keep <b>Auto</b>, game will assign: P1 → Red, P2 → Blue</div>

          <div style={{display:"flex", gap:10, marginTop:8}}>
            <button onClick={()=>{
              (window as any).MP.connect("create");
              const status = document.getElementById("mp-status"); if(status) status.innerText = "Creating room...";
            }} style={{background:"#2ecc71", padding:"10px 16px", borderRadius:8, border:"none", cursor:"pointer", color:"#fff"}}>Create Game</button>

            <input placeholder="Room ID (for Join)" value={joinRoomInput} onChange={(e)=>setJoinRoomInput(e.target.value)} style={{padding:"8px 10px", borderRadius:8, border:"none", outline:"none", minWidth:160}} />
            <button onClick={()=>{
              if(!joinRoomInput){ alert("Enter room ID"); return; }
              (window as any).MP.connect("join", joinRoomInput);
            }} style={{background:"#3498db", padding:"10px 16px", borderRadius:8, border:"none", cursor:"pointer", color:"#fff"}}>Join Game</button>
          </div>

          <div id="mp-status" style={{color:"#fff", marginTop:12, minHeight:22}}>Not connected</div>
        </>
      )}

      <div style={{marginTop:20}}>
        <button onClick={()=>{
          onStart(infiniteLives, selectedMode, name, teamChoice);
          // if multiplayer and window.MP exists, make sure to set slot to store (if already set)
          if((window as any).MP && (window as any).MP.slot) useGameStore.getState().setPlayerSlot((window as any).MP.slot);
        }} style={{background:"#27ae60", padding:"16px 32px", border:"none", borderRadius:8, color:"#fff", fontSize:20, cursor:"pointer"}}>START GAME ▶</button>
      </div>
    </div>
  );
}

/* ---------------- Leaderboard, Victory, GameOver (kept simple) ---------------- */
interface ScoreEntry{ name:string; kills:number; accuracy:number; time:number; date:string; }
interface LeaderboardStore{ scores:ScoreEntry[]; addScore:(s:ScoreEntry)=>void; clearScores:()=>void; }
const useLeaderboard = create<LeaderboardStore>((set,get)=>({ scores:[], addScore:(score)=>{ const scores = [...get().scores, score].sort((a,b)=>b.kills-a.kills).slice(0,10); set({scores}); }, clearScores:()=>set({scores:[]}) }));

function Leaderboard(){ const {scores, clearScores} = useLeaderboard(); return (<div style={{position:"fixed", bottom:30, right:30, background:"rgba(0,0,0,0.8)", borderRadius:12, padding:"16px 24px", color:"#fff", fontFamily:"monospace", zIndex:50, maxWidth:280}}>
  <h3 style={{marginBottom:8}}>🏅 Leaderboard</h3>
  <div style={{maxHeight:180, overflowY:"auto", borderTop:"1px solid rgba(255,255,255,0.2)", paddingTop:8}}>
    {scores.length===0 ? <div style={{opacity:0.6}}>No scores yet</div> : scores.map((s,i)=> (<div key={i} style={{fontSize:12, marginBottom:4, display:"flex", justifyContent:"space-between"}}><span>{i+1}. {s.name}</span><span>{s.kills} K / {s.accuracy.toFixed(0)}% / {(s.time/1000).toFixed(1)}s</span></div>))}
  </div>
  {scores.length>0 && <button onClick={clearScores} style={{marginTop:10, width:"100%", background:"#e74c3c", border:"none", borderRadius:6, color:"#fff", padding:"6px 0", cursor:"pointer", fontSize:12}}>Clear</button>}
</div>); }

function VictoryScreen(){ const addScore = useLeaderboard(s=>s.addScore); const kills = useGameStore(s=>s.kills); const total = useGameStore(s=>s.totalEnemies); const resetGame = useGameStore(s=>s.resetGame); const [name,setName]=useState("Player"); return (<div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", color:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"sans-serif"}}><h1>🏆 VICTORY!</h1><p>You eliminated all {kills}/{total} enemies!</p><input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Enter name" style={{marginTop:12,padding:8,borderRadius:6,border:"1px solid #999",outline:"none",textAlign:"center"}} /><button onClick={()=>{ addScore({name,kills,accuracy:Math.random()*100,time:performance.now(),date:new Date().toLocaleString()}); resetGame(); }} style={{marginTop:20, background:"#2ecc71", padding:"14px 30px", border:"none", borderRadius:8, fontSize:18, cursor:"pointer", color:"#fff"}}>💾 Save Score & Play Again</button></div>); }

function GameOverScreen(){ const kills = useGameStore(s=>s.kills); const total = useGameStore(s=>s.totalEnemies); const resetGame = useGameStore(s=>s.resetGame); return (<div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.95)", color:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"sans-serif"}}><h1 style={{fontSize:60,color:"#e74c3c"}}>💀 GAME OVER</h1><p style={{fontSize:24, marginBottom:20}}>You were eliminated! Kills: {kills}/{total}</p><button onClick={()=>resetGame()} style={{background:"#e74c3c", padding:"14px 30px", border:"none", borderRadius:8, fontSize:18, cursor:"pointer", color:"#fff"}}>Try Again</button></div>); }

/* ---------------- Root game component ---------------- */
export default function FPSGame(){
  const gamePhase = useGameStore(s=>s.gamePhase);
  const setGamePhase = useGameStore(s=>s.setGamePhase);
  const setInfiniteLives = useGameStore(s=>s.setInfiniteLives);
  const setPlayerName = useGameStore(s=>s.setPlayerName);
  const setPreferredTeam = useGameStore(s=>s.setPreferredTeam);
  const setPlayerSlot = useGameStore(s=>s.setPlayerSlot);
  const gameMode = useGameStore(s=>s.gameMode);

  const [enemyWeapons] = useState<EnemyWeapon[]>(["gun","gun","knife","gun","knife","gun","knife","gun"]);

  if(gamePhase === "menu"){
    return <MenuScreen onStart={(infiniteLives, mode, name, team)=>{ setInfiniteLives(infiniteLives); useGameStore.getState().setGameMode(mode); setPlayerName(name); setPreferredTeam(team); setGamePhase("playing"); }} />;
  }
  if(gamePhase === "gameOver") return <GameOverScreen />;
  if(gamePhase === "victory") return <VictoryScreen />;

  return (
    <div style={{width:"100vw", height:"100vh", background:"#0d0e11"}}>
      <WorldProvider>
        <Canvas shadows camera={{ position: [0, EYE, 8], fov: BASE_FOV }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[10,20,10]} intensity={1.5} />
          <Suspense fallback={null}>
            <FPSMap />
            {/* disable AI in multiplayer */}
            { (useGameStore.getState().gameMode === "mp") ? null : <Enemies count={8} enemyWeapons={enemyWeapons} /> }
            <BulletManager />
          </Suspense>
          <PlayerRig />
          <Sky sunPosition={[100,20,100]} turbidity={3} />
        </Canvas>
        <HUD />
        <Leaderboard />
      </WorldProvider>
    </div>
  );
}
