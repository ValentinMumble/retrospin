import type {SceneKey} from './types';

export interface Era {
  label: string;
  start: number;
  end: number;
  lane: 0 | 1;
  scene: SceneKey;
  blurb: string;
}

/** Lane 0 is the main story, lane 1 the side currents that overlap it. */
export const ERAS: Era[] = [
  {
    label: "Rock 'n' roll",
    start: 1955,
    end: 1962,
    lane: 0,
    scene: 'rnr',
    blurb: 'Memphis, Chess Records and the birth of the teenager.',
  },
  {
    label: 'British Invasion',
    start: 1963,
    end: 1966,
    lane: 0,
    scene: 'pop',
    blurb: 'The Beatles, the Stones and the Kinks take over America.',
  },
  {
    label: 'Summer of Love',
    start: 1967,
    end: 1969,
    lane: 0,
    scene: 'psych',
    blurb: 'Psychedelia, long songs and the album as art.',
  },
  {
    label: 'Classic rock',
    start: 1970,
    end: 1975,
    lane: 0,
    scene: 'hard',
    blurb: 'Stadiums, double albums and guitar heroes.',
  },
  {
    label: 'Punk',
    start: 1976,
    end: 1979,
    lane: 0,
    scene: 'punk',
    blurb: 'Three chords, short songs, CBGB and the Roxy.',
  },
  {
    label: 'Post-punk & new wave',
    start: 1980,
    end: 1985,
    lane: 0,
    scene: 'postpunk',
    blurb: 'Punk energy with synthesizers, funk and gloom.',
  },
  {
    label: 'College rock',
    start: 1986,
    end: 1990,
    lane: 0,
    scene: 'alt',
    blurb: 'Indie labels and college radio build the underground.',
  },
  {label: 'Grunge', start: 1991, end: 1994, lane: 0, scene: 'alt', blurb: 'Seattle goes global.'},
  {
    label: 'Britpop',
    start: 1995,
    end: 1998,
    lane: 0,
    scene: 'britpop',
    blurb: 'Blur against Oasis, and Cool Britannia.',
  },
  {
    label: 'Garage rock revival',
    start: 2001,
    end: 2006,
    lane: 0,
    scene: 'indie',
    blurb: 'The Strokes and the White Stripes bring guitars back.',
  },
  {
    label: 'Blog-era indie',
    start: 2007,
    end: 2013,
    lane: 0,
    scene: 'indie',
    blurb: 'MP3 blogs, MySpace and festival bands.',
  },
  {
    label: 'Bedroom pop',
    start: 2014,
    end: 2018,
    lane: 0,
    scene: 'dream',
    blurb: 'Records made at home, found on streaming.',
  },
  {
    label: 'New post-punk',
    start: 2019,
    end: 2026,
    lane: 0,
    scene: 'postpunk',
    blurb: 'Talky, angry guitar bands from Dublin, London and Brooklyn.',
  },
  {
    label: 'Folk rock',
    start: 1965,
    end: 1970,
    lane: 1,
    scene: 'roots',
    blurb: 'Dylan goes electric, the Byrds go jangly.',
  },
  {
    label: 'Prog & krautrock',
    start: 1971,
    end: 1978,
    lane: 1,
    scene: 'prog',
    blurb: 'Concept albums, Moogs and motorik grooves.',
  },
  {
    label: 'Synth pop',
    start: 1980,
    end: 1986,
    lane: 1,
    scene: 'newwave',
    blurb: 'Drum machines and synthesizers top the charts.',
  },
  {
    label: 'Shoegaze & dream pop',
    start: 1988,
    end: 1993,
    lane: 1,
    scene: 'dream',
    blurb: 'Walls of guitar and voices you cannot quite hear.',
  },
  {
    label: 'Dance-punk',
    start: 2002,
    end: 2007,
    lane: 1,
    scene: 'postpunk',
    blurb: 'Cowbells, disco beats and post-punk guitars.',
  },
  {
    label: 'Psych revival',
    start: 2010,
    end: 2015,
    lane: 1,
    scene: 'psych',
    blurb: 'Tame Impala and friends rediscover the phaser pedal.',
  },
];
