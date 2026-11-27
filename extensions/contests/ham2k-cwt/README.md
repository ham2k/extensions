# CWops CWT for Ham2K

Log the **CWops Tests (CWT)** in Ham2K with session selection, exchange
suggestions, scoring, and ADIF/Cabrillo exports. The extension suggests names
and CWops numbers or locations from a downloaded call-history file and your
previous CWT contacts, while preserving what you actually enter. Its extension
key is `ham2k-cwt`, and operations and contacts use `cwt` references.

## The contest at a glance

[CWops CWT](https://cwops.org/cwops-tests/) welcomes members and nonmembers.
Each one-hour session is a separate event.

| Detail | CWT |
| --- | --- |
| Sessions, UTC | Wednesday 13:00 and 19:00; Thursday 03:00 and 07:00 |
| Mode and bands | CW on 160, 80, 40, 20, 15, and 10 meters |
| Exchange | First name + CWops member number; nonmembers send state, province, or DX country prefix |
| Example | `ART 3806` for a member, or `ROB RI` for a nonmember in Rhode Island |
| Score | QSO points × unique callsigns across all bands |

Eligible CW Academy participants can use `CWA` as described in the
[official rules](https://cwops.org/cwops-tests/). A CWops number is a fixed
membership number: **CWT does not use a sequential contact serial number**.
The extension suggests the regular weekly schedule; check the sponsor's
calendar for special sessions or schedule changes.

## Get started

1. Enable one CWops CWT extension in Ham2K. Keep only one CWT extension active
   so the operation has one set of exchange controls and scoring rules. See
   the [repository guide](../../../README.md) for availability and the
   `ham2k-` installation restrictions.
2. Create an operation for the session, add CWT, and select its UTC date/time.
   Set your sent first name, member number or location (or eligible `CWA`
   exchange), and power class.
3. In the desktop or mobile app, refresh **CWops CWT call history (Super Check
   History)** under **Settings → Accounts, Services & Data Sources** before
   operating. Earlier app builds call this area **Data Files**.
4. Enter a callsign, listen to the exchange, and confirm or correct the
   suggested **Name** and **Nr** values before saving.

Use a separate operation for each session and log **one callsign at a time**;
batch call entry shares exchange fields. Use **Wipe** to begin a fresh contact
and reset any edits left in the controls.

## In Ham2K

Open the operation title, then **Edit activity** beside CWT to choose the
UTC session, your sent name/number or location, and power class.

![CWT session and sent-exchange setup in Ham2K](docs/images/cwt-setup.jpg)

The logging view adds **Name** and **Nr** beside the normal contact fields.
Here the selected test contact has `STEVE IA`; the log also shows a member
number and a `CWA` exchange. The **Info** pane identifies the call-history
source, and the log header shows the score.

![CWT exchange controls and saved test contact in Ham2K](docs/images/cwt-logging.jpg)

These native macOS screenshots were captured September 21, 2026 in published
Ham2K Next 26.9.0 build 170, using the personal `n1rwj-cwt` 0.3.1 adaptation
in a 1437×768 window. The **Testing** operation contains synthetic contacts;
the dates and exchanges shown are examples. They illustrate the shared CWT
UI using the published GitHub bundle, not installation of the reserved
`ham2k-cwt` package. No contacts or session settings were changed for capture.

## Where the call history comes from

Ham2K downloads the N1MM-format CWOPS file from Super Check History to suggest
names and CWT exchanges. Confirm the exchange you copy on air.
[Super Check History](https://supercheckhistory.com/)

On desktop and mobile, Ham2K checks for the file when it loads the extension
and when it reconnects. A missing file or one older than 24 hours is eligible
for refresh. To refresh or remove **CWops CWT call history (Super Check
History)** manually, use **Settings → Accounts, Services & Data Sources**
(**Data Files** in earlier builds). The web app currently cannot download the
file because the provider restricts cross-origin requests. Local CWT contacts
also supply suggestions.

The native app keeps the last successful file across restarts and failed
refreshes, including data from before the source changed. The extension
validates the downloaded text and looks up callsigns in an in-memory index.
Lookup notes show the date of the source data and the download date.

## Precedence and corrections

Name and number are resolved independently, in this order:

1. The operator's input, including an intentionally cleared field.
2. Explicit exchanges from earlier QSOs in the current operation.
3. The downloaded CWOPS file.
4. Explicit exchanges from older CWT QSOs in the host's callsign history.

History queries request `{ refType: 'cwt' }` before the host applies its
five-contact limit, so newer contacts in other activities cannot hide older
CWT exchanges. Each portable call and its base call receive the same filter.
Older Ham2K builds ignore it; the extension still rejects unrelated contacts,
but can only use CWT contacts among the latest five returned for each call.

When no source supplies a received exchange, Number/QTH can show the station’s
state or entity prefix as a placeholder. Enter the exchange you copy on air.
The name can fall back to Ham2K’s ordinary name suggestion. Previous untouched
number suggestions are cleared when there is no known exchange.

The native controls own the first step: suggestions only update untouched
fields. A previously guessed ref value is not evidence of operator input.
The save hook preserves explicit values and blanks. It can fill an absent name
from past CWT contacts or a directory lookup. The currently edited QSO is
excluded from history suggestions.

Within each source, exact calls match before portable base calls. A base-call
match may supply a name, member number, or CWA exchange, but never a
nonmember's location. The location placeholder uses the current callsign’s
lookup data. A member number remains unknown until the operator enters one or
a known exchange supplies it.

Lookup notes identify known history/file suggestions and the data file’s
freshness.

## How scoring works

Each eligible contact earns **one point**, and a callsign can count once on
each contest band. Multipliers count **different callsigns across the entire
session**. Working the same station on another band adds a point, but no new
multiplier. For example, 10 contacts with 8 different callsigns score
**10 × 8 = 80**.

Same-band duplicates, non-CW contacts, and contacts on other bands earn no
points. A logged callsign containing `?` earns no points or multiplier until
the callsign is corrected. The current CWT scorer does **not** independently
exclude contacts outside the selected hour or reject incomplete exchanges.
Keep the operation confined to its session and review the exchange fields
before reporting; a displayed score is not a completed-log check.

## Export and report your score

Use Ham2K's **Exports** menu for ADIF or Cabrillo. The files use the
`CWOPS-CWT` contest identifier and retain your sent and received exchanges.
Report each session's total at [3830 Scores](https://www.3830scores.com/),
following the [CWops reporting instructions](https://cwops.org/cwops-tests/).
CWops requests score reports within 48 hours for participation credit;
routine CWT participation does not require a log submission.

## Supported call-history data

The parser follows the [N1MM call-history format](https://n1mmwp.hamdocs.com/setup/call-history/):
comma or semicolon delimiters, quoted fields, `!!Order!!`, comment and contest
association lines, and dates in `# LastEdit,YYYY-MM-DD`, `# Updated YYYY-MM-DD`,
or `# Generated by bb-sch, data through YYYY-MM-DD` comments. Missing columns
remain missing.
Duplicate calls merge nonempty fields deterministically. `Name` and `Exch1`
provide the CWT exchange; `State`, `Sect`, and `UserText` are not substitutes
for an absent `Exch1`. Unsupported directives, incompatible contest
associations, invalid exchanges, and malformed rows reject a refresh. Extra
trailing columns are reported as warnings. Files are limited to 5 MB of text.

No data download happens while entering a callsign. Scoring snapshots index
current-operation history. On hosts that omit the operation UUID from lookup
arguments, the adapter recovers it only from an unambiguous scoring snapshot
with the same creation timestamp and station call. A full-log read is shared
and cached when needed to reconcile the host's capped callsign history;
ordinary lookups use targeted callsign reads. The current host returns at most
five recent matches per exact/base call, so older CWT history outside that
window may be unavailable.

## Export preferences

CWT ADIF and Cabrillo have separate entries in Ham2K's export preferences.
They inherit common defaults until customized; filename templates receive the
selected CWT session. Generic `contest-adif` and `cabrillo` requests remain
accepted for CWT operations, while the core `adif` type is never delegated back
into this exporter. Preferences use the registered `cwt-adif` and
`cwt-cabrillo` types; this does not move unrelated generic preferences.

## Verification

From the repository root:

```sh
npm test -w @ham2k/ext-cwt
npm run typecheck
npm test
npm run pack -w @ham2k/ext-cwt
```

Tests cover parsing, field precedence, portable calls, offline cache replay,
failed-refresh retention, edited and deleted history, scoring checkpoints, and
the path from registered controls through saved and exported exchanges.
The repository's bundle test builds, validates, packs, and loads every
extension against a stub kernel. These are automated checks, not a native
Ham2K UI test. See the root README for the reserved `ham2k-` installation rule:
hand testing requires a temporary personal key or catalog distribution.

The prefill modules were developed by Robert Jackson, N1RWJ, and contributed
under this repository's MIT license. Sebastian Delmont's existing CWT code
and copyright remain intact.

## Spots

Enable RBN to supply reports to the native Spots panel. Use the native source,
band, and mode filters to browse those reports. The RBN call-history selector
was removed because newer hosts reject the legacy cross-extension hook.
HaLo does not yet offer a native call-history filter. See [RBN spots](SPOTS.md)
for legacy compatibility and verification.
