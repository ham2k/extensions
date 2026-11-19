// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// Writes src/arrlSections.ts: the lines between ARRL sections inside the eight states and the one
// province split into more than one (the app draws the lines between states and provinces itself),
// and every section's outline, for shading the ones worked. They are the county lines the sections
// follow, from the Census Bureau's counties as us-atlas carries them, with each section's counties as
// https://www.arrl.org/section-boundaries lists them; and Canada's provinces and territories from
// Natural Earth. Ontario's four sections follow its census divisions, from Statistics Canada, with
// each section's divisions as Radio Amateurs of Canada describes them.
//
//   node tools/arrl-sections.mjs
//
// Run it again when a section's counties change.

import { writeFile } from "node:fs/promises"
import { join } from "node:path"

const ATLAS = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json"
const PROVINCES = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson"
/// What a scene's map draws of the world, at each of its two scales (HaLo's scripts/world-outlines.py):
/// Natural Earth's land and countries as world-atlas carries them, and its lakes, at 1:110m for the
/// whole world and 1:50m from zoom 3. The shading is worked out for each, to lie on the land drawn.
const SCALES = ["110m", "50m"]
const WORLD = scale => `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-${scale}.json`
const LAKES = scale => `https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_${scale}_lakes.geojson`
/// The shading's picture, as src/shading.ts lays it on the map: its edges, and its pixels, square in
/// degrees, Hawaii to Newfoundland and the Caribbean to the Arctic.
const GRID = { north: 72, south: 12, west: -170, east: -50, width: 2048, height: 1024 }
/// The countries the sections are in, by ISO number as world-atlas has them, each with the sections
/// a pixel of it can take: a stretch of coast one scale draws and the outlines don't is the
/// nearest of its own country's, never a neighbour's across the border.
const COUNTRIES = { 840: "US", 630: "PR", 850: "VI", 124: "CA" }
/// How far, in pixels, a stretch of drawn coast looks for its nearest section: about 2°.
const REACH = 36
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
/// Canada's sections by province or territory, Natural Earth's postal codes; Ontario's are below.
const PROVINCE_SECTIONS = { AB: "AB", BC: "BC", MB: "MB", NB: "NB", NL: "NL", NS: "NS", PE: "PE", QC: "QC", SK: "SK", YT: "TER", NT: "TER", NU: "TER" }

/// Statistics Canada's 2021 cartographic boundaries, which answer one division at a time: all of
/// Ontario at once is more than the service will send.
const STATCAN = "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer"
/// Ontario's census divisions by section. RAC's announcement of the four sections (2012) names
/// them in words: ONN the north, with Manitoulin, Greater Sudbury and Nipissing; ONE Renfrew,
/// Hastings, Prince Edward, Haliburton, Peterborough, Northumberland and everything east; GH, then
/// the GTA, Toronto with Halton, Peel, York and Durham, and Hamilton and Niagara since 2019; and
/// ONS Parry Sound, Simcoe, Grey, Bruce, Dufferin, Wellington and the rest of the southwest.
/// Muskoka, between Parry Sound and Simcoe, is ONS's, and Kawartha Lakes, between Durham and
/// Peterborough, ONE's: neither is named.
const ONTARIO_SECTIONS = {
  ONN: "3548, 3551, 3552, 3553, 3554, 3556, 3557, 3558, 3559, 3560",
  ONE: "3501, 3502, 3506, 3507, 3509, 3510, 3511, 3512, 3513, 3514, 3515, 3516, 3546, 3547",
  GH: "3518, 3519, 3520, 3521, 3524, 3525, 3526",
  ONS: "3522, 3523, 3528, 3529, 3530, 3531, 3532, 3534, 3536, 3537, 3538, 3539, 3540, 3541, 3542, 3543, 3544, 3549",
}
/// Algonquin Park is ONE's, though most of it is in Nipissing: Nipissing's unorganized South
/// Part, the census subdivision that is the park's part of the district, moves from ONN to ONE,
/// and so does South Algonquin, the township below the park, which would otherwise be an island
/// of ONN with ONE all round it. By name as well as number, so a renumbering stops the run.
const ONTARIO_MOVES = [
  { subdivision: "3548091", name: "Nipissing, Unorganized, South Part", from: "ONN", to: "ONE" },
  { subdivision: "3548001", name: "South Algonquin", from: "ONN", to: "ONE" },
]
/// The sections that meet, each pair a line between them.
const ONTARIO_NEIGHBOURS = ["ONE/ONN", "ONN/ONS", "ONE/ONS", "GH/ONS", "GH/ONE"]

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
  const body = await response.text()
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  let json
  try { json = JSON.parse(body) } catch { throw new Error(`${url}: not JSON: ${body.slice(0, 200)}`) }
  // An ArcGIS service answers a failed query with HTTP 200 and an `error`.
  if (json.error) throw new Error(`${url}: ${json.error.message} ${json.error.details ?? ""}`)
  return json
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

// Ontario's sections, each its divisions' edges with every edge two of them share cancelled out, the
// rest joined into rings; and the edges two sections share, joined into the lines between them.
// The divisions share their borders vertex for vertex, so the cancelling leaves no slivers.
/// One division's or subdivision's outline, by its id; an id Statistics Canada hasn't stops here.
async function statcan(layer, field, id, names = "") {
  const geojson = await download(`${STATCAN}/${layer}/query?where=${field}%3D%27${id}%27&outFields=${field}${names}&outSR=4326&geometryPrecision=5&f=geojson`)
  if (!geojson.features?.length) throw new Error(`Statistics Canada has no ${field} ${id}`)
  return geojson
}
const ontarioEdges = {}
/// Adds `geojson`'s rings to `section`'s edges, the other way round when `remove`d. How many of
/// the edges it cancelled.
function addEdges(section, geojson, remove = false) {
  const edges = (ontarioEdges[section] ??= new Map())
  let cancelled = 0, all = 0
  for (const { geometry } of geojson.features) {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
    for (const ring of polygons.flat()) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const [a, b] = remove ? [ring[i + 1], ring[i]] : [ring[i], ring[i + 1]]
        if (at(a) === at(b)) continue
        all++
        const back = `${at(b)}>${at(a)}`
        if (edges.has(back)) edges.delete(back), cancelled++
        else edges.set(`${at(a)}>${at(b)}`, [a, b])
      }
    }
  }
  return { cancelled, all }
}
const assigned = new Set()
for (const [section, divisions] of Object.entries(ONTARIO_SECTIONS)) {
  for (const division of divisions.split(", ")) {
    if (assigned.has(division)) throw new Error(`division ${division} is in two sections`)
    addEdges(section, await statcan(4, "CDUID", division))
    assigned.add(division)
  }
}
for (const { subdivision, name, from, to } of ONTARIO_MOVES) {
  const part = await statcan(9, "CSDUID", subdivision, ",CSDNAME")
  const found = part.features[0].properties?.CSDNAME
  if (found !== name) throw new Error(`subdivision ${subdivision} is ${found}, not ${name}`)
  // Taken from a section that hasn't it, it would be shaded there as well: most of its edges
  // cancel against the section's when it has.
  const { cancelled, all } = addEdges(from, part, true)
  if (cancelled < all / 2) throw new Error(`${name} (${subdivision}) is not in ${from}`)
  addEdges(to, part)
}
const listed = await download(`${STATCAN}/4/query?where=PRUID%3D%2735%27&outFields=CDUID,CDNAME&returnGeometry=false&f=json`)
const ids = new Set((listed.features ?? []).map(f => f.attributes.CDUID))
const unassigned = (listed.features ?? []).map(f => f.attributes).filter(d => !assigned.has(d.CDUID))
const foreign = [...assigned].filter(id => !ids.has(id))
if (!ids.size || unassigned.length || foreign.length) {
  throw new Error(`Ontario divisions in no section: ${unassigned.map(d => `${d.CDNAME} (${d.CDUID})`).join(", ") || "none"}; in a section but not Ontario's: ${foreign.join(", ") || "none"}`)
}

/// Points closer than this to the one before dropped, before simplifying: a shoreline at full
/// resolution is hundreds of thousands of them.
function thin(points, step = 0.002) {
  const kept = [points[0]]
  for (const p of points.slice(1, -1)) {
    if (Math.abs(p[0] - kept.at(-1)[0]) + Math.abs(p[1] - kept.at(-1)[1]) >= step) kept.push(p)
  }
  return points.length > 1 ? [...kept, points.at(-1)] : kept
}
for (const [section, edges] of Object.entries(ontarioEdges)) {
  const byStart = new Map()
  for (const edge of edges.values()) byStart.set(at(edge[0]), [...(byStart.get(at(edge[0])) ?? []), edge])
  const used = new Set()
  for (const first of edges.values()) {
    if (used.has(first)) continue
    used.add(first)
    const ring = [first[0], first[1]]
    let next
    while (at(ring.at(-1)) !== at(ring[0]) && (next = byStart.get(at(ring.at(-1)))?.find(e => !used.has(e)))) {
      used.add(next)
      ring.push(next[1])
    }
    if (at(ring.at(-1)) !== at(ring[0])) throw new Error(`${section}: a ring that does not close`)
    const simple = shape(thin(ring))
    if (simple) (shapes[section] ??= []).push(simple)
  }
}
// An edge one section has one way round and another the other is the line between them.
const between = [], met = new Set()
for (const [section, edges] of Object.entries(ontarioEdges)) {
  for (const [key, [a, b]] of edges) {
    const other = Object.entries(ontarioEdges).find(([s, e]) => s !== section && e.has(`${at(b)}>${at(a)}`))
    if (other && key < `${at(b)}>${at(a)}`) between.push([a, b]), met.add([section, other[0]].sort().join("/"))
  }
}
// Borders that stopped matching vertex for vertex would cancel nothing, and draw no line here.
const apart = ONTARIO_NEIGHBOURS.filter(pair => !met.has(pair))
if (apart.length) throw new Error(`no line between ${apart.join(", ")}: their borders no longer match`)
const ends = new Map()
for (const segment of between) for (const p of segment) ends.set(at(p), [...(ends.get(at(p)) ?? []), segment])
const walked = new Set()
for (const segment of between) {
  if (walked.has(segment)) continue
  walked.add(segment)
  let line = [...segment]
  for (const forward of [true, false]) {
    for (;;) {
      const tip = forward ? line.at(-1) : line[0]
      const step = ends.get(at(tip))?.find(s => !walked.has(s))
      if (!step) break
      walked.add(step)
      const far = at(step[0]) === at(tip) ? step[1] : step[0]
      line = forward ? [...line, far] : [far, ...line]
    }
  }
  // An island a border cuts leaves a scrap of line shorter than the simplifying strays: nothing to draw.
  const length = line.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]), 0)
  if (length >= TOLERANCE) lines.push(thin(line))
}

// Every section has an outline: a renamed code or a section shrunk away stops here.
const expected = new Set([...Object.values(STATE_SECTIONS), ...Object.values(PROVINCE_SECTIONS), ...Object.values(SECTIONS).flatMap(Object.keys), ...Object.keys(ONTARIO_SECTIONS)])
const unshaped = [...expected].filter(section => !shapes[section]?.length)
if (unshaped.length) throw new Error(`no outline for ${unshaped.join(", ")}`)

// The shading at each scale: which section each pixel of the picture is in, for every pixel of the
// US and Canada the map draws as land at that scale, and none for its sea and lakes. A pixel is
// its section by the outlines where they agree with the scale's country, and else the nearest
// section of the country the scale draws it in.
const STEP = (GRID.east - GRID.west) / GRID.width
const codes = Object.keys(shapes).sort()
const countryOf = code => (code === "PR" ? "PR" : code === "VI" ? "VI" : Object.values(PROVINCE_SECTIONS).includes(code) || code in ONTARIO_SECTIONS ? "CA" : "US")

/// Sets `value` in `grid` on each pixel whose middle `rings` cover, even-odd, where `keep(pixel)`.
function rasterize(grid, rings, value, keep = () => true) {
  const crossings = Array.from({ length: GRID.height }, () => [])
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = [(ring[i][0] - GRID.west) / STEP, (GRID.north - ring[i][1]) / STEP]
      const next = ring[(i + 1) % ring.length]
      const [x1, y1] = [(next[0] - GRID.west) / STEP, (GRID.north - next[1]) / STEP]
      if (y0 === y1) continue
      const top = Math.max(0, Math.ceil(Math.min(y0, y1) - 0.5)), bottom = Math.min(GRID.height - 1, Math.ceil(Math.max(y0, y1) - 0.5) - 1)
      for (let row = top; row <= bottom; row++) crossings[row].push(x0 + ((row + 0.5 - y0) / (y1 - y0)) * (x1 - x0))
    }
  }
  crossings.forEach((xs, row) => {
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(GRID.width - 1, Math.ceil(xs[k + 1] - 0.5) - 1)
      for (let x = from; x <= to; x++) if (keep(row * GRID.width + x)) grid[row * GRID.width + x] = value
    }
  })
}

/// A ring's longitudes run on across the antimeridian (179, 181), and sit by the picture's side
/// of it, as the map's own outlines do.
function unwrap(ring) {
  const out = []
  for (const [lon, lat] of ring) {
    let x = lon
    if (out.length) while (x - out.at(-1)[0] > 180) x -= 360
    if (out.length) while (out.at(-1)[0] - x > 180) x += 360
    out.push([x, lat])
  }
  const middle = out.reduce((sum, [x]) => sum + x, 0) / out.length
  return middle > 0 ? out.map(([x, y]) => [x - 360, y]) : out
}

/// Each country's rings in a world-atlas topology, by its ISO number.
function countryRings(topology) {
  const [[sx, sy], [tx, ty]] = [topology.transform.scale, topology.transform.translate]
  const worldArcs = topology.arcs.map(arc => {
    let x = 0, y = 0
    return arc.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty])
  })
  const ringOf = indices => indices.flatMap((i, n) => {
    const arc = i < 0 ? worldArcs[~i].slice().reverse() : worldArcs[i]
    return n === 0 ? arc : arc.slice(1)
  })
  const byCountry = {}
  for (const country of topology.objects.countries.geometries) {
    const polygons = country.type === "Polygon" ? [country.arcs] : country.type === "MultiPolygon" ? country.arcs : []
    for (const ring of polygons.flat()) (byCountry[country.id] ??= []).push(unwrap(ringOf(ring)))
  }
  return byCountry
}

// The sections by their outlines, once: 1 + their place in `codes`, 0 for none.
const byOutline = new Uint8Array(GRID.width * GRID.height)
codes.forEach((code, i) => rasterize(byOutline, shapes[code], i + 1, pixel => byOutline[pixel] === 0))

const rasters = {}
for (const scale of SCALES) {
  const countries = countryRings(await download(WORLD(scale)))
  const lakes = (await download(LAKES(scale))).features.flatMap(({ geometry }) => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).flat())
  // The countries' pixels the map draws as land: each country, less the lakes (with their islands,
  // even-odd, as the map fills them). The Virgin Islands are too small for 1:110m.
  const country = new Uint8Array(GRID.width * GRID.height), names = Object.values(COUNTRIES)
  for (const [id, name] of Object.entries(COUNTRIES)) {
    if (!countries[id]?.length && !(name === "VI" && scale === "110m")) throw new Error(`${scale}: world-atlas has no country ${id} (${name})`)
    rasterize(country, countries[id] ?? [], names.indexOf(name) + 1)
  }
  const water = new Uint8Array(GRID.width * GRID.height)
  rasterize(water, lakes, 1)
  // A lakes file come back empty, or shrunk, would have the Great Lakes shaded as their shores.
  const lakeMichigan = Math.floor((GRID.north - 43.5) / STEP) * GRID.width + Math.floor((-87 - GRID.west) / STEP)
  const wet = water.reduce((n, w) => n + w, 0)
  if (wet < 10000 || !water[lakeMichigan]) throw new Error(`${scale}: the lakes cover ${wet} pixels${water[lakeMichigan] ? "" : ", and not Lake Michigan"}`)
  for (let pixel = 0; pixel < country.length; pixel++) if (water[pixel]) country[pixel] = 0
  // Each pixel its section by the outlines where the country agrees; then, a country at a time, the
  // nearest of that country's sections within REACH, outward from its outlines a ring of pixels at
  // a time, so a border the scale draws apart from the outlines takes no neighbour's section.
  const section = new Uint8Array(GRID.width * GRID.height)
  for (const name of names) {
    let front = []
    const reached = new Uint8Array(GRID.width * GRID.height), nearest = new Uint8Array(GRID.width * GRID.height)
    for (let pixel = 0; pixel < byOutline.length; pixel++) {
      const code = byOutline[pixel]
      if (code && countryOf(codes[code - 1]) === name) nearest[pixel] = code, reached[pixel] = 1, front.push(pixel)
    }
    for (let step = 0; step < REACH && front.length; step++) {
      const next = []
      for (const pixel of front) {
        const x = pixel % GRID.width
        for (const near of [x > 0 ? pixel - 1 : -1, x < GRID.width - 1 ? pixel + 1 : -1, pixel - GRID.width, pixel + GRID.width]) {
          if (near < 0 || near >= nearest.length || reached[near]) continue
          reached[near] = 1
          nearest[near] = nearest[pixel]
          next.push(near)
        }
      }
      front = next
    }
    const own = names.indexOf(name) + 1
    for (let pixel = 0; pixel < section.length; pixel++) if (country[pixel] === own) section[pixel] = nearest[pixel]
  }
  let unplaced = 0
  for (let pixel = 0; pixel < section.length; pixel++) {
    if (country[pixel] && !section[pixel]) unplaced++
  }
  // Rows of runs, each its length (in 7-bit groups, low first, high bit for more) and its section.
  const bytes = []
  for (let row = 0; row < GRID.height; row++) {
    for (let x = 0; x < GRID.width;) {
      const code = section[row * GRID.width + x]
      let run = 0
      while (x < GRID.width && section[row * GRID.width + x] === code) x++, run++
      for (; run >= 0x80; run >>= 7) bytes.push((run & 0x7f) | 0x80)
      bytes.push(run, code)
    }
  }
  rasters[scale] = Buffer.from(bytes).toString("base64")
  const placed = section.reduce((n, code) => n + (code ? 1 : 0), 0)
  console.log(`${scale}: ${placed} pixels shaded, ${unplaced} drawn but too far from any section; ${rasters[scale].length} characters`)
  if (unplaced > 50) throw new Error(`${scale}: ${unplaced} pixels of land drawn no section reaches`)
  // Each section about as large as its outline: one that shrank away, at one scale, stops here. The
  // Virgin Islands are too small for 1:110m to draw.
  const shaded = new Uint32Array(codes.length + 1), outlined = new Uint32Array(codes.length + 1)
  for (let pixel = 0; pixel < section.length; pixel++) shaded[section[pixel]]++, outlined[byOutline[pixel]]++
  const shrunk = codes.filter((code, i) => shaded[i + 1] < outlined[i + 1] / 2 && !(code === "VI" && scale === "110m"))
  if (shrunk.length) throw new Error(`${scale}: shaded on less than half their outlines: ${shrunk.map(code => `${code} ${shaded[codes.indexOf(code) + 1]}/${outlined[codes.indexOf(code) + 1]}`).join(", ")}`)
}

const flat = (points, digits) => points.flatMap(([lon, lat]) => [+lat.toFixed(digits), +lon.toFixed(digits)])
const out = lines.map(line => flat(simplify(line), 3))
const outlines = Object.fromEntries(Object.entries(shapes).sort().map(([section, rings]) => [section, rings.map(ring => flat(ring, 2))]))
const count = (list) => list.reduce((n, l) => n + l.length / 2, 0)
await writeFile(join(import.meta.dirname, "..", "src", "arrlSections.ts"), `// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// Written by tools/arrl-sections.mjs; run it again rather than editing this.
//
// From the Census Bureau's county lines (us-atlas 3.0.1), Natural Earth's provinces (5.1.2) and
// Statistics Canada's census divisions (2021); the shading on Natural Earth's land and lakes.
// Every line and ring is latitude, longitude, latitude, longitude…

/** The lines between ARRL sections inside the states and provinces split into more than one. */
export const SECTION_LINES: readonly (readonly number[])[] = ${JSON.stringify(out)}

/** Each section's outline, rings that shade it filled even-odd. */
export const SECTION_SHAPES: Readonly<Record<string, readonly (readonly number[])[]>> = ${JSON.stringify(outlines)}

/** The shading's picture: its edges in degrees, and its size in pixels, square in degrees. */
export const SHADING_GRID = ${JSON.stringify(GRID)} as const

/** The sections a shading raster numbers, from 1 (0 is none). */
export const SHADING_SECTIONS: readonly string[] = ${JSON.stringify(codes)}

/**
 * Which section each pixel of the shading is in, as the scene's map draws the land and lakes at
 * 1:110m and at 1:50m (Natural Earth 5.1.2, world-atlas 2.0.2): rows of runs, base64, each a length
 * in 7-bit groups (low first, the high bit for more) and its section's number.
 */
export const SHADING_RASTERS: Readonly<Record<${SCALES.map(scale => `'${scale}'`).join(" | ")}, string>> = ${JSON.stringify(rasters)}
`)
console.log(`${out.length} lines, ${count(out)} points; ${Object.keys(outlines).length} sections, ${count(Object.values(outlines).flat())} points`)
