/**
 * history.js
 * Keeps a rolling window of recent sensor readings in memory and
 * exposes small analytics helpers (moving average, rate of rise,
 * simple trend direction) that dashboard.js uses to draw the
 * charts and drive the fire-prediction gauge.
 */
(function (global) {
  'use strict';

  var MAX_SAMPLES = 30;

  /** key -> array of { t: timestamp, v: value } */
  var series = {
    flame: [],
    smoke: [],
    heat: [],
    motion: []
  };

  function push(key, value, timestamp) {
    if (!series[key]) series[key] = [];
    series[key].push({ t: timestamp || Date.now(), v: value });
    if (series[key].length > MAX_SAMPLES) {
      series[key].shift();
    }
  }

  function pushReading(reading) {
    var ts = reading.timestamp || Date.now();
    push('flame', reading.flame ? 1 : 0, ts);
    push('smoke', reading.smoke, ts);
    push('heat', reading.heat, ts);
    push('motion', reading.motion ? 1 : 0, ts);
  }

  function getSeries(key, n) {
    var data = series[key] || [];
    if (!n) return data.slice();
    return data.slice(Math.max(0, data.length - n));
  }

  function getValues(key, n) {
    return getSeries(key, n).map(function (p) { return p.v; });
  }

  function getLabels(key, n) {
    return getSeries(key, n).map(function (p) {
      var d = new Date(p.t);
      return d.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
    });
  }

  /** Simple trend over the last `window` samples: 'up' | 'down' | 'flat' */
  function trend(key, window) {
    window = window || 5;
    var values = getValues(key, window);
    if (values.length < 2) return 'flat';
    var first = values[0];
    var last = values[values.length - 1];
    var delta = last - first;
    var threshold = Math.max(0.5, Math.abs(first) * 0.02);
    if (delta > threshold) return 'up';
    if (delta < -threshold) return 'down';
    return 'flat';
  }

  /** Rate of change per minute across the last `window` samples. */
  function rateOfRise(key, window) {
    window = window || 6;
    var pts = getSeries(key, window);
    if (pts.length < 2) return 0;
    var first = pts[0];
    var last = pts[pts.length - 1];
    var elapsedMinutes = Math.max((last.t - first.t) / 60000, 1 / 60);
    return (last.v - first.v) / elapsedMinutes;
  }

  /** Average of the last `window` samples. */
  function average(key, window) {
    var values = getValues(key, window);
    if (!values.length) return 0;
    var sum = values.reduce(function (a, b) { return a + b; }, 0);
    return sum / values.length;
  }

  function clear() {
    Object.keys(series).forEach(function (k) { series[k] = []; });
  }

  global.ExtingoHistory = {
    MAX_SAMPLES: MAX_SAMPLES,
    pushReading: pushReading,
    getSeries: getSeries,
    getValues: getValues,
    getLabels: getLabels,
    trend: trend,
    rateOfRise: rateOfRise,
    average: average,
    clear: clear
  };

})(window);
