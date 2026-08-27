/**
 * api.js
 * Stands in for the real Extingo device API. In production this
 * module would talk to the panel's local network endpoint or
 * MQTT bridge; here it simulates a plausible sensor feed so the
 * rest of the dashboard (history.js, dashboard.js) can be built
 * and demoed against a realistic shape of data.
 *
 * Public surface: ExtingoAPI.subscribe(fn), .getStatus(reading),
 * .setSpray(bool), .setMCB(bool), .getOverrideState()
 */
(function (global) {
  'use strict';

  var POLL_INTERVAL_MS = 2000;

  var THRESHOLDS = {
    smokeWarn: 220,
    smokeAlert: 400,
    heatWarn: 45,
    heatAlert: 60
  };

  var overrideState = {
    spray: false,
    mcb: true // main breaker on by default
  };

  var state = {
    smoke: 90,
    heat: 24,
    flameChance: 0.02,
    motionChance: 0.12,
    driftDirection: 1
  };

  var listeners = [];
  var timer = null;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function randomWalk(value, step, min, max) {
    var delta = (Math.random() - 0.48) * step;
    return clamp(value + delta, min, max);
  }

  /** Occasionally nudge the simulation toward a mini "incident" so the
   *  dashboard has something interesting to react to, then recover. */
  function maybeSpike() {
    if (Math.random() < 0.015) {
      state.smoke = clamp(state.smoke + 180 + Math.random() * 150, 0, 900);
      state.heat = clamp(state.heat + 8 + Math.random() * 10, 0, 120);
      state.flameChance = 0.35;
    } else {
      state.flameChance = Math.max(0.02, state.flameChance * 0.6);
    }
  }

  function nextReading() {
    maybeSpike();

    // Smoke and heat drift, but pull back toward baseline when spray is on.
    var smokeStep = overrideState.spray ? 12 : 18;
    var heatStep = overrideState.spray ? 0.6 : 0.9;

    state.smoke = randomWalk(state.smoke, smokeStep, 0, 900);
    state.heat = randomWalk(state.heat, heatStep, 18, 120);

    if (overrideState.spray) {
      state.smoke = clamp(state.smoke - 25, 0, 900);
      state.heat = clamp(state.heat - 0.8, 18, 120);
    }

    if (!overrideState.mcb) {
      // Pump/exhaust cannot run without the MCB energized.
      overrideState.spray = false;
    }

    var flame = Math.random() < state.flameChance;
    var motion = Math.random() < state.motionChance;

    return {
      timestamp: Date.now(),
      flame: flame,
      smoke: Math.round(state.smoke),
      heat: Math.round(state.heat * 10) / 10,
      motion: motion,
      pump: overrideState.spray,
      mcb: overrideState.mcb
    };
  }

  /** Derive NORMAL / EMERGENCY plus a human-readable reason. */
  function getStatus(reading) {
    var reasons = [];
    if (reading.flame) reasons.push('flame detected');
    if (reading.smoke >= THRESHOLDS.smokeAlert) reasons.push('smoke above alert threshold');
    if (reading.heat >= THRESHOLDS.heatAlert) reasons.push('heat above alert threshold');

    if (reasons.length) {
      return { level: 'EMERGENCY', reasons: reasons };
    }

    var watchReasons = [];
    if (reading.smoke >= THRESHOLDS.smokeWarn) watchReasons.push('smoke elevated');
    if (reading.heat >= THRESHOLDS.heatWarn) watchReasons.push('heat elevated');

    return { level: 'NORMAL', reasons: watchReasons };
  }

  function subscribe(callback) {
    listeners.push(callback);
    if (!timer) {
      timer = setInterval(function () {
        var reading = nextReading();
        listeners.forEach(function (fn) { fn(reading); });
      }, POLL_INTERVAL_MS);
      // Emit one reading immediately so the UI isn't empty on load.
      var first = nextReading();
      setTimeout(function () {
        listeners.forEach(function (fn) { fn(first); });
      }, 50);
    }
    return function unsubscribe() {
      listeners = listeners.filter(function (fn) { return fn !== callback; });
    };
  }

  function setSpray(on) {
    if (!overrideState.mcb && on) return overrideState; // guarded: needs power
    overrideState.spray = !!on;
    return overrideState;
  }

  function setMCB(on) {
    overrideState.mcb = !!on;
    if (!overrideState.mcb) overrideState.spray = false;
    return overrideState;
  }

  function getOverrideState() {
    return { spray: overrideState.spray, mcb: overrideState.mcb };
  }

  global.ExtingoAPI = {
    THRESHOLDS: THRESHOLDS,
    subscribe: subscribe,
    getStatus: getStatus,
    setSpray: setSpray,
    setMCB: setMCB,
    getOverrideState: getOverrideState
  };

})(window);
