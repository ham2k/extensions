# Call-history spot filter

Enable the RBN extension to supply reports to Ham2K's native Spots panel.
CWT contributes the optional **CWT call-history file** filter; it does not
select that filter automatically. New RBN settings use **All calls**. To opt in:

1. Download **CWops CWT call history** under
   **Settings → Accounts, Services & Data Sources** (called **Data Files**
   in earlier app builds).
2. Open **Settings → RBN → Spots — Who I might hear → Call-history filter**
   and select **CWT call-history file**.
3. Select **All calls** in the same selector to disable call-history filtering.

Existing saved filter choices are preserved. A selected filter with no data
file yields no spots. Failed updates retain the last good file.

The filter includes all file entries, including nonmembers and calls with
no exchange. Exact calls and unambiguous base-call matches are accepted:
`K1ABC/P` can match `K1ABC`. It uses no prior logged contacts and does not
prove current CWT participation or CWops membership.

CWT fetches no RBN reports. Its versioned `spotCallFilter:v1` hook answers
bounded callsign batches from cached history; the shared
`packages/spot-filters` contract also supports MST and SST providers.
The filter has no active-operation context and does not switch contests
automatically. Choose the desired filter in the supplying extension.

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
