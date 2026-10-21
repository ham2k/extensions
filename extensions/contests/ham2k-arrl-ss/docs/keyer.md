# Sweepstakes CW exchange for the keyer

Configure the operation's Sweepstakes activity for CW, including your category,
check and section. Set the operation's station callsign to the call you will use
on the air. In the active CW message set, paste the template below into the
exchange message, F2. Enter Sends Messages uses that exchange message too.

The template reads your Sweepstakes setup and the draft's **Our #** field. It
sends the exchange in order: serial, precedence, your callsign, check, section.
Sweepstakes has no RST in its exchange. For example, serial 9, Single Op Low
Power, check 00 and section ENY produce `9 A N1RWJ 00 ENY`.

```liquid
{%- assign ss = op.refs | where: "type", "arrl-ss" | first -%}
{%- assign entry = ss.entry | strip | upcase -%}
{%- assign call = op.call | strip | upcase -%}
{%- assign check = ss.check | strip -%}
{%- assign section = ss.section | strip | upcase -%}
{%- capture precedence -%}
{%- case entry -%}
{%- when "SO-QRP" -%}Q
{%- when "SO-LOW" -%}A
{%- when "SO-HIGH" -%}B
{%- when "SOU-QRP", "SOU-LOW", "SOU-HIGH" -%}U
{%- when "MULTI-LOW", "MULTI-HIGH" -%}M
{%- when "SCHOOL" -%}S
{%- endcase -%}
{%- endcapture -%}
{%- if ss.mode == "CW" and qso.serialSent != blank and precedence != blank and call != blank and check != blank and section != blank -%}
{{ qso.serialSent }} {{ precedence }} {{ call }} {{ check }} {{ section }}
{%- endif -%}
```

Begin entering the contact so **Our #** has a number. An empty draft, missing
setup value, unrecognized category, or a Phone operation produces an empty
message. The template does not validate the check or section: review those in
setup before operating.

Sending F2 again repeats the same number; rendering or sending this message does
not advance the serial. Logging the contact advances the sequence for the next
contact. If you correct **Our #** manually, the message uses that displayed
number.

To send three digits, replace only `{{ qso.serialSent }}` with
`{{ qso.serialSent | pad: 3 }}`. Serial 9 then sends `009`; a longer serial is
not truncated. For CW cut numbers, use
`{{ qso.serialSent | pad: 3 | cut }}` instead: 9 sends `TTN`, since the default
cuts replace 0 with T and 9 with N. Apply these filters only to the serial so
your callsign and check stay as configured. A blank serial stays blank.

The example is tested directly from this document against the SDK's Liquid
renderer. It is a template test; it does not transmit or exercise a physical
keyer.
