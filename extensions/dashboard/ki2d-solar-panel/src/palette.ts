// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0

// Match SolarPalette and index thresholds in the native solar_charts.dart.
// Status colors retain their meaning in both light and dark themes.
export const solarPalette = { good: '#2e9e4f', fair: '#c08316', poor: '#d04a34', severe: '#8b5cc7' }
export const solarFluxColor = (sfi: number) => sfi < 100 ? solarPalette.poor : sfi < 150 ? solarPalette.fair : solarPalette.good
export const solarAColor = (a: number) => a < 20 ? solarPalette.good : a < 30 ? solarPalette.fair : a < 100 ? solarPalette.poor : solarPalette.severe
export const solarKColor = (k: number) => k <= 3 ? solarPalette.good : k < 5 ? solarPalette.fair : k < 7 ? solarPalette.poor : solarPalette.severe
