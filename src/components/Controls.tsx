import React from "react";
import { Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useGameStore } from "../store/useGameStore";

export const Controls: React.FC<{ onReset?: () => void }> = ({ onReset }) => {
  const running = useGameStore((s) => s.running);
  const setRunning = useGameStore((s) => s.setRunning);
  const muted = useGameStore((s) => s.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);

  return (
    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8 }}>
      <Btn onClick={() => setRunning(!running)}>{running ? "Pause" : (<><Play size={14} style={{ marginRight: 6 }} />Start</>)}</Btn>
      <Btn onClick={() => onReset?.()}><RotateCcw size={14} style={{ marginRight: 6 }} />Reset</Btn>
      <Btn onClick={toggleMute}>{muted ? <><VolumeX size={14} />&nbsp;Muted</> : <><Volume2 size={14} />&nbsp;Sound</>}</Btn>
    </div>
  );
};

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => (
  <button {...props} style={{
    background: "#2b2f36", color: "#fff", border: "1px solid #444",
    padding: "6px 10px", borderRadius: 6, display: "flex", alignItems: "center",
    cursor: "pointer", userSelect: "none"
  }}>
    {children}
  </button>
);
