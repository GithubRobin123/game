// src/components/Hud.tsx
import { useWorld } from "../world/WorldContext";

export default function Hud() {
  const { kills } = useWorld();
  return (
    <>
      <div style={{ position: "fixed", left: 8, top: 8, display: "flex", gap: 8 }}>
        <Tag>HP 100</Tag>
        <Tag>Weapon: 1=AKM, 2=M416, 3=AWM</Tag>
        <Tag>Kills {kills}</Tag>
      </div>

      {/* Crosshair */}
      <div style={{
        position: "fixed", left: "50%", top: "50%",
        width: 4, height: 4, background: "#fff", borderRadius: 2,
        transform: "translate(-50%, -50%)", opacity: 0.9
      }} />
    </>
  );
}

const Tag: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 12
  }}>{children}</div>
);
