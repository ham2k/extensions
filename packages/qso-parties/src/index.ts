// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// Every party this package carries, keyed by the code the bundled version used
// to name one — which is also the fixture's own name, and so the column a
// re-sync joins on.
//
// An extension imports the one party it IS — `@ham2k/qso-parties/tx`. This map
// is for the tools and tests that need all fifty, and pulls every county table
// in with it.
//
// GENERATED — `node scripts/convert-parties.mjs` writes this file.

import type { QsoPartyParams } from "@ham2k/lib-qso-party"

import { PARTY as PARTY_7QP } from "./parties/7qp.ts"
import { PARTY as PARTY_ACQP } from "./parties/acqp.ts"
import { PARTY as PARTY_AL } from "./parties/al.ts"
import { PARTY as PARTY_AR } from "./parties/ar.ts"
import { PARTY as PARTY_AZ } from "./parties/az.ts"
import { PARTY as PARTY_BC } from "./parties/bc.ts"
import { PARTY as PARTY_CA } from "./parties/ca.ts"
import { PARTY as PARTY_CO } from "./parties/co.ts"
import { PARTY as PARTY_CPQP } from "./parties/cpqp.ts"
import { PARTY as PARTY_DE } from "./parties/de.ts"
import { PARTY as PARTY_FL } from "./parties/fl.ts"
import { PARTY as PARTY_GA } from "./parties/ga.ts"
import { PARTY as PARTY_HI } from "./parties/hi.ts"
import { PARTY as PARTY_IA } from "./parties/ia.ts"
import { PARTY as PARTY_ID } from "./parties/id.ts"
import { PARTY as PARTY_IL } from "./parties/il.ts"
import { PARTY as PARTY_IN } from "./parties/in.ts"
import { PARTY as PARTY_KS } from "./parties/ks.ts"
import { PARTY as PARTY_KY } from "./parties/ky.ts"
import { PARTY as PARTY_LA } from "./parties/la.ts"
import { PARTY as PARTY_MD } from "./parties/md.ts"
import { PARTY as PARTY_ME } from "./parties/me.ts"
import { PARTY as PARTY_MI } from "./parties/mi.ts"
import { PARTY as PARTY_MN } from "./parties/mn.ts"
import { PARTY as PARTY_MO } from "./parties/mo.ts"
import { PARTY as PARTY_MS } from "./parties/ms.ts"
import { PARTY as PARTY_NC } from "./parties/nc.ts"
import { PARTY as PARTY_ND } from "./parties/nd.ts"
import { PARTY as PARTY_NE } from "./parties/ne.ts"
import { PARTY as PARTY_NEQP } from "./parties/neqp.ts"
import { PARTY as PARTY_NH } from "./parties/nh.ts"
import { PARTY as PARTY_NJ } from "./parties/nj.ts"
import { PARTY as PARTY_NM } from "./parties/nm.ts"
import { PARTY as PARTY_NS } from "./parties/ns.ts"
import { PARTY as PARTY_NV } from "./parties/nv.ts"
import { PARTY as PARTY_NY } from "./parties/ny.ts"
import { PARTY as PARTY_OH } from "./parties/oh.ts"
import { PARTY as PARTY_OK } from "./parties/ok.ts"
import { PARTY as PARTY_ON } from "./parties/on.ts"
import { PARTY as PARTY_PA } from "./parties/pa.ts"
import { PARTY as PARTY_QC } from "./parties/qc.ts"
import { PARTY as PARTY_SC } from "./parties/sc.ts"
import { PARTY as PARTY_SD } from "./parties/sd.ts"
import { PARTY as PARTY_TN } from "./parties/tn.ts"
import { PARTY as PARTY_TX } from "./parties/tx.ts"
import { PARTY as PARTY_VA } from "./parties/va.ts"
import { PARTY as PARTY_VT } from "./parties/vt.ts"
import { PARTY as PARTY_WA } from "./parties/wa.ts"
import { PARTY as PARTY_WI } from "./parties/wi.ts"
import { PARTY as PARTY_WV } from "./parties/wv.ts"

export const PARTIES: Record<string, QsoPartyParams> = {
  "7QP": PARTY_7QP,
  "ACQP": PARTY_ACQP,
  "AL": PARTY_AL,
  "AR": PARTY_AR,
  "AZ": PARTY_AZ,
  "BC": PARTY_BC,
  "CA": PARTY_CA,
  "CO": PARTY_CO,
  "CPQP": PARTY_CPQP,
  "DE": PARTY_DE,
  "FL": PARTY_FL,
  "GA": PARTY_GA,
  "HI": PARTY_HI,
  "IA": PARTY_IA,
  "ID": PARTY_ID,
  "IL": PARTY_IL,
  "IN": PARTY_IN,
  "KS": PARTY_KS,
  "KY": PARTY_KY,
  "LA": PARTY_LA,
  "MD": PARTY_MD,
  "ME": PARTY_ME,
  "MI": PARTY_MI,
  "MN": PARTY_MN,
  "MO": PARTY_MO,
  "MS": PARTY_MS,
  "NC": PARTY_NC,
  "ND": PARTY_ND,
  "NE": PARTY_NE,
  "NEQP": PARTY_NEQP,
  "NH": PARTY_NH,
  "NJ": PARTY_NJ,
  "NM": PARTY_NM,
  "NS": PARTY_NS,
  "NV": PARTY_NV,
  "NY": PARTY_NY,
  "OH": PARTY_OH,
  "OK": PARTY_OK,
  "ON": PARTY_ON,
  "PA": PARTY_PA,
  "QC": PARTY_QC,
  "SC": PARTY_SC,
  "SD": PARTY_SD,
  "TN": PARTY_TN,
  "TX": PARTY_TX,
  "VA": PARTY_VA,
  "VT": PARTY_VT,
  "WA": PARTY_WA,
  "WI": PARTY_WI,
  "WV": PARTY_WV,
}
