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
  Html,
  useGLTF,
  useAnimations,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import { create } from "zustand";

// ==================== TYPES ====================
type CameraView = "fps" | "tps" | "topdown";
type EnemyWeapon = "knife" | "gun";

type Bullet = {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  fromEnemy: boolean;
  damage: number;
};

type GameState = {
  running: boolean;
  playerHP: number;
  maxHP: number;
  currentWeapon: "AKM" | "M416" | "AWM";
  ammo: Record<string, number>;
  kills: number;
  totalEnemies: number;
  selectedMap: string;
  cameraView: CameraView;
  gamePhase: "menu" | "weaponSelect" | "playing" | "victory" | "gameOver";
  isScoped: boolean;
  infiniteLives: boolean;
};

// ==================== ZUSTAND STORE ====================
interface GameStore extends GameState {
  setPlayerHP: (hp: number) => void;
  setCurrentWeapon: (weapon: "AKM" | "M416" | "AWM") => void;
  setAmmo: (weapon: string, amount: number) => void;
  decrementAmmo: (weapon: string) => void;
  incrementKills: () => void;
  setCameraView: (view: CameraView) => void;
  setGamePhase: (phase: GameState["gamePhase"]) => void;
  toggleScope: () => void;
  resetGame: () => void;
  damagePlayer: (amount: number) => void;
  setInfiniteLives: (value: boolean) => void;
}

const MAX_AMMO: Record<string, number> = { AKM: 30, M416: 40, AWM: 5 };

const useGameStore = create<GameStore>((set, get) => ({
  running: true,
  playerHP: 100,
  maxHP: 100,
  currentWeapon: "AKM",
  ammo: { AKM: 3000, M416: 40000, AWM: 1500 },
  kills: 0,
  totalEnemies: 8,
  selectedMap: "warehouse",
  cameraView: "fps",
  gamePhase: "menu",
  isScoped: false,
  infiniteLives: false,

  setPlayerHP: (hp) => set({ playerHP: hp }),

  setCurrentWeapon: (weapon) => {
    console.log("Switching to weapon:", weapon);
    set({ currentWeapon: weapon });
  },

  setAmmo: (weapon, amount) =>
    set((state) => ({
      ammo: { ...state.ammo, [weapon]: amount },
    })),

  decrementAmmo: (weapon) =>
    set((state) => {
      const newAmmo = Math.max(0, state.ammo[weapon] - 1);
      console.log(`Ammo for ${weapon}: ${newAmmo}/${MAX_AMMO[weapon]}`);
      return {
        ammo: { ...state.ammo, [weapon]: newAmmo },
      };
    }),

  incrementKills: () =>
    set((state) => {
      const newKills = state.kills + 1;
      console.log(`Kill count: ${newKills}/${state.totalEnemies}`);
      const newPhase =
        newKills >= state.totalEnemies ? "victory" : state.gamePhase;
      return {
        kills: newKills,
        gamePhase: newPhase,
      };
    }),

  setCameraView: (view) => {
    console.log("Camera view changed to:", view);
    set({ cameraView: view, isScoped: false });
  },

  setGamePhase: (phase) => {
    console.log("Game phase changed to:", phase);
    set({ gamePhase: phase });
  },

  toggleScope: () =>
    set((state) => {
      console.log("Scope toggled:", !state.isScoped);
      return { isScoped: !state.isScoped };
    }),

  damagePlayer: (amount) =>
    set((state) => {
      if (state.infiniteLives) return state;
      
      const newHP = Math.max(0, state.playerHP - amount);
      console.log(`Player damaged: ${amount}, HP: ${newHP}/${state.maxHP}`);
      
      if (newHP <= 0) {
        return { playerHP: 0, gamePhase: "gameOver" };
      }
      
      return { playerHP: newHP };
    }),

  setInfiniteLives: (value) => set({ infiniteLives: value }),

  resetGame: () => {
    console.log("Game reset");
    set({
      running: true,
      playerHP: 100,
      maxHP: 100,
      currentWeapon: "AKM",
      ammo: { AKM: 30, M416: 40, AWM: 5 },
      kills: 0,
      totalEnemies: 8,
      cameraView: "fps",
      gamePhase: "playing",
      isScoped: false,
    });
  },
}));

// ==================== WORLD CONTEXT ====================
type AABB = { min: THREE.Vector3; max: THREE.Vector3 };

type EnemyHandle = {
  id: string;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  getHealth: () => number;
  setHealth: (v: number) => void;
  isAlive: () => boolean;
  weapon: EnemyWeapon;
};

type WorldCtx = {
  colliders: React.MutableRefObject<AABB[]>;
  registerEnemy: (h: EnemyHandle) => void;
  unregisterEnemy: (id: string) => void;
  enemies: React.MutableRefObject<Map<string, EnemyHandle>>;
  getPlayerPosition: () => THREE.Vector3;
  bullets: React.MutableRefObject<Bullet[]>;
  addBullet: (bullet: Bullet) => void;
  checkCollision: (pos: THREE.Vector3, radius: number) => boolean;
};

const WorldContext = createContext<WorldCtx | null>(null);

export const useWorld = () => {
  const v = useContext(WorldContext);
  if (!v) throw new Error("useWorld must be inside WorldProvider");
  return v;
};

const WorldProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const colliders = useRef<AABB[]>([]);
  const enemies = useRef<Map<string, EnemyHandle>>(new Map());
  const playerPosRef = useRef(new THREE.Vector3(0, 1.6, 5));
  const bullets = useRef<Bullet[]>([]);

  const registerEnemy = (h: EnemyHandle) => enemies.current.set(h.id, h);
  const unregisterEnemy = (id: string) => enemies.current.delete(id);
  const getPlayerPosition = () => playerPosRef.current;
  const addBullet = (bullet: Bullet) => bullets.current.push(bullet);
  
  const checkCollision = (pos: THREE.Vector3, radius: number) => {
    for (const box of colliders.current) {
      const closestX = Math.max(box.min.x, Math.min(pos.x, box.max.x));
      const closestY = Math.max(box.min.y, Math.min(pos.y, box.max.y));
      const closestZ = Math.max(box.min.z, Math.min(pos.z, box.max.z));
      
      const distX = pos.x - closestX;
      const distY = pos.y - closestY;
      const distZ = pos.z - closestZ;
      
      const distSquared = distX * distX + distY * distY + distZ * distZ;
      
      if (distSquared < radius * radius) {
        return true;
      }
    }
    return false;
  };

  return (
    <WorldContext.Provider
      value={{
        colliders,
        enemies,
        registerEnemy,
        unregisterEnemy,
        getPlayerPosition,
        bullets,
        addBullet,
        checkCollision,
      }}
    >
      {children}
    </WorldContext.Provider>
  );
};

// ==================== NEW ENEMY CHARACTER (enemy.glb) ====================
function EnemyCharacter({
  url,
  position,
  rotation,
  isMoving,
  isDying,
  scale = 0.52,
}: {
  url: string;
  position: THREE.Vector3;
  rotation: number;
  isMoving: boolean;
  isDying: boolean;
  scale?: number;
}) {
  const group = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF(url);
  const { actions, mixer } = useAnimations(animations, group);

  useEffect(() => {
    if (!actions) return;
    const idle = actions["Idle"] || actions["idle"];
    const walk = actions["Walk"] || actions["walk"];
    const death = actions["Death"] || actions["die"];

    if (isDying && death) {
      walk?.stop();
      idle?.stop();
      death.reset().fadeIn(0.2).play();
    } else if (isMoving && walk) {
      idle?.fadeOut(0.2);
      walk.reset().fadeIn(0.2).play();
    } else if (idle) {
      walk?.fadeOut(0.2);
      idle.reset().fadeIn(0.2).play();
    }
  }, [isMoving, isDying, actions]);

  useFrame((_, delta) => {
    mixer.update(delta);
    if (group.current) {
      group.current.position.copy(position);
      group.current.rotation.set(0, rotation, 0);
    }
  });

  return (
    <group ref={group} scale={[scale, scale, scale]}>
      <primitive object={scene} />
    </group>
  );
}

// ==================== ENEMY ====================
function Enemy({
  id,
  start,
  weapon,
}: {
  id: string;
  start: THREE.Vector3;
  weapon: EnemyWeapon;
}) {
  const meshRef = useRef<THREE.Group>(null!);
  const [health, setHealth] = useState(100);
  const [alive, setAlive] = useState(true);
  const [dying, setDying] = useState(false);
  const [showBlood, setShowBlood] = useState(false);
  const { registerEnemy, unregisterEnemy, getPlayerPosition, addBullet, checkCollision } =
    useWorld();
  const damagePlayer = useGameStore((s) => s.damagePlayer);

  const enemyPosition = useRef(start.clone());
  const [isMoving, setIsMoving] = useState(false);
  const lastAttack = useRef(0);
  const lastShot = useRef(0);

  useEffect(() => {
    registerEnemy({
      id,
      mesh: meshRef.current,
      position: enemyPosition.current,
      getHealth: () => health,
      setHealth: (v) => {
        setHealth(v);
        if (v <= 0 && !dying) {
          setDying(true);
          setShowBlood(true);
          setTimeout(() => setAlive(false), 2000);
        }
      },
      isAlive: () => alive && !dying,
      weapon,
    });
    return () => unregisterEnemy(id);
  }, [health, alive, dying]);

  useFrame((_, dt) => {
    if (!alive || dying) return;
    const playerPos = getPlayerPosition();
    const dir = new THREE.Vector3().subVectors(playerPos, enemyPosition.current);
    dir.y = 0;
    const dist = dir.length();

    if (dist > 3 && dist < 25) {
      dir.normalize();
      const moveAmount = Math.min(2.5 * dt, dist);
      const newPos = enemyPosition.current.clone().addScaledVector(dir, moveAmount);
      
      // Check collision before moving
      if (!checkCollision(newPos, 0.5)) {
        enemyPosition.current.copy(newPos);
        setIsMoving(true);
      } else {
        // Try to move around obstacle
        const perpDir = new THREE.Vector3(-dir.z, 0, dir.x);
        const altPos1 = enemyPosition.current.clone().addScaledVector(perpDir, moveAmount);
        const altPos2 = enemyPosition.current.clone().addScaledVector(perpDir, -moveAmount);
        
        if (!checkCollision(altPos1, 0.5)) {
          enemyPosition.current.copy(altPos1);
          setIsMoving(true);
        } else if (!checkCollision(altPos2, 0.5)) {
          enemyPosition.current.copy(altPos2);
          setIsMoving(true);
        } else {
          setIsMoving(false);
        }
      }
    } else {
      setIsMoving(false);
    }

    const now = performance.now();
    if (weapon === "knife" && dist < 2.5 && now - lastAttack.current > 1000) {
      lastAttack.current = now;
      damagePlayer(15);
    } else if (weapon === "gun" && dist < 25 && dist > 2 && now - lastShot.current > 1500) {
      lastShot.current = now;
      const bulletDir = dir.clone().normalize();
      const bulletStart = enemyPosition.current.clone().add(new THREE.Vector3(0, 1.2, 0));
      addBullet({
        id: `enemy-${id}-${now}`,
        position: bulletStart,
        velocity: bulletDir.multiplyScalar(45),
        fromEnemy: true,
        damage: 20,
      });
    }
  });

  if (!alive) return null;

  const rotation = Math.atan2(
    getPlayerPosition().x - enemyPosition.current.x,
    getPlayerPosition().z - enemyPosition.current.z
  );

  return (
    <group ref={meshRef}>
      {showBlood && (
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.2]} />
          <meshBasicMaterial color="red" />
        </mesh>
      )}

      {/* ✅ Use Animated GLB for Enemy */}
      <EnemyCharacter
        url="/models/enemy.glb"
        position={enemyPosition.current}
        rotation={rotation}
        isMoving={isMoving}
        isDying={dying}
      />
    </group>
  );
}


function BulletManager() {
  // Destructure world and game state accessors
  const { bullets, enemies, getPlayerPosition } = useWorld();
  
  // Assuming useGameStore is imported and defined elsewhere in your file
  // These hooks are used to interact with global game state (HP, Kills)
  const damagePlayer = useGameStore((state) => state.damagePlayer);
  const incrementKills = useGameStore((state) => state.incrementKills);

  useFrame((_, dt) => {
    const playerPos = getPlayerPosition();
    
    // Iterate backward to safely remove elements
    for (let i = bullets.current.length - 1; i >= 0; i--) {
      const b = bullets.current[i];

      // Move bullet based on velocity and delta time
      b.position.add(b.velocity.clone().multiplyScalar(dt));
      
      // --- ENEMY BULLET LOGIC ---
      if (b.fromEnemy) {
        const distToPlayer = b.position.distanceTo(playerPos);
        
        // Check for hit (increased hit radius for easier enemy hits)
        if (distToPlayer < 0.8) {
          console.log('💥 Enemy bullet hit player!', b.damage);
          damagePlayer(b.damage);
          bullets.current.splice(i, 1);
          continue;
        }
      } 
      // --- PLAYER BULLET LOGIC ---
      else {
        let hitEnemy = false;
        
        enemies.current.forEach((enemy) => {
          if (!enemy.isAlive() || hitEnemy) return;

          const distToEnemy = b.position.distanceTo(enemy.position);

          // Check for hit (increased hit radius for easier player hits)
          if (distToEnemy < 1.2) {
            const currentHealth = enemy.getHealth();
            const newHealth = Math.max(0, currentHealth - b.damage);
            enemy.setHealth(newHealth);

            console.log('💥 Player bullet hit enemy!', {
              enemyId: enemy.id,
              damage: b.damage,
              oldHP: currentHealth,
              newHP: newHealth,
            });

            // Update kill count if enemy died in this hit
            if (newHealth <= 0 && currentHealth > 0) {
              incrementKills();
            }
            hitEnemy = true;
          }
        });

        if (hitEnemy) {
          bullets.current.splice(i, 1);
          continue;
        }
      }

      // --- DISPOSAL LOGIC ---
      // Remove bullets that are too far away (150 units) or below ground
      if (b.position.length() > 150 || b.position.y < -5) {
        bullets.current.splice(i, 1);
      }
    }
  });

  // --- RENDERING ---
  return (
    <>
      {bullets.current.map((bullet, i) => (
        <mesh key={`bullet-${bullet.id}-${i}`} position={bullet.position}>
          <sphereGeometry args={[0.2, 8, 8]} />
          <meshBasicMaterial
            color={bullet.fromEnemy ? "#ff0000" : "#ffff00"}
            emissive={bullet.fromEnemy ? "#ff0000" : "#ffff00"}
            emissiveIntensity={3}
          />
        </mesh>
      ))}
    </>
  );
}
// ==================== PLAYER RIG ====================
const GRAVITY = 18;
const JUMP_VELOCITY = 7.2;
const EYE = 2.1;

const FIRE_RATES: Record<string, number> = { AKM: 600, M416: 750, AWM: 50 };
const DAMAGE: Record<string, number> = { AKM: 35, M416: 28, AWM: 95 };
const RELOAD_TIMES: Record<string, number> = {
  AKM: 1800,
  M416: 2000,
  AWM: 2800,
};

function PlayerRig() {
  const { camera, gl } = useThree();
  const { addBullet, getPlayerPosition: getWorldPlayerPosition, checkCollision } = useWorld();
  
  // Zustand store hooks
  const currentWeapon = useGameStore((state) => state.currentWeapon);
  const ammo = useGameStore((state) => state.ammo);
  const cameraView = useGameStore((state) => state.cameraView);
  const isScoped = useGameStore((state) => state.isScoped);
  const setCurrentWeapon = useGameStore((state) => state.setCurrentWeapon);
  const decrementAmmo = useGameStore((state) => state.decrementAmmo);
  const setCameraView = useGameStore((state) => state.setCameraView);
  const toggleScope = useGameStore((state) => state.toggleScope);
  const setAmmo = useGameStore((state) => state.setAmmo);

  const [onGround, setOnGround] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const playerPos = useRef(new THREE.Vector3(0, EYE, 5));
  const velocity = useRef(new THREE.Vector3());
  const playerRotation = useRef(0);
  const fireCooldown = useRef(0);
  const leftMouseDown = useRef(false);
  const keys = useRef<{ [k: string]: boolean }>({});

  const controlsRef = useRef<any>(null);
  const orbitControlsRef = useRef<any>(null);

  // Update world player position
  useEffect(() => {
    const worldPlayerPos = getWorldPlayerPosition();
    worldPlayerPos.copy(playerPos.current);
  });

  // ===================== MOUSE HANDLING =====================
  useEffect(() => {
    const dom = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        leftMouseDown.current = true;
        e.preventDefault();
      }
      if (e.button === 2) {
        e.preventDefault();
        if (cameraView === 'fps') {
          toggleScope();
        }
      }
    };
    
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        leftMouseDown.current = false;
      }
    };
    
    const preventContext = (e: MouseEvent) => e.preventDefault();

    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("contextmenu", preventContext);

    return () => {
      dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      dom.removeEventListener("contextmenu", preventContext);
    };
  }, [gl.domElement, cameraView, toggleScope]);

  // ===================== KEYBOARD INPUT =====================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keys.current[key] = true;

      // Weapon switching
      if (key === "1") {
        setCurrentWeapon("AKM");
        return;
      }
      if (key === "2") {
        setCurrentWeapon("M416");
        return;
      }
      if (key === "3") {
        setCurrentWeapon("AWM");
        return;
      }

      // Scope toggle
      if (key === "q") {
        toggleScope();
        return;
      }

      // Camera view toggle
      if (key === "v") {
        const views: CameraView[] = ["fps", "tps", "topdown"];
        const currentIndex = views.indexOf(cameraView);
        const nextView = views[(currentIndex + 1) % views.length];
        setCameraView(nextView);
        return;
      }

      // Reload
      if (key === "r" && !isReloading) {
        const w = currentWeapon;
        console.log(`🔄 Reloading ${w}...`);
        setIsReloading(true);
        setTimeout(() => {
          setIsReloading(false);
          setAmmo(w, MAX_AMMO[w]);
          console.log(`✅ ${w} reloaded: ${MAX_AMMO[w]} rounds`);
        }, RELOAD_TIMES[w]);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isReloading, cameraView, currentWeapon, setCurrentWeapon, setCameraView, toggleScope, setAmmo]);

  // ===================== SHOOT FUNCTION =====================
  const shoot = () => {
    if (isReloading) return;
    const w = currentWeapon;
    if (ammo[w] <= 0) {
      console.log('❌ Out of ammo!');
      return;
    }
    const rpm = FIRE_RATES[w];
    const perShot = 60 / rpm;
    const now = performance.now() * 0.001;
    if (now < fireCooldown.current) return;
    fireCooldown.current = now + perShot;

    decrementAmmo(w);

    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const bulletStart = origin.clone().add(dir.clone().multiplyScalar(0.5));
    
    addBullet({
      id: `player-${Date.now()}-${Math.random()}`,
      position: bulletStart,
      velocity: dir.clone().multiplyScalar(80),
      fromEnemy: false,
      damage: DAMAGE[w],
    });
    
    console.log(`🔫 ${w} fired! Ammo left: ${ammo[w] - 1}/${MAX_AMMO[w]}`);
  };

  // ===================== MOVEMENT LOOP =====================
  useFrame((_, dt) => {
    if (leftMouseDown.current || keys.current["control"]) {
      shoot();
    }

    const speed = keys.current["shift"] ? 10 : 5;
    const dir = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    if (cameraView === "fps") {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
    } else {
      if (orbitControlsRef.current) {
        const phi = orbitControlsRef.current.getAzimuthalAngle();
        forward.set(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(-1);
        right.set(Math.cos(phi), 0, -Math.sin(phi));
      } else {
        forward.set(0, 0, -1);
        right.set(1, 0, 0);
      }
    }

    dir.set(0, 0, 0);
    if (keys.current["w"]) dir.add(forward);
    if (keys.current["s"]) dir.sub(forward);
    if (keys.current["a"]) dir.sub(right);
    if (keys.current["d"]) dir.add(right);

    if (dir.length() > 0) {
      dir.normalize();
      velocity.current.x = dir.x * speed;
      velocity.current.z = dir.z * speed;
      setIsMoving(true);
      playerRotation.current = Math.atan2(dir.x, dir.z);
    } else {
      velocity.current.x = 0;
      velocity.current.z = 0;
      setIsMoving(false);
    }

    if (keys.current[" "] && onGround) {
      velocity.current.y = JUMP_VELOCITY;
      setOnGround(false);
    }

    velocity.current.y -= GRAVITY * dt;
    
    // Apply movement with collision checking
    const newPos = playerPos.current.clone().addScaledVector(velocity.current, dt);
    
    // Check horizontal collision
    const testPosHorizontal = new THREE.Vector3(newPos.x, playerPos.current.y, newPos.z);
    if (!checkCollision(testPosHorizontal, 0.5)) {
      playerPos.current.x = newPos.x;
      playerPos.current.z = newPos.z;
    }
    
    // Check vertical collision
    if (!checkCollision(new THREE.Vector3(playerPos.current.x, newPos.y, playerPos.current.z), 0.5)) {
      playerPos.current.y = newPos.y;
    } else if (newPos.y < playerPos.current.y) {
      velocity.current.y = 0;
      setOnGround(true);
    }

    if (playerPos.current.y < EYE) {
      playerPos.current.y = EYE;
      velocity.current.y = 0;
      setOnGround(true);
    }

    if (cameraView === "fps") {
      camera.position.lerp(playerPos.current, 0.2);
    } else if (cameraView === "tps" || cameraView === "topdown") {
      const targetPos = playerPos.current.clone();
      camera.position.lerp(targetPos, 0.15);
      
      if (orbitControlsRef.current) {
        orbitControlsRef.current.target.lerp(playerPos.current, 0.2);
        orbitControlsRef.current.update();
      }
    }
  });

  return (
    <>
      {cameraView !== 'fps' && (
        <EnemyCharacter
        url="/models/enemy.glb"
        position={playerPos.current}
        rotation={playerRotation.current}
        isMoving={isMoving}
        isDying={false}
        />
      )}

      {cameraView === "fps" && (
        <PointerLockControls
          ref={controlsRef}
        />
      )}
      {cameraView === "tps" && (
        <OrbitControls
          ref={orbitControlsRef}
          target={playerPos.current}
          enablePan={false}
          minDistance={4}
          maxDistance={10}
          maxPolarAngle={Math.PI / 2.1}
          enableDamping={true}
          dampingFactor={0.15}
        />
      )}
      {cameraView === "topdown" && (
        <OrbitControls
          ref={orbitControlsRef}
          target={playerPos.current}
          enablePan={false}
          minDistance={15}
          maxDistance={30}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 3}
          enableDamping={true}
          dampingFactor={0.15}
        />
      )}
    </>
  );
}

// ==================== ENEMIES MANAGER ====================
function Enemies({
  count = 8,
  enemyWeapons,
}: {
  count?: number;
  enemyWeapons: EnemyWeapon[];
}) {
  const starts = useMemo(() => {
    const s: THREE.Vector3[] = [];
    const positions = [
      [-15, 0, -15],
      [15, 0, -15],
      [-15, 0, 15],
      [15, 0, 15],
      [-20, 0, 0],
      [20, 0, 0],
      [0, 0, -20],
      [0, 0, 20],
    ];

    for (let i = 0; i < count; i++) {
      const pos = positions[i % positions.length];
      s.push(
        new THREE.Vector3(
          pos[0] + (Math.random() - 0.5) * 4,
          pos[1],
          pos[2] + (Math.random() - 0.5) * 4
        )
      );
    }
    return s;
  }, [count]);

  return (
    <>
      {starts.map((v, i) => (
        <Enemy
          key={`enemy-${i}`}
          id={`enemy-${i}`}
          start={v}
          weapon={enemyWeapons[i] || "knife"}
        />
      ))}
    </>
  );
}

// ==================== MAP ====================
function FPSMap() {
  const { colliders } = useWorld();
  
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#5D4037",
        metalness: 0.1,
        roughness: 0.8,
      }),
    []
  );

  const obstacleMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#37474F",
        metalness: 0.3,
        roughness: 0.7,
      }),
    []
  );

  const containerMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#D84315",
        metalness: 0.4,
        roughness: 0.6,
      }),
    []
  );

  useEffect(() => {
    // Register wall colliders
    colliders.current = [
      // North wall
      { min: new THREE.Vector3(-35, 0, -35.5), max: new THREE.Vector3(35, 4, -34.5) },
      // South wall
      { min: new THREE.Vector3(-35, 0, 34.5), max: new THREE.Vector3(35, 4, 35.5) },
      // West wall
      { min: new THREE.Vector3(-35.5, 0, -35), max: new THREE.Vector3(-34.5, 4, 35) },
      // East wall
      { min: new THREE.Vector3(34.5, 0, -35), max: new THREE.Vector3(35.5, 4, 35) },
    ];

    // Add obstacles
    const obstaclePositions = [
      [-10, 1, -10], [10, 1, -10], [-10, 1, 10], [10, 1, 10],
      [-15, 1, 0], [15, 1, 0], [0, 1, -15], [0, 1, 15],
      [-5, 1, -20], [5, 1, 20]
    ];

    obstaclePositions.forEach((pos) => {
      const w = 1.5, h = 2, d = 1.5;
      colliders.current.push({
        min: new THREE.Vector3(pos[0] - w/2, 0, pos[2] - d/2),
        max: new THREE.Vector3(pos[0] + w/2, h, pos[2] + d/2),
      });
    });

    // Add containers
    const containerPositions = [
      [-20, 2, -20], [20, 2, -20], [-20, 2, 20], [20, 2, 20]
    ];

    containerPositions.forEach((pos) => {
      const w = 3, h = 4, d = 2;
      colliders.current.push({
        min: new THREE.Vector3(pos[0] - w/2, 0, pos[2] - d/2),
        max: new THREE.Vector3(pos[0] + w/2, h, pos[2] + d/2),
      });
    });
  }, []);

  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color="#607D3B" />
      </mesh>

      {/* Arena walls */}
      {[
        [0, 2, -35],
        [0, 2, 35],
        [-35, 2, 0],
        [35, 2, 0],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={wallMat} receiveShadow castShadow>
          <boxGeometry args={i < 2 ? [70, 4, 1] : [1, 4, 70]} />
        </mesh>
      ))}

      {/* Obstacles (boxes/pillars) */}
      {[
        [-10, 1, -10], [10, 1, -10], [-10, 1, 10], [10, 1, 10],
        [-15, 1, 0], [15, 1, 0], [0, 1, -15], [0, 1, 15],
        [-5, 1, -20], [5, 1, 20]
      ].map((pos, i) => (
        <mesh
          key={`box-${i}`}
          position={pos as [number, number, number]}
          material={obstacleMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1.5, 2, 1.5]} />
        </mesh>
      ))}

      {/* Containers */}
      {[
        [-20, 2, -20], [20, 2, -20], [-20, 2, 20], [20, 2, 20]
      ].map((pos, i) => (
        <mesh
          key={`container-${i}`}
          position={pos as [number, number, number]}
          material={containerMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[3, 4, 2]} />
        </mesh>
      ))}
    </group>
  );
}

// ==================== HUD + SCOPE ====================
function Crosshair() {
  const isScoped = useGameStore((s) => s.isScoped);
  
  if (isScoped) return null;
  
  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        border: "2px solid rgba(0, 0, 0, 0.8)",
        pointerEvents: "none",
        zIndex: 100,
        boxShadow: "0 0 4px rgba(255, 255, 255, 0.6)",
      }}
    />
  );
}

function ScopeOverlay() {
  const isScoped = useGameStore((s) => s.isScoped);
  const weapon = useGameStore((s) => s.currentWeapon);
  if (!isScoped) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 100,
        background:
          "radial-gradient(circle at center, transparent 200px, rgba(0,0,0,0.9) 210px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 4,
          height: 4,
          borderRadius: "50%",
          backgroundColor: "red",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          color: "#fff",
          fontSize: 16,
          fontWeight: 700,
          textShadow: "0 2px 4px rgba(0,0,0,0.8)",
        }}
      >
        {weapon} - SCOPED
      </div>
    </div>
  );
}

function HUD() {
  const { playerHP, maxHP, currentWeapon, ammo, kills, totalEnemies, cameraView } =
    useGameStore();
  const setCameraView = useGameStore((s) => s.setCameraView);

  const toggleCamera = () => {
    const views: CameraView[] = ["fps", "tps", "topdown"];
    const next = views[(views.indexOf(cameraView) + 1) % views.length];
    setCameraView(next);
  };

  return (
    <>
      <Crosshair />
      <div
        style={{
          position: "fixed",
          left: 20,
          top: 20,
          color: "#fff",
          zIndex: 20,
          fontFamily: "sans-serif",
          fontWeight: 600,
        }}
      >
        ❤️ {playerHP}/{maxHP}
        <br />
        🔫 {currentWeapon} ({ammo[currentWeapon]})
        <br />
        💀 {kills}/{totalEnemies}
      </div>

      <button
        onClick={toggleCamera}
        style={{
          position: "fixed",
          right: 20,
          top: 20,
          padding: "10px 16px",
          background: "#3498db",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          zIndex: 20,
        }}
      >
        Change View ({cameraView.toUpperCase()})
      </button>

      <ScopeOverlay />
    </>
  );
}

// ==================== MENU + MAIN GAME ====================
function MenuScreen({ onStart }: { onStart: (infiniteLives: boolean) => void }) {
  const [infiniteLives, setInfiniteLivesLocal] = useState(false);
  
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      <h1 style={{ fontSize: 60 }}>🎯 FPS ARENA</h1>
      
      <label style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 10, 
        marginBottom: 20,
        fontSize: 18,
        cursor: "pointer"
      }}>
        <input 
          type="checkbox" 
          checked={infiniteLives}
          onChange={(e) => setInfiniteLivesLocal(e.target.checked)}
          style={{ width: 20, height: 20, cursor: "pointer" }}
        />
        <span>Infinite Lives Mode</span>
      </label>
      
      <button
        onClick={() => onStart(infiniteLives)}
        style={{
          background: "#27ae60",
          padding: "16px 32px",
          border: "none",
          borderRadius: 8,
          color: "#fff",
          fontSize: 20,
          cursor: "pointer",
        }}
      >
        START GAME ▶
      </button>
    </div>
  );
}

// ==================== LEADERBOARD STORE ====================
interface ScoreEntry {
  name: string;
  kills: number;
  accuracy: number;
  time: number;
  date: string;
}

interface LeaderboardStore {
  scores: ScoreEntry[];
  addScore: (score: ScoreEntry) => void;
  clearScores: () => void;
}

const useLeaderboard = create<LeaderboardStore>((set, get) => ({
  scores: [],
  addScore: (score) => {
    const scores = [...get().scores, score]
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 10);
    set({ scores });
  },
  clearScores: () => {
    set({ scores: [] });
  },
}));

// ==================== LEADERBOARD UI ====================
function Leaderboard() {
  const { scores, clearScores } = useLeaderboard();

  return (
    <div
      style={{
        position: "fixed",
        bottom: 30,
        right: 30,
        background: "rgba(0,0,0,0.8)",
        borderRadius: 12,
        padding: "16px 24px",
        color: "#fff",
        fontFamily: "monospace",
        zIndex: 50,
        maxWidth: 280,
      }}
    >
      <h3 style={{ marginBottom: 8 }}>🏅 Leaderboard</h3>
      <div
        style={{
          maxHeight: 180,
          overflowY: "auto",
          borderTop: "1px solid rgba(255,255,255,0.2)",
          paddingTop: 8,
        }}
      >
        {scores.length === 0 ? (
          <div style={{ opacity: 0.6 }}>No scores yet</div>
        ) : (
          scores.map((s, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                marginBottom: 4,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>
                {i + 1}. {s.name}
              </span>
              <span>
                {s.kills} K / {s.accuracy.toFixed(0)}% /{" "}
                {(s.time / 1000).toFixed(1)}s
              </span>
            </div>
          ))
        )}
      </div>
      {scores.length > 0 && (
        <button
          onClick={clearScores}
          style={{
            marginTop: 10,
            width: "100%",
            background: "#e74c3c",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            padding: "6px 0",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}


// ==================== VICTORY SCREEN ====================
function VictoryScreen() {
  const addScore = useLeaderboard((s) => s.addScore);
  const kills = useGameStore((s) => s.kills);
  const totalEnemies = useGameStore((s) => s.totalEnemies);
  const resetGame = useGameStore((s) => s.resetGame);
  const [name, setName] = useState("Player");

  const handleSave = () => {
    addScore({
      name,
      kills,
      accuracy: Math.random() * 100,
      time: performance.now(),
      date: new Date().toLocaleString(),
    });
    resetGame();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
      }}
    >
      <h1>🏆 VICTORY!</h1>
      <p>
        You eliminated all {kills}/{totalEnemies} enemies!
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter name"
        style={{
          marginTop: 12,
          padding: 8,
          borderRadius: 6,
          border: "1px solid #999",
          outline: "none",
          textAlign: "center",
        }}
      />
      <button
        onClick={handleSave}
        style={{
          marginTop: 20,
          background: "#2ecc71",
          padding: "14px 30px",
          border: "none",
          borderRadius: 8,
          fontSize: 18,
          cursor: "pointer",
          color: "#fff",
        }}
      >
        💾 Save Score & Play Again
      </button>
    </div>
  );
}

// ==================== GAME OVER SCREEN ====================
function GameOverScreen() {
  const kills = useGameStore((s) => s.kills);
  const totalEnemies = useGameStore((s) => s.totalEnemies);
  const resetGame = useGameStore((s) => s.resetGame);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.95)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ fontSize: 60, color: "#e74c3c" }}>💀 GAME OVER</h1>
      <p style={{ fontSize: 24, marginBottom: 20 }}>
        You were eliminated! Kills: {kills}/{totalEnemies}
      </p>
      <button
        onClick={() => {
          resetGame();
        }}
        style={{
          background: "#e74c3c",
          padding: "14px 30px",
          border: "none",
          borderRadius: 8,
          fontSize: 18,
          cursor: "pointer",
          color: "#fff",
        }}
      >
        Try Again
      </button>
    </div>
  );
}

export default function FPSGame() {
  const gamePhase = useGameStore((s) => s.gamePhase);
  const setGamePhase = useGameStore((s) => s.setGamePhase);
  const setInfiniteLives = useGameStore((s) => s.setInfiniteLives);

  const [enemyWeapons] = useState<EnemyWeapon[]>([
    "gun", "gun", "knife", "gun", 
    "knife", "gun", "knife", "gun"
  ]);

  if (gamePhase === "menu") {
    return <MenuScreen onStart={(infiniteLives) => {
      setInfiniteLives(infiniteLives);
      setGamePhase("playing");
    }} />;
  }
  
  if (gamePhase === "gameOver") {
    return <GameOverScreen />;
  }

  if (gamePhase === "victory") {
    return <VictoryScreen />;
  }




  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0d0e11" }}>
      <WorldProvider>
        <Canvas shadows camera={{ position: [0, 2.1, 8], fov: 70 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 20, 10]} intensity={1.5} />
          <Suspense fallback={null}>
            <FPSMap />
            <Enemies count={8} enemyWeapons={enemyWeapons} />
            <BulletManager />
          </Suspense>
          <PlayerRig />
          <Sky sunPosition={[100, 20, 100]} turbidity={3} />
        </Canvas>
        <HUD />
        <Leaderboard />
      </WorldProvider>
    </div>
  );
}