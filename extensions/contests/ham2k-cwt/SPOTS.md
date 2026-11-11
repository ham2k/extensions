# CWT in Spots

In a CWT operation, an ID-card icon can mark CW spots with cached CWT history
on rows that show source details. Select a spot to see the known exchange in
the logging call info. If a curated callsign note already occupies the compact
line, open the call details to see the CWT source note. Spot rows keep their
source labels, and the history hint does not determine the QSO score.

## Legacy call-history spot filter

RBN now supplies spots without the CWT station filter. Older RBN bundles
can still select the **CWT call-history file** filter on hosts that allow the
legacy hook. The cross-extension allowlist in HaLo Next build 192 blocks it.
If the old selector is still present on that build, choose **All calls** to
restore the RBN feed.

The filter includes all file entries, including nonmembers and calls with
no exchange. Exact calls and unambiguous base-call matches are accepted:
`K1ABC/P` can match `K1ABC`. It uses no prior logged contacts and does not
prove current CWT participation or CWops membership.

CWT fetches no RBN reports. Its versioned `spotCallFilter:v1` hook answers
bounded callsign batches from cached history; the shared
`packages/spot-filters` contract also supports MST and SST providers.
The legacy filter applies across operations.

## Native integration verification

On September 23, 2026, the equivalent personal CWT and RBN candidates were
installed in Ham2K Next 26.9.0 build 170 on macOS. At that time, RBN discovered
and selected **CWT call-history file** by default, and its native Spots source
returned 31 reports with the loaded CWT history. Selecting **All calls** broadened
the results in a later live snapshot. Restoring CWT filtering and restarting
the app retained the selection and again supplied filtered reports.

This exercises the shared contract through the native host using the
personal `n1rwj-cwt` package; it is not a native installation test of the
upstream `ham2k-cwt` package. Missing-file/provider handling remains covered
by deterministic tests. The existing test operation remained at zero QSOs.

The cross-extension filter is temporary compatibility code. See the
[shared migration plan](../../../packages/spot-filters/README.md) for the
native relevance direction, retained history matching, and removal checklist.
History membership affects spot display only, never QSO scoring eligibility.
