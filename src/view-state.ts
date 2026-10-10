import type { HaMapPaths } from './types.js';

export interface MapViewStateInput {
  playing: boolean;
  timelineIndex: number;
  timelineLength: number;
  fullPaths: HaMapPaths[];
  clippedPaths: HaMapPaths[];
}

export interface MapViewState {
  /** Paths currently drawn on the map */
  paths: HaMapPaths[];
  /** Whether live entity markers (non-zone) should be shown */
  showLiveEntities: boolean;
  /** True when view represents "now" (end of timeline, not playing) */
  isLive: boolean;
}

/**
 * Decide what the map should show for playback / scrub / live.
 * hass updates must reuse this so they never replace clipped paths mid-scrub.
 */
export function resolveMapViewState(input: MapViewStateInput): MapViewState {
  const { playing, timelineIndex, timelineLength, fullPaths, clippedPaths } =
    input;

  if (timelineLength === 0) {
    return {
      paths: fullPaths,
      showLiveEntities: true,
      isLive: true,
    };
  }

  const atEnd = timelineIndex >= timelineLength - 1;
  const isLive = atEnd && !playing;

  if (isLive) {
    return {
      paths: fullPaths,
      // Live markers come from hass.states (with entity pictures).
      showLiveEntities: true,
      isLive: true,
    };
  }

  return {
    paths: clippedPaths,
    // Hide live markers (they'd stay at "now"); scrub pins use editableLocations
    // styled like HA cluster/floating markers, tip-anchored above path dots.
    showLiveEntities: false,
    isLive: false,
  };
}

/** What hass setter should apply without destroying historical scrub/play view. */
export function resolveHassMapRefresh(options: {
  playing: boolean;
  isLive: boolean;
  displayPaths: HaMapPaths[];
  fullPaths: HaMapPaths[];
}): { paths: HaMapPaths[]; showLiveEntities: boolean } {
  if (options.playing || !options.isLive) {
    return {
      paths: options.displayPaths,
      showLiveEntities: false,
    };
  }
  return {
    paths: options.fullPaths,
    showLiveEntities: true,
  };
}
