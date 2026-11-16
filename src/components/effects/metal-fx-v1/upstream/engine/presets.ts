export type PresetName = 'chromatic' | 'silver' | 'gold';
export type PresetTheme = 'dark' | 'light';

export interface PresetMode {
  /** 7-stop palette, indexed against `u_color1..u_color7`. */
  colors: [string, string, string, string, string, string, string];
  /** Per-stop alpha weights (0..1). */
  alphas: [number, number, number, number, number, number, number];
  /** Drift angle (degrees). Multiplied by π/180 before upload. */
  direction: number;
  /** Time multiplier applied JS-side before passing into the shader. */
  speed: number;
  /** Plasma intensity (wave-field amplitude). */
  intensity: number;
  /** Noise zoom — smaller = chunkier features. */
  scale: number;
  /** Edge softness (effect 1 ignores; carried for parity). */
  softness: number;
  /** Warp strength on the field (0..1). */
  distortion: number;
  /** FBM octave / frequency multiplier. */
  complexity: number;
  /** Reserved (effect 1 ignores). */
  shape: number;
  /** 9-tap blur sample radius (0 = single tap). */
  blur: number;
  /** Vignette range (0..1). */
  vignette: number;
  /** Vignette darkening strength (0..1). */
  vigOpacity: number;
  /** Final alpha multiplier in the fragment shader (0..1). */
  shaderOpacity: number;
}

export interface Preset {
  name: PresetName;
  modes: Record<PresetTheme, PresetMode>;
}

/** preset-chromatic-both-modes.json */
const CHROMATIC: Preset = {
  name: 'chromatic',
  modes: {
    dark: {
      colors: ['#000000', '#aae8ff', '#c5fe9e', '#f7888d', '#0d0d0d', '#fffdc3', '#007cff'],
      alphas: [1, 1, 1, 1, 1, 1, 1],
      direction: 80,
      speed: 1.2,
      intensity: 2,
      scale: 1.6,
      softness: 0.18,
      distortion: 0.3,
      complexity: 0.68,
      shape: 1,
      blur: 1,
      vignette: 0.26,
      vigOpacity: 0.6,
      shaderOpacity: 1,
    },
    light: {
      colors: ['#ffffff', '#ffffff', '#ffffff', '#ffb3b3', '#adadad', '#f5ff70', '#007cff'],
      alphas: [1, 1, 1, 1, 1, 1, 1],
      direction: 80,
      speed: 1.2,
      intensity: 2,
      scale: 2.5,
      softness: 0.18,
      distortion: 0.3,
      complexity: 0.68,
      shape: 1,
      blur: 1,
      vignette: 0.24,
      vigOpacity: 0.16,
      shaderOpacity: 1,
    },
  },
};

/** preset-silver-both-modes.json */
const SILVER: Preset = {
  name: 'silver',
  modes: {
    dark: {
      colors: ['#000000', '#dedede', '#747270', '#e5e5e5', '#0d0d0d', '#ffffff', '#e6e6e6'],
      alphas: [1, 1, 1, 1, 1, 1, 1],
      direction: 80,
      speed: 1.2,
      intensity: 2,
      scale: 2.5,
      softness: 0.18,
      distortion: 0.3,
      complexity: 0.68,
      shape: 1,
      blur: 1,
      vignette: 0.26,
      vigOpacity: 0.6,
      shaderOpacity: 0.88,
    },
    light: {
      colors: ['#f6f6f6', '#ffffff', '#ffffff', '#f7f7f7', '#c9c9c9', '#d0d0d0', '#d1d1d1'],
      alphas: [1, 1, 1, 1, 1, 1, 1],
      direction: 80,
      speed: 1.2,
      intensity: 2,
      scale: 2.5,
      softness: 0.18,
      distortion: 0.3,
      complexity: 0.68,
      shape: 1,
      blur: 1,
      vignette: 0.2,
      vigOpacity: 0.26,
      shaderOpacity: 1,
    },
  },
};

/** preset-gold-both-modes.json */
const GOLD: Preset = {
  name: 'gold',
  modes: {
    dark: {
      colors: ['#000000', '#ffffff', '#ffffff', '#f7d488', '#0d0d0d', '#fffdc3', '#ffffff'],
      alphas: [1, 1, 1, 1, 1, 1, 1],
      direction: 80,
      speed: 1.0,
      intensity: 2,
      scale: 2.5,
      softness: 0.18,
      distortion: 0.3,
      complexity: 0.68,
      shape: 1,
      blur: 1,
      vignette: 0.26,
      vigOpacity: 0.6,
      shaderOpacity: 0.92,
    },
    light: {
      colors: ['#fff8e1', '#fffbe0', '#ffffff', '#fff6d6', '#d2c7a7', '#dcd2bc', '#f9f7e5'],
      alphas: [1, 1, 1, 1, 1, 1, 1],
      direction: 80,
      speed: 1.2,
      intensity: 2,
      scale: 2.5,
      softness: 0.18,
      distortion: 0.3,
      complexity: 0.68,
      shape: 1,
      blur: 1,
      vignette: 0.22,
      vigOpacity: 0.24,
      shaderOpacity: 1,
    },
  },
};

export const PRESETS: Record<PresetName, Preset> = {
  chromatic: CHROMATIC,
  silver: SILVER,
  gold: GOLD,
};

export { hexToRgb } from './color';
