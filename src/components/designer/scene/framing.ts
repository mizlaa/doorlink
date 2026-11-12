import type { GateLook } from '@/components/three-v2/GateScene'

/**
 * What the designer's camera frames, for any product. The rig is the same
 * for garage doors, gates, fences and shutters; only this description
 * changes, so a fix to the viewer reaches every product.
 *
 * Distances are metres, angles degrees. "Fit" boxes are the area the
 * opening view must show (already including the margin around the
 * product), at the 3D lens and the 2D long lens respectively.
 */
export interface RigFraming {
  /** Reframe gently when this changes (product or size). */
  key: string
  /** The 3D orbit pivot. */
  centre: [number, number, number]
  /** Width × height that must fit in the opening 3D view. */
  fit3d: [number, number]
  /** Eye height of the opening 3D view. */
  eye: number
  /** The opening 3D view's angle from straight on (positive: from the right). */
  azimuth: number
  /** 3D orbit limits. */
  polar: [number, number]
  azimuthRange: [number, number]
  /** Width × height of the 2D elevation, and where its middle is across. */
  fit2d: [number, number]
  centreX2d: number
  /** Where the ground sits in the 2D frame: 0.76 puts it near the bottom with the product above. */
  ground2d: number
  /** How far panning may move the 2D view centre. */
  panX: [number, number]
  panMaxY: number
  /** In 2D only things within this distance in front of the product are drawn (no trees across the elevation). */
  clipDepth: number
  /** The closest the 3D camera may come (pinch or wheel), so the product never fills the screen as a blur. */
  minDistance?: number
}

/** The approved garage framing: the house from the driveway, the door large and low in frame. */
export function garageFraming(doorW: number, doorH: number): RigFraming {
  return {
    key: `garage:${doorW}:${doorH}`,
    centre: [0, doorH + 0.3, 0],
    fit3d: [doorW / 0.44, doorH / 0.36],
    eye: 1.62,
    azimuth: 13,
    polar: [70, 100],
    azimuthRange: [-58, 58],
    fit2d: [doorW + 2.4, doorH + 2.5],
    centreX2d: 0,
    ground2d: 0.76,
    panX: [-(doorW / 2 + 2.5), doorW / 2 + 2.5],
    panMaxY: doorH + 2.4,
    clipDepth: 6.2,
  }
}

const PILLAR = 0.4

/**
 * Gates, fences and shutters. The opening view shows the whole
 * installation: a sliding gate with its run-back, swing leaves with room
 * to open towards the camera, a fence run end to end, a shutter in its
 * frame with the box above.
 */
export function gateFraming(look: Pick<GateLook, 'kind' | 'widthM' | 'heightM' | 'leaves' | 'opensOut' | 'slidesLeft'>): RigFraming {
  const w = look.widthM
  const h = look.heightM
  const key = `${look.kind}:${w}:${h}:${look.leaves}:${look.opensOut ? 'out' : 'in'}:${look.slidesLeft ? 'left' : 'right'}`

  if (look.kind === 'shutter' || look.kind === 'shop') {
    // The opening sits on a wall: a window 0.9 m up, a shopfront at street level. The box adds ~0.35 m above.
    const sill = look.kind === 'shop' ? 0 : 0.9
    const top = sill + h + 0.45
    return {
      key,
      centre: [0, sill + h / 2, 0],
      fit3d: [(w + 1.2) / 0.78, (h + 1.0) / 0.72],
      eye: 1.62,
      azimuth: 16,
      polar: [66, 100],
      azimuthRange: [-55, 55],
      minDistance: Math.max(3, h * 1.6),
      fit2d: [w + 1.6, top / 0.82],
      centreX2d: 0,
      ground2d: 0.76,
      panX: [-(w / 2 + 2), w / 2 + 2],
      panMaxY: top + 1,
      clipDepth: 3.5,
    }
  }

  // Left and right edges of everything that moves or stands.
  let minX = -w / 2 - PILLAR
  let maxX = w / 2 + PILLAR
  let openDepth = 0.5
  if (look.kind === 'sliding') {
    // The leaf runs back behind the fence by about its own width, on a track that long.
    if (look.slidesLeft) minX = -(1.5 * w + 0.5)
    else maxX = 1.5 * w + 0.5
  } else if (look.kind === 'swing' || look.kind === 'pedestrian') {
    const leaves = look.kind === 'pedestrian' ? 1 : look.leaves
    openDepth = w / leaves + 0.3
  } else if (look.kind === 'fence') {
    minX = -w / 2 - 0.2
    maxX = w / 2 + 0.2
  }
  const span = maxX - minX
  const middle = (minX + maxX) / 2
  const fill = look.kind === 'fence' ? 0.86 : 0.8
  return {
    key,
    // Swing leaves sweep towards the viewer (inward) or away (outward): centre on the sweep.
    centre: [middle, h * 0.5, look.kind === 'swing' || look.kind === 'pedestrian' ? openDepth * 0.25 * (look.opensOut ? -1 : 1) : 0],
    fit3d: [span / fill, (h + 0.9) / 0.6],
    eye: 1.62,
    azimuth: look.kind === 'sliding' ? 20 : 24,
    // Enough to see a leaf swing or a gate run back, never along the fence line or from overhead.
    polar: [64, 96],
    azimuthRange: [-60, 60],
    minDistance: Math.max(3, h * 2, look.kind === 'fence' ? w * 0.4 : 0),
    fit2d: [span + 1.2, (h + 0.5) / 0.8],
    centreX2d: middle,
    ground2d: 0.76,
    panX: [minX - 1.5, maxX + 1.5],
    panMaxY: h + 2,
    clipDepth: openDepth + 4,
  }
}
