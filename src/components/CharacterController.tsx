import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Vector3, Quaternion, Euler } from "three";
import { useRef, useEffect, useState } from "react";

export default function CharacterController() {
  const { scene } = useGLTF("/models/Sniper_Stand.glb");
  const player = useRef<any>();
  const direction = new Vector3();
  const velocity = new Vector3();
  const rotation = new Euler();

  const SPEED = 6;
  const keys: any = {};

  const { camera } = useThree();
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    window.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
    window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));
    window.addEventListener("mousemove", (e) => {
      setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    });
  }, []);

  useFrame((_, delta) => {
    if (!player.current) return;

    direction.set(0, 0, 0);
    if (keys.w) direction.z -= 1;
    if (keys.s) direction.z += 1;
    if (keys.a) direction.x -= 1;
    if (keys.d) direction.x += 1;

    direction.normalize();
    velocity.copy(direction).multiplyScalar(SPEED * delta);

    player.current.position.add(velocity);

    // Rotate toward mouse
    const angle = Math.atan2(mouse.x - 0.5, 0.5 - mouse.y);
    rotation.set(0, angle, 0);
    player.current.quaternion.slerp(new Quaternion().setFromEuler(rotation), 0.15);

    // Third-person camera follow
    camera.position.lerp(
      player.current.position.clone().add(new Vector3(0, 3, 6)),
      0.1
    );
    camera.lookAt(player.current.position);
  });

  return (
    <primitive
      ref={player}
      object={scene}
      position={[0, 0, 0]}
      scale={1}
    />
  );
}
