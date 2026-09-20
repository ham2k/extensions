# Dashboard extensions

`ham2k-custom-text` provides the text panel. The three SVG reference panels
live here rather than being bundled into HaLo:

- `ki2d-weather-panel`: forecast, hourly inspection and weather icons.
- `ki2d-solar-panel`: solar conditions, propagation and history charts.
- `ki2d-radio-panel`: a radio front panel, including Modern/LCD displays, radio
  selection, tuning, connection controls and received-signal metering.
  Its manifest declares `requiresRadioWrite`: the host refuses the radio
  calls to an extension that does not, and names the claim at install.

Their keys follow the `<callsign>-<name>` convention, so they install from a
file like any other extension; manage them under Features & Extensions. The
prototype's placements do not carry over, since a placement is keyed by
extension.

## Development

The three SVG panels need `@ham2k/extension-sdk` 0.5.0 or later, the first
release with `svgScene`, the render environment and the radio host APIs. It
installs from npm like any other dependency:

```sh
npm install
npm run typecheck --workspace @ham2k/ext-ki2d-radio-panel
npm run test --workspace @ham2k/ext-ki2d-radio-panel
npm run pack --workspace @ham2k/ext-ki2d-radio-panel
```

The same three scripts exist for `@ham2k/ext-ki2d-weather-panel` and
`@ham2k/ext-ki2d-solar-panel`. Do not publish these examples until a host with
compatible support is available. On older hosts the panels show an unavailable
message.
