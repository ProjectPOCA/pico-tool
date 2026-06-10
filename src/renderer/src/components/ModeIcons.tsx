import pocaBlack from '@/assets/art/poca-mark-black.svg'
import pocaRed from '@/assets/art/poca-mark-red.svg'

/**
 * Flash-mode tile icons. POCA OS uses the brand mark; the rest are drawn as
 * crisp pixel art on an 11x11 grid. When a tile is active (hovered/selected)
 * its inner square turns red and the artwork knocks out to white.
 */

function PixelArt(props: {
  cells: string[]
  palette: Record<string, string>
  active?: boolean
  px?: number
}): React.JSX.Element {
  const rows = props.cells.length
  const cols = props.cells[0].length
  const px = props.px ?? 7
  return (
    <svg
      width={cols * px}
      height={rows * px}
      viewBox={`0 0 ${cols * px} ${rows * px}`}
      shapeRendering="crispEdges"
    >
      {props.cells.flatMap((row, y) =>
        row.split('').map((ch, x) =>
          ch === '.' ? null : (
            <rect
              key={`${x}-${y}`}
              x={x * px}
              y={y * px}
              width={px}
              height={px}
              fill={props.active ? '#FFFFFF' : props.palette[ch]}
            />
          )
        )
      )}
    </svg>
  )
}

export interface ModeIconProps {
  active?: boolean
  /** Pixel cell size; 7 is the flash-mode tile scale. */
  px?: number
}

/** Badge: pixel user silhouette. */
export function BadgeIcon({ active, px }: ModeIconProps): React.JSX.Element {
  return (
    <PixelArt
      active={active}
      px={px}
      palette={{ k: '#000', r: '#FF0000' }}
      cells={[
        '...........',
        '....kkk....',
        '...kkkkk...',
        '...kkkkk...',
        '...kkkkk...',
        '....kkk....',
        '..kkkkkkk..',
        '.kkkkkkkkk.',
        '.kkkkrkkkk.',
        '.kkkkkkkkk.',
        '...........'
      ]}
    />
  )
}

/**
 * MicroPython Activity: the MicroPython "M." mark on a 13x13 grid — center
 * slot open at the top, side slots open at the bottom, dot lower-right.
 */
export function ActivityIcon({ active, px }: ModeIconProps): React.JSX.Element {
  return (
    <PixelArt
      active={active}
      px={px ?? 6}
      palette={{ k: '#000' }}
      cells={[
        'kkkkkk.kkkkkk',
        'kkkkkk.kkkkkk',
        'kkkkkk.kkkkkk',
        'kkk.kk.kk.kkk',
        'kkk.kk.kk.kkk',
        'kkk.kk.kk.kkk',
        'kkk.kk.kk.kkk',
        'kkk.kk.kk.kkk',
        'kkk.kk.kk.kkk',
        'kkk.kkkkk.kkk',
        'kkk.kkkkk.k.k',
        'kkk.kkkkk.k.k',
        'kkk.kkkkk.kkk'
      ]}
    />
  )
}

/** Raster Image: pixel landscape. */
export function RasterIcon({ active, px }: ModeIconProps): React.JSX.Element {
  return (
    <PixelArt
      active={active}
      px={px}
      palette={{ k: '#000', r: '#FF0000', y: '#FFD700' }}
      cells={[
        'kkkkkkkkkkk',
        'k.........k',
        'k......yy.k',
        'k......yy.k',
        'k.........k',
        'k..kk.....k',
        'k.kkkk.rr.k',
        'kkkkkkkrrrk',
        'kkkkkkkkkkk',
        'kkkkkkkkkkk',
        'kkkkkkkkkkk'
      ]}
    />
  )
}

export function PocaOsIcon({ active, px }: ModeIconProps): React.JSX.Element {
  // Red brand mark at rest; knocked out to white on the active red tile.
  const scale = (px ?? 7) / 7
  return (
    <img
      src={active ? pocaBlack : pocaRed}
      width={Math.round(64 * scale)}
      height={Math.round(66 * scale)}
      alt=""
      draggable={false}
      style={active ? { filter: 'invert(1)' } : undefined}
    />
  )
}
