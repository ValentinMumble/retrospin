import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import {select} from 'd3-selection';
import {zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform} from 'd3-zoom';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {GalaxyLink} from '../api';
import type {LikesByAlbum} from '../likes';
import {SCENES} from '../scenes';
import type {Album} from '../types';

interface GalaxyProps {
  albums: Album[];
  links: GalaxyLink[] | null;
  linksError: string | null;
  likes: LikesByAlbum | null;
  selectedId: string | null;
  /** "Light up related" from the album panel. */
  lit: ReadonlySet<string> | null;
  /** The album panel covers the right side (or the bottom on phones): centre stars in what stays visible. */
  panelOpen: boolean;
  firstYear: number;
  lastYear: number;
  onSelect: (id: string) => void;
}

interface Star extends SimulationNodeDatum {
  album: Album;
  /** Width of the cover, in galaxy units. */
  size: number;
}

interface Beam extends SimulationLinkDatum<Star> {
  strength: number;
  kind: GalaxyLink[3];
}

const RING_START = 90;
const RING_STEP = 19;

/** Spotify's 64 px version of a cover: light enough to show every album at once. */
function thumbnail(url: string) {
  return url.replace('ab67616d00001e02', 'ab67616d00004851').replace('ab67616d0000b273', 'ab67616d00004851');
}

/** Each year has its ring: the first year near the centre, today at the rim. */
function ringRadius(year: number, firstYear: number) {
  return RING_START + (year - firstYear) * RING_STEP;
}

/** A stable pseudo-random number in [0, 1) for a string, so the galaxy looks the same on every visit. */
function seeded(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function Galaxy({
  albums,
  links,
  linksError,
  likes,
  selectedId,
  lit,
  panelOpen,
  firstYear,
  lastYear,
  onSelect,
}: GalaxyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const sceneRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const [size, setSize] = useState({width: 0, height: 0});
  const [hover, setHover] = useState<{star: Star; x: number; y: number} | null>(null);
  /** Every link at once is a lot to read: by default only the selected (or hovered) album's links show. */
  const [showAllLinks, setShowAllLinks] = useState(false);
  /** Dims every album that is not by an artist from the Spotify liked songs. */
  const [highlightLikes, setHighlightLikes] = useState(false);

  const layout = useMemo(() => {
    const ids = new Set(albums.map(album => album.id));
    const visible = (links ?? []).filter(([first, second]) => ids.has(first) && ids.has(second));
    const degree = new Map<string, number>();
    for (const [first, second] of visible) {
      degree.set(first, (degree.get(first) ?? 0) + 1);
      degree.set(second, (degree.get(second) ?? 0) + 1);
    }
    const stars: Star[] = albums.map(album => {
      const angle = seeded(album.id) * Math.PI * 2;
      const radius = ringRadius(album.year, firstYear);
      return {
        album,
        size: 24 + Math.min(12, Math.sqrt(degree.get(album.id) ?? 0) * 3),
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
    const beams: Beam[] = visible.map(([source, target, strength, kind]) => ({source, target, strength, kind}));
    const simulation = forceSimulation(stars)
      .force(
        'link',
        forceLink<Star, Beam>(beams)
          .id(star => star.album.id)
          .distance(42)
          .strength(beam => 0.05 + beam.strength * 0.25),
      )
      .force('charge', forceManyBody<Star>().strength(-12))
      .force('radial', forceRadial<Star>(star => ringRadius(star.album.year, firstYear)).strength(0.55))
      .force(
        'collide',
        forceCollide<Star>(star => star.size / 2 + 3),
      )
      .stop();
    // Distance from the centre is time: after each step, put every album back on its year's ring (with a little
    // play so covers can make room). Similarity then only moves albums around the circle, never across years.
    const play = RING_STEP * 0.4;
    for (let tick = 0; tick < 300; tick += 1) {
      simulation.tick();
      for (const star of stars) {
        const ring = ringRadius(star.album.year, firstYear);
        const x = star.x ?? 0;
        const y = star.y ?? 0;
        const radius = Math.hypot(x, y) || 1;
        const kept = Math.min(ring + play, Math.max(ring - play, radius));
        star.x = (x / radius) * kept;
        star.y = (y / radius) * kept;
      }
    }
    const byId = new Map(stars.map(star => [star.album.id, star]));
    return {stars, beams, byId};
  }, [albums, links, firstYear]);

  const neighbours = useMemo(() => {
    if (!selectedId) return null;
    const found = new Set<string>([selectedId]);
    for (const beam of layout.beams) {
      const source = beam.source as Star;
      const target = beam.target as Star;
      if (source.album.id === selectedId) found.add(target.album.id);
      if (target.album.id === selectedId) found.add(source.album.id);
    }
    return found;
  }, [selectedId, layout]);

  const starfield = useMemo(
    () =>
      [...Array(220).keys()].map(index => ({
        left: seeded(`x${index}`) * 100,
        top: seeded(`y${index}`) * 100,
        radius: 0.4 + seeded(`r${index}`) * 1.1,
        opacity: 0.15 + seeded(`o${index}`) * 0.5,
      })),
    [],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => setSize({width: container.clientWidth, height: container.clientHeight}));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Pan with a drag, zoom with the wheel or a pinch.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.12, 8])
      .on('zoom', (event: {transform: ZoomTransform}) => {
        transformRef.current = event.transform;
        sceneRef.current?.setAttribute('transform', event.transform.toString());
        setHover(null);
      });
    select(svg).call(behavior).on('dblclick.zoom', null);
    zoomRef.current = behavior;
    return () => {
      select(svg).on('.zoom', null);
    };
  }, []);

  const moveTo = (target: ZoomTransform, duration = 650) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (duration <= 0 || reduced) {
      behavior.transform(select(svg), target);
      return;
    }
    const start = transformRef.current;
    const started = performance.now();
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const scale = start.k + (target.k - start.k) * eased;
      const x = start.x + (target.x - start.x) * eased;
      const y = start.y + (target.y - start.y) * eased;
      behavior.transform(select(svg), zoomIdentity.translate(x, y).scale(scale));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  // Fit the whole galaxy on screen when it first appears or its stars change (and nothing is selected).
  const fitted = useRef<string>('');
  useEffect(() => {
    if (!size.width || !size.height || layout.stars.length === 0) return;
    const key = `${layout.stars.length}:${size.width > 760}`;
    if (fitted.current === key || selectedId) return;
    fitted.current = key;
    const extent = ringRadius(lastYear, firstYear) + 40;
    const scale = Math.min(size.width, size.height) / (extent * 2);
    const target = zoomIdentity.translate(size.width / 2, size.height / 2).scale(scale);
    moveTo(target, 0);
  }, [size, layout, selectedId, firstYear, lastYear]);

  // Travel to the selected star, keeping it clear of the album panel.
  useEffect(() => {
    const star = selectedId ? layout.byId.get(selectedId) : null;
    if (!star || !size.width) return;
    const wide = size.width > 760;
    const focusX = panelOpen && wide ? (size.width - 440) / 2 : size.width / 2;
    const focusY = panelOpen && !wide ? size.height * 0.28 : size.height / 2;
    const scale = Math.max(transformRef.current.k, 1.6);
    moveTo(zoomIdentity.translate(focusX - (star.x ?? 0) * scale, focusY - (star.y ?? 0) * scale).scale(scale));
  }, [selectedId, layout, panelOpen, size.width, size.height]);

  const decades: number[] = [];
  for (let year = Math.ceil(firstYear / 10) * 10; year <= lastYear; year += 10) decades.push(year);

  const faded = (id: string) => {
    if (neighbours) return !neighbours.has(id);
    if (lit) return !lit.has(id);
    if (highlightLikes && likes) return !likes.has(id);
    return false;
  };
  const labelled = (id: string) => Boolean(neighbours?.has(id)) || hover?.star.album.id === id;

  return (
    <div ref={containerRef} className="galaxy">
      <svg className="galaxy-sky" aria-hidden="true">
        {starfield.map((dot, index) => (
          <circle key={index} cx={`${dot.left}%`} cy={`${dot.top}%`} r={dot.radius} opacity={dot.opacity} />
        ))}
      </svg>
      <svg
        ref={svgRef}
        className="galaxy-svg"
        role="img"
        aria-label="Galaxy of albums: similar records are linked"
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="galaxy-disc" clipPathUnits="objectBoundingBox">
            <circle cx={0.5} cy={0.5} r={0.5} />
          </clipPath>
        </defs>
        <g ref={sceneRef}>
          <g className="galaxy-rings">
            {decades.map(year => (
              <g key={year}>
                <circle r={ringRadius(year, firstYear)} />
                <text x={0} y={-ringRadius(year, firstYear) - 6}>
                  {year}
                </text>
              </g>
            ))}
          </g>
          <g className="galaxy-links">
            {layout.beams.map(beam => {
              const source = beam.source as Star;
              const target = beam.target as Star;
              const active = Boolean(selectedId && (source.album.id === selectedId || target.album.id === selectedId));
              const hovered = hover !== null && (source === hover.star || target === hover.star);
              if (!showAllLinks && !active && !hovered) return null;
              const dim = faded(source.album.id) || faded(target.album.id);
              return (
                <line
                  key={`${source.album.id}|${target.album.id}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  className={`galaxy-link is-${beam.kind}${active ? ' is-active' : ''}${dim && !active ? ' is-faded' : ''}`}
                  strokeWidth={0.4 + beam.strength * 1.2}
                />
              );
            })}
          </g>
          <g className="galaxy-stars">
            {layout.stars.map(star => {
              const {album} = star;
              const half = star.size / 2;
              const cover = album.spotify?.coverSmall;
              // Sharp covers for the selected album and its neighbours, light thumbnails for the rest.
              const sharp = neighbours?.has(album.id) ?? false;
              const songs = likes?.get(album.id)?.songs.length ?? 0;
              const classes = [
                'galaxy-star',
                album.id === selectedId ? 'is-selected' : '',
                faded(album.id) ? 'is-faded' : '',
                likes?.has(album.id) ? 'is-liked' : '',
                songs > 0 ? 'has-songs' : '',
              ];
              return (
                <g
                  key={album.id}
                  className={classes.filter(Boolean).join(' ')}
                  transform={`translate(${star.x} ${star.y})`}
                  style={{color: SCENES[album.scene].color}}
                  onClick={() => onSelect(album.id)}
                  onPointerEnter={event => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) setHover({star, x: event.clientX - rect.left, y: event.clientY - rect.top});
                  }}
                  onPointerLeave={() => setHover(current => (current?.star === star ? null : current))}
                >
                  <circle className="galaxy-frame" r={half} />
                  {cover && (
                    <image
                      href={sharp ? cover : thumbnail(cover)}
                      x={-half}
                      y={-half}
                      width={star.size}
                      height={star.size}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath="url(#galaxy-disc)"
                    />
                  )}
                  {songs > 0 && (
                    <g className="galaxy-heart" transform={`translate(${half * 0.72} ${-half * 0.72})`}>
                      <circle r={Math.max(4.5, star.size * 0.2)} />
                      <text>♥</text>
                    </g>
                  )}
                  {labelled(album.id) && (
                    <text className="galaxy-label" x={0} y={half + 12}>
                      {album.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {hover && (
        <div className="galaxy-tooltip" style={{left: hover.x + 14, top: hover.y + 14}}>
          {hover.star.album.spotify?.coverSmall && <img src={hover.star.album.spotify.coverSmall} alt="" />}
          <span>
            <b>{hover.star.album.title}</b>
            <span>
              {hover.star.album.artist} · {hover.star.album.year}
            </span>
          </span>
        </div>
      )}

      <div className="galaxy-hint">
        <p>
          {linksError
            ? `No links yet: ${linksError}`
            : links === null
              ? 'Charting the galaxy…'
              : 'The centre is 1955, the rim is today. Similar records sit close. A pink ring means an artist you like, a heart means songs you liked. Drag, scroll or pinch to move, click a record to see its links.'}
        </p>
        {likes && (
          <button
            type="button"
            className="toggle"
            aria-pressed={highlightLikes}
            onClick={() => setHighlightLikes(value => !value)}
          >
            <span aria-hidden="true">♥</span> {highlightLikes ? 'Show everything' : 'Highlight my likes'}
          </button>
        )}
        <button
          type="button"
          className="toggle"
          aria-pressed={showAllLinks}
          onClick={() => setShowAllLinks(value => !value)}
        >
          {showAllLinks ? 'Hide links' : 'Show all links'}
        </button>
      </div>
    </div>
  );
}
