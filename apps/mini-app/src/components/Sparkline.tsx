import { useMemo } from 'react';

interface Props {
  data: number[];
  width?: number;
  height?: number;
  strokeClassName?: string;
  fillClassName?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 36,
  strokeClassName = 'stroke-brand-from',
  fillClassName = 'fill-brand-from/15',
}: Props) {
  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const pts = data.map(
      (v, i) => [i * stepX, height - 2 - ((v - min) / range) * (height - 4)] as const,
    );
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L ${(pts[pts.length - 1][0]).toFixed(1)} ${height} L 0 ${height} Z`;
    return { line, area };
  }, [data, width, height]);

  if (!line) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-full overflow-visible"
      aria-hidden="true"
    >
      <path d={area} className={fillClassName} />
      <path
        d={line}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClassName}
      />
    </svg>
  );
}
