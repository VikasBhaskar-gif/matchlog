import { useState, useRef, useEffect, useCallback } from "react";

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
}

export function ImageCropModal({
  isOpen,
  imageSrc,
  onClose,
  onCropComplete,
}: ImageCropModalProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  // Viewport and circular crop diameter
  const VIEWPORT_SIZE = 300;
  const CROP_DIAMETER = 240;

  // Reset state when a new image is loaded
  useEffect(() => {
    if (isOpen && imageSrc) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      const img = new Image();
      img.onload = () => {
        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        imageRef.current = img;
      };
      img.src = imageSrc;
    }
  }, [isOpen, imageSrc]);

  // Calculate base scale so image fully covers the crop circle at zoom = 1
  const baseScale = naturalSize.width && naturalSize.height
    ? Math.max(CROP_DIAMETER / naturalSize.width, CROP_DIAMETER / naturalSize.height)
    : 1;

  const currentScale = baseScale * zoom;
  const renderedWidth = naturalSize.width * currentScale;
  const renderedHeight = naturalSize.height * currentScale;

  // Max pan bounds to ensure crop circle is always filled
  const maxPanX = Math.max(0, (renderedWidth - CROP_DIAMETER) / 2);
  const maxPanY = Math.max(0, (renderedHeight - CROP_DIAMETER) / 2);

  const clampPan = useCallback((x: number, y: number) => {
    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, x)),
      y: Math.min(maxPanY, Math.max(-maxPanY, y)),
    };
  }, [maxPanX, maxPanY]);

  // Keep pan within bounds when zooming out
  useEffect(() => {
    setPan((prev) => clampPan(prev.x, prev.y));
  }, [zoom, clampPan]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    setPan(clampPan(dragStartRef.current.panX + deltaX, dragStartRef.current.panY + deltaY));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((z) => Math.min(3, Math.max(1, parseFloat((z + zoomDelta).toFixed(2)))));
  };

  const handleSave = () => {
    if (!imageRef.current || !naturalSize.width || !naturalSize.height) return;

    const OUTPUT_SIZE = 400;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Center of crop circle relative to image center
    // Image center in rendered pixels is (renderedWidth / 2 + pan.x, renderedHeight / 2 + pan.y)
    // Crop center in rendered pixels is (renderedWidth / 2, renderedHeight / 2)
    // So the crop center offset in image coordinate space:
    const cropSizeInImage = CROP_DIAMETER / currentScale;
    const cropCenterXInImage = naturalSize.width / 2 - pan.x / currentScale;
    const cropCenterYInImage = naturalSize.height / 2 - pan.y / currentScale;

    const sourceX = cropCenterXInImage - cropSizeInImage / 2;
    const sourceY = cropCenterYInImage - cropSizeInImage / 2;

    ctx.drawImage(
      imageRef.current,
      sourceX,
      sourceY,
      cropSizeInImage,
      cropSizeInImage,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE
    );

    const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
    onCropComplete(croppedDataUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl bg-[#0f172a] border border-white/10 p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-base">✂️</span>
            <h3 className="text-base font-black text-white">Crop Profile Picture</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Viewport */}
        <div className="flex flex-col items-center">
          <div
            className="relative overflow-hidden rounded-2xl select-none cursor-grab active:cursor-grabbing touch-none bg-black/50 border border-white/10"
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            {/* The Image being transformed */}
            {imageSrc && (
              <img
                src={imageSrc}
                alt="Crop preview"
                draggable={false}
                className="absolute pointer-events-none transition-none max-w-none"
                style={{
                  width: `${renderedWidth}px`,
                  height: `${renderedHeight}px`,
                  left: `${(VIEWPORT_SIZE - renderedWidth) / 2 + pan.x}px`,
                  top: `${(VIEWPORT_SIZE - renderedHeight) / 2 + pan.y}px`,
                }}
              />
            )}

            {/* Circular Mask Overlay */}
            <svg
              className="absolute inset-0 pointer-events-none w-full h-full"
              viewBox={`0 0 ${VIEWPORT_SIZE} ${VIEWPORT_SIZE}`}
            >
              <defs>
                <mask id="crop-circle-mask">
                  {/* White background: reveal the dark overlay */}
                  <rect x="0" y="0" width={VIEWPORT_SIZE} height={VIEWPORT_SIZE} fill="white" />
                  {/* Black circle: cut out transparency for the avatar */}
                  <circle
                    cx={VIEWPORT_SIZE / 2}
                    cy={VIEWPORT_SIZE / 2}
                    r={CROP_DIAMETER / 2}
                    fill="black"
                  />
                </mask>
              </defs>

              {/* Shaded area outside the circle */}
              <rect
                x="0"
                y="0"
                width={VIEWPORT_SIZE}
                height={VIEWPORT_SIZE}
                fill="rgba(5, 10, 20, 0.72)"
                mask="url(#crop-circle-mask)"
              />

              {/* Glowing circular border ring */}
              <circle
                cx={VIEWPORT_SIZE / 2}
                cy={VIEWPORT_SIZE / 2}
                r={CROP_DIAMETER / 2}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeDasharray="4 4"
                className="opacity-80"
              />
            </svg>

            {/* Hint Badge */}
            <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
              <span className="text-[10px] font-semibold text-slate-300 bg-black/60 px-2 py-0.5 rounded-full border border-white/10 backdrop-blur-sm">
                Drag to reposition · Scroll or slide to zoom
              </span>
            </div>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="space-y-1.5 px-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Zoom</span>
            <span className="text-emerald-400 tabular-nums">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, parseFloat((z - 0.15).toFixed(2))))}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-bold flex items-center justify-center text-sm cursor-pointer transition-all border border-white/5"
            >
              −
            </button>

            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
            />

            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, parseFloat((z + 0.15).toFixed(2))))}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-bold flex items-center justify-center text-sm cursor-pointer transition-all border border-white/5"
            >
              +
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all border border-white/5 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black text-xs font-black shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            Apply & Save
          </button>
        </div>
      </div>
    </div>
  );
}
