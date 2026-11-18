import React, { useEffect, useRef } from 'react';
import type { LayerSpec, RoofSystemId } from '../../types/roof';

interface ConstructiveCutawayCanvasProps {
  layers: LayerSpec[];
  systemId: RoofSystemId;
  selectedLayerId?: string;
  onSelectLayer?: (id: string) => void;
  width?: number;
  height?: number;
}

function shadeHex(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * factor)));
  return `rgb(${r},${g},${b})`;
}

export const ConstructiveCutawayCanvas: React.FC<ConstructiveCutawayCanvasProps> = ({
  layers,
  systemId,
  selectedLayerId,
  width = 240,
  height = 165,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const visible = layers.filter((l) => l.visible);
    if (visible.length === 0) return;

    // Bottom-to-top order for painter's algorithm
    const bottomToTop = [...visible].reverse();

    // Compute proportional screen pixel heights (compressed non-linearly so thin membranes stay visible while thick slabs look solid)
    const rawPx = bottomToTop.map((l) => {
      if (l.role === 'waterproofing') return 4.5;
      if (l.role === 'support_slab') return Math.max(18, Math.min(28, l.thicknessCm * 0.9));
      if (l.role === 'slope_formation') return Math.max(12, Math.min(20, l.thicknessCm * 1.3));
      return Math.max(6, Math.min(16, l.thicknessCm * 1.45));
    });
    const totalH = rawPx.reduce((a, b) => a + b, 0);
    const maxAvailH = height * 0.56;
    const hScale = totalH > maxAvailH ? maxAvailH / totalH : 1;

    // Isometric block geometry
    const cx = width * 0.49;
    const baseY = height * 0.86;
    const halfW = width * 0.36;
    const isoDrop = height * 0.14;
    const isSloped = !['plana_transitable', 'invertida_transitable', 'ajardinada'].includes(systemId);
    const slopeLift = isSloped ? 16 : 5; // subtle roof pitch tilt toward back

    // Soft ground shadow under cutaway block
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.moveTo(cx, baseY + 6);
    ctx.lineTo(cx + halfW + 5, baseY - isoDrop + 6);
    ctx.lineTo(cx, baseY - isoDrop * 2 + 6);
    ctx.lineTo(cx - halfW - 5, baseY - isoDrop + 6);
    ctx.closePath();
    ctx.filter = 'blur(4px)';
    ctx.fill();
    ctx.restore();

    let curY = baseY;

    bottomToTop.forEach((layer, idx) => {
      const lh = rawPx[idx] * hScale;
      const isTop = idx === bottomToTop.length - 1;
      const isSelected = selectedLayerId === layer.id;

      // Stepped cutaway terrace effect on top layers so every single layer is clearly visible on the cutaway!
      const stepFactor = Math.max(0.62, 1 - (bottomToTop.length - 1 - idx) * 0.015);
      const wL = halfW * (isTop ? 0.94 : stepFactor);
      const wR = halfW * (isTop ? 0.94 : stepFactor);

      // Left corner, Front corner, Right corner, Back corner
      const yFrontBot = curY;
      const yLeftBot = curY - isoDrop;
      const yRightBot = curY - isoDrop;
      const yBackBot = curY - isoDrop * 2;

      const extraSlope = layer.role === 'slope_formation' ? slopeLift * 0.65 : 0;
      const yFrontTop = yFrontBot - lh;
      const yLeftTop = yLeftBot - lh - (idx >= bottomToTop.findIndex((x) => x.role === 'slope_formation') ? slopeLift * 0.25 : 0);
      const yRightTop = yRightBot - lh - extraSlope - (idx >= bottomToTop.findIndex((x) => x.role === 'slope_formation') ? slopeLift : 0);
      const yBackTop = yBackBot - lh - extraSlope - (idx >= bottomToTop.findIndex((x) => x.role === 'slope_formation') ? slopeLift : 0);

      const xF = cx;
      const xL = cx - wL;
      const xR = cx + wR;
      const xB = cx;

      // 1. Left cutaway face (shaded mid-tone)
      ctx.beginPath();
      ctx.moveTo(xL, yLeftBot);
      ctx.lineTo(xF, yFrontBot);
      ctx.lineTo(xF, yFrontTop);
      ctx.lineTo(xL, yLeftTop);
      ctx.closePath();
      ctx.fillStyle = shadeHex(layer.colorHex, isSelected ? 1.18 : 0.88);
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#60a5fa' : 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = isSelected ? 1.4 : 0.7;
      ctx.stroke();

      // 2. Right cutaway face (darker shadow side)
      ctx.beginPath();
      ctx.moveTo(xF, yFrontBot);
      ctx.lineTo(xR, yRightBot);
      ctx.lineTo(xR, yRightTop);
      ctx.lineTo(xF, yFrontTop);
      ctx.closePath();
      ctx.fillStyle = shadeHex(layer.colorHex, isSelected ? 1.05 : 0.68);
      ctx.fill();
      ctx.stroke();

      // Material micro-texture details on cut faces!
      if (layer.role === 'support_slab' || layer.role === 'slope_formation' || layer.role === 'protection_mortar') {
        ctx.save();
        ctx.clip();
        for (let k = 0; k < 28; k++) {
          const px = xL + ((k * 37) % (wL * 2));
          const py = Math.min(yFrontTop, yLeftTop) + ((k * 19) % Math.max(4, lh + 4));
          ctx.fillStyle = k % 2 === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(20,25,35,0.28)';
          ctx.fillRect(px, py, 2, 1.5);
        }
        ctx.restore();
      }

      // 3. Top surface of layer (drawn on top layer, or thin ledge)
      if (isTop) {
        ctx.beginPath();
        ctx.moveTo(xF, yFrontTop);
        ctx.lineTo(xR, yRightTop);
        ctx.lineTo(xB, yBackTop);
        ctx.lineTo(xL, yLeftTop);
        ctx.closePath();
        const topGrad = ctx.createLinearGradient(xL, yLeftTop, xR, yRightTop);
        topGrad.addColorStop(0, shadeHex(layer.colorHex, 1.16));
        topGrad.addColorStop(1, shadeHex(layer.colorHex, 0.92));
        ctx.fillStyle = topGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Tile joints or paving grid on top face
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = isSloped ? 'rgba(80,25,10,0.35)' : 'rgba(40,45,55,0.28)';
        ctx.lineWidth = 0.8;
        for (let g = 1; g <= 4; g++) {
          const t = g / 5;
          // Lines parallel to left-front edge
          ctx.beginPath();
          ctx.moveTo(xF + (xR - xF) * t, yFrontTop + (yRightTop - yFrontTop) * t);
          ctx.lineTo(xL + (xB - xL) * t, yLeftTop + (yBackTop - yLeftTop) * t);
          ctx.stroke();
          // Lines parallel to front-right edge
          ctx.beginPath();
          ctx.moveTo(xF + (xL - xF) * t, yFrontTop + (yLeftTop - yFrontTop) * t);
          ctx.lineTo(xR + (xB - xR) * t, yRightTop + (yBackTop - yRightTop) * t);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Layer number callout pin along left-front silhouette
      const orderNum = visible.length - idx;
      const pinX = xL - 8;
      const pinY = (yLeftBot + yLeftTop) * 0.5;
      ctx.beginPath();
      ctx.moveTo(xL, pinY);
      ctx.lineTo(pinX + 5, pinY);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(pinX, pinY, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#3b82f6' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 7px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(orderNum), pinX, pinY + 0.5);

      curY -= lh;
    });
  }, [layers, systemId, selectedLayerId, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px` }}
      className="block mx-auto"
    />
  );
};
