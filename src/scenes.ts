import type {SceneKey} from './types';

export const SCENES: Record<SceneKey, {label: string; color: string}> = {
  rnr: {label: "Rock 'n' roll", color: '#ff6a3d'},
  pop: {label: '60s pop & beat', color: '#ffd447'},
  roots: {label: 'Folk & roots', color: '#a8c256'},
  psych: {label: 'Psychedelia', color: '#d65cff'},
  art: {label: 'Art rock & glam', color: '#ff7eb6'},
  prog: {label: 'Prog & krautrock', color: '#8f7dff'},
  hard: {label: 'Hard rock & metal', color: '#ff3d3d'},
  soft: {label: 'Soft rock', color: '#ffab5e'},
  punk: {label: 'Punk', color: '#c4f53d'},
  postpunk: {label: 'Post-punk & goth', color: '#4fc3f7'},
  newwave: {label: 'New wave & synth', color: '#2ee6c5'},
  alt: {label: 'Alternative & grunge', color: '#efe3cc'},
  dream: {label: 'Dream pop & shoegaze', color: '#b8c0ff'},
  britpop: {label: 'Britpop', color: '#5a8dee'},
  indie: {label: 'Indie & garage revival', color: '#7ee081'},
};

export const SCENE_ORDER = Object.keys(SCENES) as SceneKey[];
