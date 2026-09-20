// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
import 'dart:io';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:halo_core/halo_core.dart';
import 'package:ham2k_logger/views/operation/svg_scene/scene_view.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:halo_i18n/halo_i18n.dart';
import 'package:ham2k_logger/views/operation/extension_panel.dart';
import 'package:halo_extension_host/halo_extension_host.dart';
import 'package:ham2k_logger/services/panel_service.dart';
import 'package:ham2k_logger/views/operation/panel_content_view.dart';

import 'package:ham2k_logger/services/extension_service.dart';

/// The production service over a host started here, counting what crosses the
/// bridge so a failure can say how far the panel got.
class _PanelHostService extends ExtensionService {
  final ExtensionHost panelHost;
  int renders = 0, events = 0;
  _PanelHostService(this.panelHost);
  @override
  ExtensionHost get host => panelHost;
  @override
  Future<Map<String, dynamic>> readPanelConfig({
    required String panelKey,
    required List<Map<String, dynamic>> fields,
  }) async => {};

  @override
  Future<Map<String, dynamic>?> renderPanel({
    required String hookKey,
    required String panelKey,
    required Map<String, dynamic> args,
  }) {
    renders++;
    return super.renderPanel(hookKey: hookKey, panelKey: panelKey, args: args);
  }

  @override
  Future<Map<String, dynamic>?> panelEvent({
    required String hookKey,
    required String panelKey,
    required Map<String, dynamic> args,
  }) {
    events++;
    return super.panelEvent(hookKey: hookKey, panelKey: panelKey, args: args);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('real weather extension receives host environment and renders native typography', (tester) async {
    final now = nowMillis();
    var fetches = 0;
    final host = (await tester.runAsync(
      () => ExtensionHost.start(
        kernelSource: File('assets/extensions/kernel.js').readAsStringSync(),
        extensions: [
          ExtensionBundle(key: 'ki2d-weather-panel', source: File('${Platform.environment['SVG_PANEL_BUNDLES']}/ki2d-weather-panel/build/index.js').readAsStringSync()),
        ],
        fetchAllowlists: const {
          'ki2d-weather-panel': ['api.open-meteo.com'],
        },
        httpClient: MockClient((request) async {
          fetches++;
          expect(request.url.host, 'api.open-meteo.com');
          return http.Response(
            jsonEncode({
              'current': {'temperature_2m': 23, 'weather_code': 2},
              'hourly': {
                'time': [for (var i = 0; i < 8; i++) now ~/ 1000 + i * 3600],
                'temperature_2m': [23, 24, 25, 24, 22, 21, 20, 19],
                'precipitation_probability': [0, 10, 20, 40, 60, 50, 20, 0],
              },
            }),
            200,
          );
        }),
        onHostCall: (method, args) async =>
            method == 'getSettings' ? {'locale': 'en', 'distanceUnits': 'kilometers'} : null,
      ),
    ))!;
    final service = _PanelHostService(host);
    final panels = PanelService(service);
    await tester.runAsync(panels.refreshExtensionPanels);
    await tester.pumpWidget(
      TranslationProvider(
        child: MaterialApp(
          theme: ThemeData(fontFamily: 'Roboto'),
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 440,
                height: 380,
                child: ExtensionPanel(
                  panel: panels['ext:ki2d-weather-panel:weather#1']!,
                  panels: panels,
                  renderContext: PanelRenderContext(
                    operation: Operation(uuid: 'weather', data: const {'grid': 'FN42'}),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();
    await tester.pump();
    expect(
      find.byType(SvgSceneView),
      findsOneWidget,
      reason:
          'renders=${service.renders}, fetches=$fetches, content=${tester.widget<PanelContentView>(find.byType(PanelContentView)).content?.content}',
    );
    expect(find.text('23°C'), findsOneWidget);
    expect(tester.widget<Text>(find.text('23°C')).style?.fontFamily, 'Roboto');
    await tester.tap(find.bySemanticsLabel('Forecast hour'));
    await tester.pump();
    expect(fetches, 1);
    expect(service.events, 0);
    await tester.pumpWidget(const SizedBox());
    panels.dispose();
    await tester.runAsync(host.dispose);
  });

  testWidgets('real radio bundle displays tuning immediately and routes continuous knob changes', (tester) async {
    var commands = 0;
    num? requestedHz;
    final host = (await tester.runAsync(
      () => ExtensionHost.start(
        kernelSource: File('assets/extensions/kernel.js').readAsStringSync(),
        extensions: [
          ExtensionBundle(key: 'ki2d-radio-panel', source: File('${Platform.environment['SVG_PANEL_BUNDLES']}/ki2d-radio-panel/build/index.js').readAsStringSync()),
        ],
        onHostCall: (method, args) async {
          const state = {
            'id': 'test-radio',
            'name': 'Test radio',
            'status': 'connected',
            'stale': false,
            'problem': null,
            'frequencyHz': 14074000,
            'mode': 'USB',
            'powerWatts': 5,
            'transmitting': false,
            'meters': <String, dynamic>{},
            'canTune': true,
          };
          if (method == 'readRadio') return state;
          if (method == 'tuneRadio') {
            commands++;
            expect(args['id'], 'test-radio');
            expect(args['frequencyHz'], greaterThan(14074000));
            requestedHz = args['frequencyHz'] as num;
            return {'accepted': true, 'state': state};
          }
          return method == 'getSettings' ? {'locale': 'en'} : null;
        },
      ),
    ))!;
    final service = _PanelHostService(host);
    final panels = PanelService(service);
    await tester.runAsync(panels.refreshExtensionPanels);
    await tester.pumpWidget(
      TranslationProvider(
        child: MaterialApp(
          theme: ThemeData(fontFamily: 'Roboto'),
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 440,
                height: 600,
                child: ExtensionPanel(
                  panel: panels['ext:ki2d-radio-panel:front-face#1']!,
                  panels: panels,
                  renderContext: PanelRenderContext(
                    operation: Operation(uuid: 'weather', data: const {'grid': 'FN42'}),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();
    await tester.pump();
    expect(
      find.byType(SvgSceneView),
      findsOneWidget,
      reason:
          'renders=${service.renders}, commands=$commands, content=${tester.widget<PanelContentView>(find.byType(PanelContentView)).content?.content}',
    );
    expect(find.text('14'), findsOneWidget);
    expect(find.text('074'), findsOneWidget);
    expect(find.text('000'), findsOneWidget);
    expect(tester.widget<Text>(find.text('14')).style?.fontFamily, 'Roboto');
    await tester.drag(find.bySemanticsLabel('Tune frequency').first, const Offset(30, 0));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();
    expect(commands, greaterThanOrEqualTo(1));
    expect(find.text(((requestedHz! / 1000).floor() % 1000).toString().padLeft(3, '0')), findsOneWidget);
    expect(service.events, greaterThanOrEqualTo(1));
    await tester.pumpWidget(const SizedBox());
    panels.dispose();
    await tester.runAsync(host.dispose);
  });

  testWidgets('real solar extension discovers and renders history with local inspection', (tester) async {
    final now = nowMillis();
    var fetches = 0;
    final host = (await tester.runAsync(
      () => ExtensionHost.start(
        kernelSource: File('assets/extensions/kernel.js').readAsStringSync(),
        extensions: [
          ExtensionBundle(key: 'ki2d-solar-panel', source: File('${Platform.environment['SVG_PANEL_BUNDLES']}/ki2d-solar-panel/build/index.js').readAsStringSync()),
        ],
        fetchAllowlists: const {
          'ki2d-solar-panel': ['www.hamqsl.com', 'services.swpc.noaa.gov'],
        },
        httpClient: MockClient((request) async {
          fetches++;
          if (request.url.host == 'www.hamqsl.com') {
            return http.Response(
              '<solarflux>132</solarflux><sunspots>83</sunspots><kindex>2</kindex><band name="20m" time="day">Good</band>',
              200,
            );
          }
          final times = [
            for (var i = 0; i < 3; i++)
              DateTime.fromMillisecondsSinceEpoch(now - (6 - i * 3) * 3600000, isUtc: true).toIso8601String(),
          ];
          final field = request.url.path.contains('f107')
              ? 'flux'
              : request.url.path.contains('k-index')
              ? 'Kp'
              : 'speed';
          return http.Response(
            jsonEncode(
              field == 'flux'
                  ? [
                      for (var i = 0; i < 3; i++) {'time_tag': times[i], 'flux': 130 + i},
                    ]
                  : [
                      ['time_tag', field],
                      for (var i = 0; i < 3; i++) [times[i], field == 'Kp' ? i + 1 : 400 + i * 10],
                    ],
            ),
            200,
          );
        }),
        onHostCall: (method, args) async =>
            method == 'getSettings' ? {'locale': 'en', 'distanceUnits': 'kilometers'} : null,
      ),
    ))!;
    final service = _PanelHostService(host);
    final panels = PanelService(service);
    await tester.runAsync(panels.refreshExtensionPanels);
    await tester.pumpWidget(
      TranslationProvider(
        child: MaterialApp(
          theme: ThemeData(fontFamily: 'Roboto'),
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 440,
                height: 650,
                child: ExtensionPanel(
                  panel: panels['ext:ki2d-solar-panel:solar#1']!,
                  panels: panels,
                  renderContext: PanelRenderContext(
                    operation: Operation(uuid: 'weather', data: const {'grid': 'FN42'}),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();
    await tester.pump();
    expect(
      find.byType(SvgSceneView),
      findsOneWidget,
      reason:
          'renders=${service.renders}, fetches=$fetches, content=${tester.widget<PanelContentView>(find.byType(PanelContentView)).content?.content}',
    );
    expect(find.text('SFI 132'), findsOneWidget);
    expect(tester.widget<Text>(find.text('SFI 132')).style?.fontFamily, 'Roboto');
    await tester.tap(find.bySemanticsLabel('Solar history'));
    await tester.pump();
    expect(fetches, 5);
    expect(service.events, 0);
    await tester.pumpWidget(const SizedBox());
    panels.dispose();
    await tester.runAsync(host.dispose);
  });

}
