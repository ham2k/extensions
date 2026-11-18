// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// Writes src/arrlSections.ts: the lines between ARRL sections inside the eight states split into
// more than one (the app draws the lines between states itself), and every section's outline, for
// shading the ones worked. They are the county lines the sections follow, from the Census Bureau's
// counties as us-atlas carries them, with each section's counties as
// https://www.arrl.org/section-boundaries lists them; and Canada's provinces and territories from
// Natural Earth. Ontario's four sections follow its census divisions, which neither has, so they
// have no outline here yet.
//
//   node tools/arrl-sections.mjs
//
// Run it again when a section's counties change.

import { writeFile } from "node:fs/promises"
import { join } from "node:path"

const ATLAS = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json"
const PROVINCES = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson"
/// The lakes the app's map draws from zoom 3, cleared out of the shading: a county or a province
/// runs across its lakes.
const LAKES = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_50m_lakes.geojson"
/// How far a simplified line may stray from the county line, in degrees (about a kilometer).
const TOLERANCE = 0.01
/// The outlines are only ever shaded, a few kilometers a pixel: coarser, and islands smaller than
/// this many square degrees left out.
const SHAPE_TOLERANCE = 0.03, SMALLEST = 0.005

/// The states that are one section each, by FIPS code; Maryland and DC are one together, and Hawaii
/// is the Pacific section's (with possessions too far west to shade).
const STATE_SECTIONS = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "08": "CO", "09": "CT", "10": "DE", "11": "MDC", "13": "GA", "15": "PAC",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MDC", "26": "MI",
  "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "35": "NM", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "49": "UT", "50": "VT", "51": "VA",
  "54": "WV", "55": "WI", "56": "WY", "72": "PR", "78": "VI",
}
/// Canada's sections by province or territory, Natural Earth's postal codes.
const PROVINCE_SECTIONS = { AB: "AB", BC: "BC", MB: "MB", NB: "NB", NL: "NL", NS: "NS", PE: "PE", QC: "QC", SK: "SK", YT: "TER", NT: "TER", NU: "TER" }

const SECTIONS = {
  "06": {
    EB: "Alameda, Contra Costa, Napa, Solano",
    SV: "Alpine, Amador, Butte, Colusa, El Dorado, Glenn, Lassen, Modoc, Nevada, Placer, Plumas, Sacramento, Shasta, Sierra, Siskiyou, Sutter, Tehama, Trinity, Yolo, Yuba",
    SF: "Del Norte, Humboldt, Lake, Marin, Mendocino, San Francisco, Sonoma",
    SJV: "Calaveras, Fresno, Kern, Kings, Madera, Mariposa, Merced, Mono, San Joaquin, Stanislaus, Tulare, Tuolumne",
    SCV: "Monterey, San Benito, San Mateo, Santa Clara, Santa Cruz",
    ORG: "Inyo, Orange, Riverside, San Bernardino",
    SDG: "Imperial, San Diego",
    SB: "San Luis Obispo, Santa Barbara, Ventura",
    LAX: "Los Angeles",
  },
  "12": {
    NFL: "Alachua, Baker, Bay, Bradford, Calhoun, Citrus, Clay, Columbia, Dixie, Duval, Escambia, Flagler, Franklin, Gadsden, Gilchrist, Gulf, Hamilton, Hernando, Holmes, Jackson, Jefferson, Lafayette, Lake, Leon, Levy, Liberty, Madison, Marion, Nassau, Okaloosa, Orange, Putnam, Santa Rosa, Seminole, St. Johns, Sumter, Suwannee, Taylor, Union, Volusia, Wakulla, Walton, Washington",
    SFL: "Brevard, Broward, Collier, Glades, Hendry, Indian River, Lee, Martin, Miami-Dade, Monroe, Okeechobee, Osceola, Palm Beach, St. Lucie",
    WCF: "Charlotte, DeSoto, Hardee, Highlands, Hillsborough, Manatee, Pasco, Pinellas, Polk, Sarasota",
  },
  "25": {
    EMA: "Barnstable, Bristol, Dukes, Essex, Middlesex, Nantucket, Norfolk, Plymouth, Suffolk",
    WMA: "Berkshire, Franklin, Hampden, Hampshire, Worcester",
  },
  "34": {
    SNJ: "Atlantic, Burlington, Camden, Cape May, Cumberland, Gloucester, Mercer, Ocean, Salem",
    NNJ: "Bergen, Essex, Hudson, Hunterdon, Middlesex, Monmouth, Morris, Passaic, Somerset, Sussex, Union, Warren",
  },
  "36": {
    ENY: "Albany, Columbia, Dutchess, Greene, Orange, Putnam, Rensselaer, Rockland, Saratoga, Schenectady, Sullivan, Ulster, Warren, Washington, Westchester",
    NLI: "Bronx, Kings, Nassau, New York, Queens, Richmond, Suffolk",
    NNY: "Clinton, Essex, Franklin, Fulton, Hamilton, Jefferson, Lewis, Montgomery, St. Lawrence, Schoharie",
    WNY: "Allegany, Broome, Cattaraugus, Cayuga, Chautauqua, Chemung, Chenango, Cortland, Delaware, Erie, Genesee, Herkimer, Livingston, Madison, Monroe, Niagara, Oneida, Onondaga, Ontario, Orleans, Oswego, Otsego, Schuyler, Seneca, Steuben, Tioga, Tompkins, Wayne, Wyoming, Yates",
  },
  "42": {
    EPA: "Adams, Berks, Bradford, Bucks, Carbon, Chester, Columbia, Cumberland, Dauphin, Delaware, Juniata, Lackawanna, Lancaster, Lebanon, Lehigh, Luzerne, Lycoming, Monroe, Montgomery, Montour, Northampton, Northumberland, Perry, Philadelphia, Pike, Schuylkill, Snyder, Sullivan, Susquehanna, Tioga, Union, Wayne, Wyoming, York",
    WPA: "Allegheny, Armstrong, Beaver, Bedford, Blair, Butler, Cambria, Cameron, Centre, Clarion, Clearfield, Clinton, Crawford, Elk, Erie, Fayette, Forest, Franklin, Fulton, Greene, Huntingdon, Indiana, Jefferson, Lawrence, McKean, Mercer, Mifflin, Potter, Somerset, Venango, Warren, Washington, Westmoreland",
  },
  "48": {
    NTX: "Anderson, Archer, Baylor, Bell, Bosque, Bowie, Brown, Camp, Cass, Cherokee, Clay, Collin, Comanche, Cooke, Coryell, Dallas, Delta, Denton, Eastland, Ellis, Erath, Falls, Fannin, Franklin, Freestone, Grayson, Gregg, Hamilton, Harrison, Henderson, Hill, Hood, Hopkins, Hunt, Jack, Johnson, Kaufman, Lamar, Lampasas, Limestone, McLennan, Marion, Mills, Montague, Morris, Nacogdoches, Navarro, Palo Pinto, Panola, Parker, Rains, Red River, Rockwall, Rusk, Shelby, Smith, Somervell, Stephens, Tarrant, Throckmorton, Titus, Upshur, Van Zandt, Wichita, Wilbarger, Wise, Wood, Young",
    STX: "Angelina, Aransas, Atascosa, Austin, Bandera, Bastrop, Bee, Bexar, Blanco, Brazoria, Brazos, Brooks, Burleson, Burnet, Caldwell, Calhoun, Cameron, Chambers, Colorado, Comal, Concho, DeWitt, Dimmit, Duval, Edwards, Fayette, Fort Bend, Frio, Galveston, Gillespie, Goliad, Gonzales, Grimes, Guadalupe, Hardin, Harris, Hays, Hidalgo, Houston, Jackson, Jasper, Jefferson, Jim Hogg, Jim Wells, Karnes, Kendall, Kenedy, Kerr, Kimble, Kinney, Kleberg, La Salle, Lavaca, Lee, Leon, Liberty, Live Oak, Llano, Madison, Mason, Matagorda, Maverick, McCulloch, McMullen, Medina, Menard, Milam, Montgomery, Newton, Nueces, Orange, Polk, Real, Refugio, Robertson, Sabine, San Augustine, San Jacinto, San Patricio, San Saba, Starr, Travis, Trinity, Tyler, Uvalde, Val Verde, Victoria, Walker, Waller, Washington, Webb, Wharton, Willacy, Williamson, Wilson, Zapata, Zavala",
    WTX: "Andrews, Armstrong, Bailey, Borden, Brewster, Briscoe, Callahan, Carson, Castro, Childress, Cochran, Coke, Coleman, Collingsworth, Cottle, Crane, Crockett, Crosby, Culberson, Dallam, Dawson, Deaf Smith, Dickens, Donley, Ector, El Paso, Fisher, Floyd, Foard, Gaines, Garza, Glasscock, Gray, Hale, Hall, Hansford, Hardeman, Hartley, Haskell, Hemphill, Hockley, Howard, Hudspeth, Hutchinson, Irion, Jeff Davis, Jones, Kent, King, Knox, Lamb, Lipscomb, Loving, Lubbock, Lynn, Martin, Midland, Mitchell, Moore, Motley, Nolan, Ochiltree, Oldham, Parmer, Pecos, Potter, Presidio, Randall, Reagan, Reeves, Roberts, Runnels, Schleicher, Scurry, Shackelford, Sherman, Sterling, Stonewall, Sutton, Swisher, Taylor, Terrell, Terry, Tom Green, Upton, Ward, Wheeler, Winkler, Yoakum",
  },
  "53": {
    EWA: "Adams, Asotin, Benton, Chelan, Columbia, Douglas, Ferry, Franklin, Garfield, Grant, Kittitas, Klickitat, Lincoln, Okanogan, Pend Oreille, Spokane, Stevens, Walla Walla, Whitman, Yakima",
    WWA: "Clallam, Clark, Cowlitz, Grays Harbor, Island, Jefferson, King, Kitsap, Lewis, Mason, Pacific, Pierce, San Juan, Skagit, Skamania, Snohomish, Thurston, Wahkiakum, Whatcom",
  },
}

const key = name => name.normalize("NFD").replace(/[^A-Za-z]/g, "").toLowerCase()
const sectionOf = new Map()
for (const [state, sections] of Object.entries(SECTIONS)) {
  for (const [section, counties] of Object.entries(sections)) {
    for (const county of counties.split(", ")) sectionOf.set(`${state}:${key(county)}`, section)
  }
}

/** A JSON download, or an error naming it. */
async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

const atlas = await download(ATLAS)
const [[sx, sy], [tx, ty]] = [atlas.transform.scale, atlas.transform.translate]
const arcs = atlas.arcs.map(arc => {
  let x = 0, y = 0
  return arc.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty])
})

// Each county's section, and which sections' counties use each arc, which way round.
const users = new Map(), found = new Set(), sectionArcs = new Map()
for (const county of atlas.objects.counties.geometries) {
  const state = county.id.slice(0, 2), name = `${state}:${key(county.properties.name)}`
  const section = SECTIONS[state] ? sectionOf.get(name) : STATE_SECTIONS[state]
  if (SECTIONS[state] && !section) throw new Error(`no section for ${county.properties.name} (${county.id})`)
  if (!section) continue
  found.add(name)
  const rings = county.type === "Polygon" ? county.arcs : county.arcs.flat()
  for (const i of rings.flat()) {
    const arc = i < 0 ? ~i : i
    users.set(arc, [...(users.get(arc) ?? []), { state, section }])
    // Counted each way round: an arc two of its counties share, one each way, is inside it.
    const used = sectionArcs.get(section) ?? new Map()
    used.set(arc, (used.get(arc) ?? 0) + (i < 0 ? -1 : 1))
    sectionArcs.set(section, used)
  }
}
const missing = [...sectionOf.keys()].filter(k => !found.has(k))
if (missing.length) throw new Error(`counties not in the atlas: ${missing.join(", ")}`)

const at = p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`

// The arcs two sections of one state share (two states' are the app's), joined end to end into lines.
const shared = [...users].filter(([, [a, b]]) => b && a.state === b.state && a.section !== b.section).map(([arc]) => arcs[arc].slice())
const lines = []
while (shared.length) {
  let line = shared.pop(), grew = true
  while (grew) {
    grew = false
    for (let i = 0; i < shared.length; i++) {
      const arc = shared[i]
      if (at(arc[0]) === at(line.at(-1))) line = [...line, ...arc.slice(1)]
      else if (at(arc.at(-1)) === at(line.at(-1))) line = [...line, ...arc.reverse().slice(1)]
      else if (at(arc.at(-1)) === at(line[0])) line = [...arc.slice(0, -1), ...line]
      else if (at(arc[0]) === at(line[0])) line = [...arc.reverse().slice(0, -1), ...line]
      else continue
      shared.splice(i, 1); grew = true; break
    }
  }
  lines.push(line)
}

/// Douglas–Peucker, in degrees.
function simplify(points, tolerance = TOLERANCE) {
  if (points.length < 3) return points
  const [a, b] = [points[0], points.at(-1)]
  let far = 0, index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const d = dx || dy ? Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / Math.hypot(dx, dy) : Math.hypot(x - a[0], y - a[1])
    if (d > far) [far, index] = [d, i]
  }
  return far <= tolerance ? [a, b] : [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)]
}
const area = ring => Math.abs(ring.reduce((sum, [x, y], i) => { const [u, v] = ring[(i + 1) % ring.length]; return sum + x * v - u * y }, 0) / 2)
/// A ring simplified in two halves, so its ends stay put, unless it is too small to shade.
function shape(ring) {
  // Past 72° north is off the shading, and so are the Aleutians past 180° (which would cross it).
  if (area(ring) < SMALLEST || Math.min(...ring.map(p => p[1])) > 72 || ring.some(p => p[0] > 0)) return undefined
  const half = Math.floor(ring.length / 2)
  const out = [...simplify(ring.slice(0, half + 1), SHAPE_TOLERANCE).slice(0, -1), ...simplify(ring.slice(half), SHAPE_TOLERANCE)]
  return out.length >= 4 ? out : undefined
}

// Each section's outline: the arcs its counties use once, each the way round its county takes it,
// joined into rings.
const shapes = {}
for (const [section, used] of sectionArcs) {
  const pieces = [...used].filter(([, net]) => net !== 0).map(([arc, net]) => (net < 0 ? arcs[arc].slice().reverse() : arcs[arc].slice()))
  // Where two pieces start at one point (a pinch), either will do: each ring still closes.
  const byStart = new Map()
  pieces.forEach((piece, n) => byStart.set(at(piece[0]), [...(byStart.get(at(piece[0])) ?? []), n]))
  const done = new Set()
  for (let n = 0; n < pieces.length; n++) {
    if (done.has(n)) continue
    let ring = pieces[n].slice(), next
    done.add(n)
    while (at(ring.at(-1)) !== at(ring[0]) && (next = byStart.get(at(ring.at(-1)))?.find(m => !done.has(m))) !== undefined) {
      done.add(next)
      ring = [...ring, ...pieces[next].slice(1)]
    }
    if (at(ring.at(-1)) !== at(ring[0])) throw new Error(`${section}: a ring that does not close`)
    const simple = shape(ring)
    if (simple) (shapes[section] ??= []).push(simple)
  }
}
const provinces = await download(PROVINCES)
for (const feature of provinces.features) {
  const section = feature.properties.iso_a2 === "CA" && PROVINCE_SECTIONS[feature.properties.postal]
  if (!section) continue
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates
  for (const ring of polygons.flat()) {
    const simple = shape(ring)
    if (simple) (shapes[section] ??= []).push(simple)
  }
}

// The lakes over the sections' part of the world, with their islands, as rings to clear even-odd.
const lakeRings = []
for (const feature of (await download(LAKES)).features) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates
  for (const polygon of polygons) {
    const [outer] = polygon
    if (outer.some(([lon, lat]) => lon < -170 || lon > -50 || lat < 12 || lat > 75)) continue
    for (const ring of polygon) {
      const simple = shape(ring)
      if (simple) lakeRings.push(simple)
    }
  }
}

// Every section but Ontario's four has an outline: a renamed code or a section shrunk away stops here.
const expected = new Set([...Object.values(STATE_SECTIONS), ...Object.values(PROVINCE_SECTIONS), ...Object.values(SECTIONS).flatMap(Object.keys)])
const unshaped = [...expected].filter(section => !shapes[section]?.length)
if (unshaped.length) throw new Error(`no outline for ${unshaped.join(", ")}`)

const flat = (points, digits) => points.flatMap(([lon, lat]) => [+lat.toFixed(digits), +lon.toFixed(digits)])
const out = lines.map(line => flat(simplify(line), 3))
const outlines = Object.fromEntries(Object.entries(shapes).sort().map(([section, rings]) => [section, rings.map(ring => flat(ring, 2))]))
const count = (list) => list.reduce((n, l) => n + l.length / 2, 0)
await writeFile(join(import.meta.dirname, "..", "src", "arrlSections.ts"), `// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// Written by tools/arrl-sections.mjs; run it again rather than editing this.
//
// From the Census Bureau's county lines (us-atlas 3.0.1) and Natural Earth's provinces (5.1.2).
// Every line and ring is latitude, longitude, latitude, longitude…

/** The lines between ARRL sections inside the states split into more than one. */
export const SECTION_LINES: readonly (readonly number[])[] = ${JSON.stringify(out)}

/** Each section's outline, rings that shade it filled even-odd, all but Ontario's four. */
export const SECTION_SHAPES: Readonly<Record<string, readonly (readonly number[])[]>> = ${JSON.stringify(outlines)}

/** The lakes among the sections, and the islands in them, rings to clear from a shading even-odd (Natural Earth 1:50m). */
export const LAKE_SHAPES: readonly (readonly number[])[] = ${JSON.stringify(lakeRings.map(ring => flat(ring, 2)))}
`)
console.log(`${out.length} lines, ${count(out)} points; ${Object.keys(outlines).length} sections, ${count(Object.values(outlines).flat())} points; ${lakeRings.length} lake rings, ${count(lakeRings.map(r => flat(r, 2)))} points`)
