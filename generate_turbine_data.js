/**
 * Script to generate Steam Turbine market data from existing Solar Micro Inverter data.
 * Replaces segment types while preserving geography structure and total market sizes.
 */
const fs = require('fs');
const path = require('path');

const valueData = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/value.json'), 'utf-8'));
const volumeData = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/volume.json'), 'utf-8'));

// ---- NEW SEGMENT DEFINITIONS ----

// Proportions for each segment (base year), with slight year-over-year shift factors
const SEGMENTS = {
  "By Turbine Type": {
    segments: {
      "Impulse Turbines":          { basePct: 0.28, growthBias: 0.98 },
      "Reaction Turbines":         { basePct: 0.35, growthBias: 1.01 },
      "Combined Cycle Turbines":   { basePct: 0.22, growthBias: 1.04 },
      "Cogeneration Turbines":     { basePct: 0.15, growthBias: 1.02 },
    }
  },
  "By Rated Capacity": {
    segments: {
      "Below 70 MW":       { basePct: 0.38, growthBias: 0.99 },
      "70 MW to 150 MW":   { basePct: 0.40, growthBias: 1.01 },
      "Above 150 MW":      { basePct: 0.22, growthBias: 1.03 },
    }
  },
  "By Exhaust Type": {
    segments: {
      "Condensing Steam Turbines":        { basePct: 0.62, growthBias: 1.00 },
      "Back Pressure Steam Turbines":     { basePct: 0.38, growthBias: 1.01 },
    }
  },
  "By Industry Vertical": {
    // This is hierarchical: Power Generation has sub-segments
    segments: {
      "Power Generation": {
        basePct: 0.42,
        growthBias: 1.01,
        children: {
          "Thermal Power Plants":       { basePct: 0.45, growthBias: 0.98 },
          "Nuclear Power Plants":       { basePct: 0.22, growthBias: 1.01 },
          "Geothermal":                 { basePct: 0.10, growthBias: 1.05 },
          "Solar Thermal":              { basePct: 0.08, growthBias: 1.08 },
          "Biomass & Waste-to-Energy":  { basePct: 0.15, growthBias: 1.03 },
        }
      },
      "Oil & Gas":                    { basePct: 0.20, growthBias: 0.99 },
      "Chemicals":                    { basePct: 0.12, growthBias: 1.02 },
      "Refineries & Petrochemicals":  { basePct: 0.10, growthBias: 1.00 },
      "Sugar & Food Processing":      { basePct: 0.08, growthBias: 1.03 },
      "Others (Marine, Steel & Metallurgy, Pulp & Paper, etc.)": { basePct: 0.08, growthBias: 0.97 },
    }
  }
};

// Geography-specific proportion adjustments (multiplied to base proportions, then renormalized)
const GEO_ADJUSTMENTS = {
  "Global": {},
  "North America": {
    "By Turbine Type": { "Combined Cycle Turbines": 1.15, "Impulse Turbines": 0.90 },
    "By Rated Capacity": { "Above 150 MW": 1.12 },
    "By Industry Vertical": { "Oil & Gas": 1.15, "Power Generation": 0.95 }
  },
  "Europe": {
    "By Turbine Type": { "Reaction Turbines": 1.08, "Cogeneration Turbines": 1.10 },
    "By Rated Capacity": { "70 MW to 150 MW": 1.05 },
    "By Industry Vertical": { "Chemicals": 1.15, "Power Generation": 1.05 }
  },
  "Asia Pacific": {
    "By Turbine Type": { "Reaction Turbines": 1.05, "Combined Cycle Turbines": 1.08 },
    "By Rated Capacity": { "Above 150 MW": 1.10 },
    "By Industry Vertical": { "Power Generation": 1.10, "Sugar & Food Processing": 1.20 }
  },
  "Latin America": {
    "By Turbine Type": { "Impulse Turbines": 1.10, "Cogeneration Turbines": 0.90 },
    "By Industry Vertical": { "Sugar & Food Processing": 1.40, "Oil & Gas": 1.10 }
  },
  "Middle East & Africa": {
    "By Turbine Type": { "Impulse Turbines": 1.05 },
    "By Rated Capacity": { "Below 70 MW": 1.10 },
    "By Industry Vertical": { "Oil & Gas": 1.30, "Refineries & Petrochemicals": 1.25 }
  },
};

// For countries, inherit from their parent region
const REGION_MAP = {
  "U.S.": "North America", "Canada": "North America",
  "U.K.": "Europe", "Germany": "Europe", "Italy": "Europe", "France": "Europe",
  "Spain": "Europe", "Russia": "Europe", "Rest of Europe": "Europe",
  "China": "Asia Pacific", "India": "Asia Pacific", "Japan": "Asia Pacific",
  "South Korea": "Asia Pacific", "ASEAN": "Asia Pacific", "Australia": "Asia Pacific",
  "Rest of Asia Pacific": "Asia Pacific",
  "Brazil": "Latin America", "Argentina": "Latin America", "Mexico": "Latin America",
  "Rest of Latin America": "Latin America",
  "GCC": "Middle East & Africa", "South Africa": "Middle East & Africa",
  "Rest of Middle East & Africa": "Middle East & Africa",
};

/**
 * Get the total market value for a geography for a given year
 * (sum of any one existing segment type's values)
 * For years beyond the source data range, extrapolate using CAGR from last 2 known years
 */
function getTotal(data, geography, year) {
  const geoData = data[geography];
  if (!geoData) return 0;

  // Use the first available segment type to get total
  for (const segType of Object.keys(geoData)) {
    if (segType === 'By Region' || segType === 'By Country') continue;
    const segments = geoData[segType];
    let total = 0;
    let hasData = false;
    for (const seg of Object.keys(segments)) {
      const val = segments[seg][year.toString()];
      if (typeof val === 'number') {
        total += val;
        hasData = true;
      }
    }
    if (hasData && total > 0) return total;

    // If no data for this year, extrapolate from last known years
    if (!hasData) {
      // Find last 2 known years
      const knownYears = [];
      for (let y = year - 1; y >= 2019; y--) {
        let yTotal = 0;
        let yHasData = false;
        for (const seg of Object.keys(segments)) {
          const val = segments[seg][y.toString()];
          if (typeof val === 'number') { yTotal += val; yHasData = true; }
        }
        if (yHasData && yTotal > 0) {
          knownYears.push({ year: y, total: yTotal });
          if (knownYears.length >= 2) break;
        }
      }
      if (knownYears.length >= 2) {
        // Use growth rate between last 2 known years to extrapolate
        const growthRate = knownYears[0].total / knownYears[1].total;
        const yearsForward = year - knownYears[0].year;
        return knownYears[0].total * Math.pow(growthRate, yearsForward);
      } else if (knownYears.length === 1) {
        // Use 10% growth as fallback
        const yearsForward = year - knownYears[0].year;
        return knownYears[0].total * Math.pow(1.10, yearsForward);
      }
    }
  }
  return 0;
}

/**
 * Apply growth bias over years - proportions shift slightly each year from base
 */
function getAdjustedPct(basePct, growthBias, year, baseYear) {
  const yearDiff = year - baseYear;
  return basePct * Math.pow(growthBias, yearDiff);
}

/**
 * Generate segment data for a geography
 */
function generateSegmentData(sourceData, geography, years) {
  const result = {};
  const baseYear = 2026;

  // Get geo adjustments (inherit from region for countries)
  const region = REGION_MAP[geography] || geography;
  const geoAdj = GEO_ADJUSTMENTS[region] || {};

  for (const [segTypeName, segTypeDef] of Object.entries(SEGMENTS)) {
    result[segTypeName] = {};
    const segAdj = geoAdj[segTypeName] || {};

    // Collect all leaf-level entries for this segment type (for normalization)
    const leafEntries = []; // { path: [segTypeName, ...keys], timeSeries: {} }

    for (const [segName, segDef] of Object.entries(segTypeDef.segments)) {
      if (segDef.children) {
        // Hierarchical segment (e.g., Power Generation with sub-segments)
        const parentBasePct = segDef.basePct;
        const parentGrowthBias = segDef.growthBias;
        const parentAdj = segAdj[segName] || 1.0;

        // Create parent node with year data (will be aggregate)
        result[segTypeName][segName] = {};

        // Generate sub-segment data nested under parent
        for (const [childName, childDef] of Object.entries(segDef.children)) {
          const childTimeSeries = {};
          for (const year of years) {
            const total = getTotal(sourceData, geography, year);
            const parentPct = getAdjustedPct(parentBasePct, parentGrowthBias, year, baseYear) * parentAdj;
            const childPct = getAdjustedPct(childDef.basePct, childDef.growthBias, year, baseYear);
            const absolutePct = parentPct * childPct;
            childTimeSeries[year.toString()] = Math.round(total * absolutePct * 10) / 10;
          }
          // Nest child under parent
          result[segTypeName][segName][childName] = childTimeSeries;
          leafEntries.push({ ref: result[segTypeName][segName], key: childName });
        }

        // Calculate parent aggregate (sum of children) for each year
        const childKeys = Object.keys(segDef.children);
        for (const year of years) {
          const yearStr = year.toString();
          let parentTotal = 0;
          for (const ck of childKeys) {
            parentTotal += result[segTypeName][segName][ck][yearStr] || 0;
          }
          result[segTypeName][segName][yearStr] = Math.round(parentTotal * 10) / 10;
        }
        result[segTypeName][segName]["_aggregated"] = true;

        leafEntries.push({ ref: result[segTypeName], key: segName, isParent: true });
      } else {
        // Flat segment
        const adj = segAdj[segName] || 1.0;
        const timeSeries = {};
        for (const year of years) {
          const total = getTotal(sourceData, geography, year);
          const pct = getAdjustedPct(segDef.basePct, segDef.growthBias, year, baseYear) * adj;
          timeSeries[year.toString()] = Math.round(total * pct * 10) / 10;
        }
        result[segTypeName][segName] = timeSeries;
        leafEntries.push({ ref: result[segTypeName], key: segName });
      }
    }

    // Normalize: ensure all leaf segments within each type sum to total for each year
    // For hierarchical types, normalize the leaf-level (children) values
    for (const year of years) {
      const total = getTotal(sourceData, geography, year);
      const yearStr = year.toString();

      // Collect all leaf values
      let leafSum = 0;
      const leafRefs = [];
      for (const [segName, segDef] of Object.entries(segTypeDef.segments)) {
        if (segDef.children) {
          for (const childName of Object.keys(segDef.children)) {
            const val = result[segTypeName][segName][childName][yearStr] || 0;
            leafSum += val;
            leafRefs.push({ parent: segName, child: childName, val });
          }
        } else {
          const val = result[segTypeName][segName][yearStr] || 0;
          leafSum += val;
          leafRefs.push({ parent: null, child: segName, val });
        }
      }

      if (leafSum > 0 && total > 0) {
        const factor = total / leafSum;
        for (const lr of leafRefs) {
          if (lr.parent) {
            result[segTypeName][lr.parent][lr.child][yearStr] =
              Math.round(result[segTypeName][lr.parent][lr.child][yearStr] * factor * 10) / 10;
          } else {
            result[segTypeName][lr.child][yearStr] =
              Math.round(result[segTypeName][lr.child][yearStr] * factor * 10) / 10;
          }
        }

        // Fix final rounding on the last leaf
        let newSum = 0;
        for (let i = 0; i < leafRefs.length - 1; i++) {
          const lr = leafRefs[i];
          newSum += lr.parent
            ? result[segTypeName][lr.parent][lr.child][yearStr]
            : result[segTypeName][lr.child][yearStr];
        }
        const lastLr = leafRefs[leafRefs.length - 1];
        const remainder = Math.round((total - newSum) * 10) / 10;
        if (lastLr.parent) {
          result[segTypeName][lastLr.parent][lastLr.child][yearStr] = remainder;
        } else {
          result[segTypeName][lastLr.child][yearStr] = remainder;
        }

        // Recalculate parent aggregates after normalization
        for (const [segName, segDef] of Object.entries(segTypeDef.segments)) {
          if (segDef.children) {
            let parentSum = 0;
            for (const childName of Object.keys(segDef.children)) {
              parentSum += result[segTypeName][segName][childName][yearStr] || 0;
            }
            result[segTypeName][segName][yearStr] = Math.round(parentSum * 10) / 10;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Re-map a "By Region"/"By Country" data structure to new year range.
 * Keeps existing years that overlap; extrapolates for years beyond source range.
 */
function remapYears(segData, targetYears) {
  const result = {};
  for (const [segName, segValues] of Object.entries(segData)) {
    if (typeof segValues !== 'object' || segValues === null) continue;

    // Check if this is a leaf node (has year data) or intermediate node
    const keys = Object.keys(segValues);
    const hasYearData = keys.some(k => /^\d{4}$/.test(k));

    if (hasYearData) {
      const newTimeSeries = {};
      // Get all known years sorted
      const knownYears = keys
        .filter(k => /^\d{4}$/.test(k))
        .map(Number)
        .sort((a, b) => a - b);

      for (const year of targetYears) {
        const yearStr = year.toString();
        if (segValues[yearStr] !== undefined) {
          // Year exists in source data
          newTimeSeries[yearStr] = segValues[yearStr];
        } else if (year > knownYears[knownYears.length - 1]) {
          // Extrapolate forward using growth rate of last 2 known years
          const last = knownYears[knownYears.length - 1];
          const secondLast = knownYears[knownYears.length - 2];
          if (secondLast && segValues[last.toString()] > 0 && segValues[secondLast.toString()] > 0) {
            const growthRate = segValues[last.toString()] / segValues[secondLast.toString()];
            const yearsForward = year - last;
            newTimeSeries[yearStr] = Math.round(segValues[last.toString()] * Math.pow(growthRate, yearsForward) * 10) / 10;
          } else {
            newTimeSeries[yearStr] = 0;
          }
        } else if (year < knownYears[0]) {
          // Extrapolate backward (shouldn't happen for 2021-2033 from 2019-2031, but just in case)
          const first = knownYears[0];
          const second = knownYears[1];
          if (second && segValues[first.toString()] > 0 && segValues[second.toString()] > 0) {
            const growthRate = segValues[second.toString()] / segValues[first.toString()];
            const yearsBack = first - year;
            newTimeSeries[yearStr] = Math.round(segValues[first.toString()] / Math.pow(growthRate, yearsBack) * 10) / 10;
          } else {
            newTimeSeries[yearStr] = 0;
          }
        }
      }

      // Check if this node also has child objects (aggregation node)
      const childKeys = keys.filter(k => !/^\d{4}$/.test(k) && k !== 'CAGR' && k !== '_aggregated' && k !== '_level');
      const hasChildren = childKeys.some(k => typeof segValues[k] === 'object' && segValues[k] !== null);

      if (hasChildren) {
        // Recursively remap children too
        for (const childKey of childKeys) {
          if (typeof segValues[childKey] === 'object' && segValues[childKey] !== null) {
            newTimeSeries[childKey] = remapYears({ [childKey]: segValues[childKey] }, targetYears)[childKey];
          }
        }
        if (segValues['_aggregated']) newTimeSeries['_aggregated'] = true;
      }

      result[segName] = newTimeSeries;
    } else {
      // Intermediate node - recurse
      result[segName] = remapYears(segValues, targetYears);
    }
  }
  return result;
}

// ---- MAIN ----
const years = Array.from({ length: 13 }, (_, i) => 2021 + i); // 2021-2033
const geographies = Object.keys(valueData);

// Generate new value.json
const newValueData = {};
for (const geo of geographies) {
  const geoSegTypes = Object.keys(valueData[geo]);

  // Generate new segment types
  const newGeoData = generateSegmentData(valueData, geo, years);

  // Re-map "By Region" / "By Country" to new year range (2021-2033)
  if (valueData[geo]["By Region"]) {
    newGeoData["By Region"] = remapYears(valueData[geo]["By Region"], years);
  }
  if (valueData[geo]["By Country"]) {
    newGeoData["By Country"] = remapYears(valueData[geo]["By Country"], years);
  }

  newValueData[geo] = newGeoData;
}

// Generate new volume.json
const newVolumeData = {};
for (const geo of geographies) {
  const newGeoData = generateSegmentData(volumeData, geo, years);

  // Re-map "By Region" / "By Country" to new year range (2021-2033)
  if (volumeData[geo]["By Region"]) {
    newGeoData["By Region"] = remapYears(volumeData[geo]["By Region"], years);
  }
  if (volumeData[geo]["By Country"]) {
    newGeoData["By Country"] = remapYears(volumeData[geo]["By Country"], years);
  }

  newVolumeData[geo] = newGeoData;
}

// Write output files
fs.writeFileSync(
  path.join(__dirname, 'public/data/value.json'),
  JSON.stringify(newValueData, null, 2),
  'utf-8'
);
console.log('✅ value.json generated successfully');

fs.writeFileSync(
  path.join(__dirname, 'public/data/volume.json'),
  JSON.stringify(newVolumeData, null, 2),
  'utf-8'
);
console.log('✅ volume.json generated successfully');

// Verify totals
console.log('\n--- Verification ---');
for (const segType of Object.keys(SEGMENTS)) {
  const segs = Object.keys(newValueData["Global"][segType]);
  const total2023 = segs.reduce((s, seg) => s + (newValueData["Global"][segType][seg]["2023"] || 0), 0);
  const origTotal = getTotal(valueData, "Global", 2023);
  console.log(`${segType}: ${segs.length} segments, 2023 total = ${total2023.toFixed(1)} (original: ${origTotal.toFixed(1)})`);
}

// Also verify a country
for (const segType of Object.keys(SEGMENTS)) {
  const segs = Object.keys(newValueData["U.S."][segType]);
  const total2023 = segs.reduce((s, seg) => s + (newValueData["U.S."][segType][seg]["2023"] || 0), 0);
  const origTotal = getTotal(valueData, "U.S.", 2023);
  console.log(`U.S. ${segType}: ${total2023.toFixed(1)} (original: ${origTotal.toFixed(1)})`);
}
