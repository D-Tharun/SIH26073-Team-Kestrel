import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react';
import { TimelineFrame } from '../types';

interface MapTimelineProps {
  frames: TimelineFrame[];
  currentFrameIndex: number;
  onSelectFrame: (index: number) => void;
}

export const MapTimeline: React.FC<MapTimelineProps> = ({
  frames,
  currentFrameIndex,
  onSelectFrame,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      onSelectFrame((currentFrameIndex + 1) % frames.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isPlaying, currentFrameIndex, frames.length, onSelectFrame]);

  const currentFrame = frames[currentFrameIndex] || frames[0];

  return (
    <div className="w-full bg-[#FFFFFF] border border-[#C7C2B8] rounded-xl p-3 shadow-xs select-none flex flex-col sm:flex-row items-center justify-between gap-3">
      {/* Playback Controls & Current Time Badge */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
            isPlaying
              ? 'bg-[#DDD8CF] hover:bg-[#C7C2B8] text-[#273844]'
              : 'bg-[#4A6B78] hover:bg-[#385460] text-white'
          }`}
          title={isPlaying ? 'Pause timeline playback' : 'Play timeline progression'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        <button
          onClick={() => onSelectFrame(Math.max(0, currentFrameIndex - 1))}
          disabled={currentFrameIndex === 0}
          className="p-1.5 rounded-lg bg-[#E8E6DD] hover:bg-[#DDD8CF] text-[#475560] disabled:opacity-40 transition-colors border border-[#DDD8CF]"
          title="Step to previous time frame"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onSelectFrame(Math.min(frames.length - 1, currentFrameIndex + 1))}
          disabled={currentFrameIndex === frames.length - 1}
          className="p-1.5 rounded-lg bg-[#E8E6DD] hover:bg-[#DDD8CF] text-[#475560] disabled:opacity-40 transition-colors border border-[#DDD8CF]"
          title="Step to next time frame"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] text-xs font-mono text-[#273844]">
          <Clock className="w-3.5 h-3.5 text-[#4A6B78]" />
          <span className="font-semibold">{currentFrame.timeStr} IST</span>
        </div>
      </div>

      {/* Interactive Timeline Stepper */}
      <div className="flex-1 w-full max-w-xl px-2">
        <div className="relative flex items-center justify-between">
          {/* Background Connecting Line */}
          <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-0.5 bg-[#DDD8CF]" />

          {/* Progress Colored Line */}
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 h-0.5 bg-[#4A6B78] transition-all duration-300"
            style={{
              width: `${(currentFrameIndex / (frames.length - 1)) * 94}%`,
            }}
          />

          {/* Time Nodes */}
          {frames.map((frame, idx) => {
            const isSelected = idx === currentFrameIndex;
            const isPast = idx <= currentFrameIndex;

            return (
              <button
                key={frame.timeStr}
                onClick={() => {
                  setIsPlaying(false);
                  onSelectFrame(idx);
                }}
                className="relative z-10 flex flex-col items-center group focus:outline-none"
              >
                {/* Node Pip */}
                <div
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all flex items-center justify-center ${
                    isSelected
                      ? 'border-[#4A6B78] bg-[#4A6B78] scale-125'
                      : isPast
                      ? 'border-[#4A6B78] bg-[#FFFFFF]'
                      : 'border-[#C7C2B8] bg-[#E8E6DD]'
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>

                {/* Node Time Label */}
                <span
                  className={`mt-1 text-[10px] font-mono transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'font-bold text-[#273844]'
                      : isPast
                      ? 'text-[#475560]'
                      : 'text-[#475560]/60'
                  }`}
                >
                  {frame.timeStr}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Frame Status Description */}
      <div className="text-[11px] text-[#475560] font-mono shrink-0 hidden lg:block text-right">
        <span>{currentFrame.label}</span>
      </div>
    </div>
  );
};
