import React, { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../store/game";

const DETECT = 18;          // detection range
const MELEE_RANGE = 2.2;    // if close, deal damage
const ENEMY_SPEED = 2.4;    // m/s
const ENEMY_DMG = 10;       // per hit window
const ENEMY_COOLDOWN = 700; // ms between hits

type Props = { id: string };

export default function Enemy({ id }: Props) {
  const ref = useRef<THREE.Mesh>(null!);
  const { camera } = useThree();

  const e = useGame((s) => s.enemies[id]);
  const registerEnemy = useGame((s) => s.registerEnemy);
  const damagePlayer = useGame((s) => s.damagePlayer);
  const running = useGame((s) => s.running);

  useEffect(() => {
    if (ref.current) registerEnemy(id, ref.current);
  }, [id, registerEnemy]);

  useFrame((_, dt) => {
    if (!running) return;
    const me = useGame.getState().enemies[id];
    if (!me || !me.alive) return;

    // seek player
    const to = new THREE.Vector3().subVectors(camera.position, me.pos);
    const dist = to.length();
    if (dist < DETECT) {
      to.normalize();
      me.pos.addScaledVector(to, ENEMY_SPEED * dt);
      me.rotY = Math.atan2(to.x, to.z);
    }

    // clamp into arena
    me.pos.x = THREE.MathUtils.clamp(me.pos.x, -24, 24);
    me.pos.z = THREE.MathUtils.clamp(me.pos.z, -24, 24);

    // melee damage
    if (dist < MELEE_RANGE) {
      const t = performance.now();
      if (t - me.lastShot > ENEMY_COOLDOWN) {
        me.lastShot = t;
        damagePlayer(ENEMY_DMG);
        // player death & respawn
        const st = useGame.getState();
        if (st.playerHP <= 0) {
          // respawn player at center and heal
          camera.position.set(0, 1.6, 0);
          useGame.getState().healPlayerToFull();
        }
      }
    }

    // update mesh transform
    if (ref.current) {
      ref.current.position.copy(me.pos);
      ref.current.rotation.y = me.rotY;
      // show/hide if dead
      ref.current.visible = me.alive;
    }
  });

  if (!e) return null;

  const hpPct = Math.max(0, e.health) / e.maxHealth;

  return (
    <group>
      <mesh ref={ref} castShadow position={e.pos.toArray()} name={`enemy-${id}`}>
        {/* body */}
        <boxGeometry args={[1, 2, 1]} />
        <meshStandardMaterial color={e.alive ? "#6d4c41" : "#333"} />
      </mesh>

      {/* health bar */}
      {e.alive && (
        <group position={[e.pos.x, e.pos.y + 1.6, e.pos.z]}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[1.2, 0.1, 0.1]} />
            <meshBasicMaterial color="black" />
          </mesh>
          <mesh position={[(-1.2 / 2) + (1.2 * hpPct) / 2, 0, 0]}>
            <boxGeometry args={[1.2 * hpPct, 0.08, 0.08]} />
            <meshBasicMaterial color={hpPct > 0.5 ? "#2ecc71" : "#e74c3c"} />
          </mesh>
        </group>
      )}
    </group>
  );
}
