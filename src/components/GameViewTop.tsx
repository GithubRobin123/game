import React, { useEffect, useRef } from "react";
import { GAME_CONFIG } from "../game/config";
import type { GameEngine } from "../game/engine";
import { useGameStore } from "../store/useGameStore";

type Props = { engine: GameEngine; onRenderAll: () => void };

export const GameViewTop: React.FC<Props> = ({ engine, onRenderAll }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const running = useGameStore(s => s.running);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    // hook mouse to compute world coords for aiming
    const mm = (e: MouseEvent) => engine.updateMouseFromCanvas(canvas, e.clientX, e.clientY);
    const md = () => engine.mouseDown();
    const mu = () => engine.mouseUp();

    canvas.addEventListener("mousemove", mm);
    canvas.addEventListener("mousedown", md);
    canvas.addEventListener("mouseup", mu);
    const detachKeys = engine.attachKeyboardListeners();

    // master loop
    engine.startMasterLoop(() => {
      const cam = { x: engine.state.cameraMain.x, y: engine.state.cameraMain.y, scale: 1 };
      engine.render(ctx, cam);
      // trigger the sibling canvases to render via onRenderAll
      onRenderAll();
    });

    return () => {
      engine.stopMasterLoop();
      canvas.removeEventListener("mousemove", mm);
      canvas.removeEventListener("mousedown", md);
      canvas.removeEventListener("mouseup", mu);
      detachKeys();
    };
  }, [engine]);

  useEffect(() => {
    // pause/unpause handled by engine loop check on "running"
  }, [running]);

  return (
    <canvas
      ref={canvasRef}
      width={GAME_CONFIG.canvas.width}
      height={GAME_CONFIG.canvas.height}
      style={{
        borderRadius: 12, background: "#1f2225", boxShadow: "0 10px 30px rgba(0,0,0,0.35)", border: "1px solid #31343a",
      }}
    />
  );
};
