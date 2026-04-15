// lib/services/charge_api.dart
// Flutter → calls our Node.js backend on zone entry
// Backend → scrapes APCOA → returns entry/exit/fee data

import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/zone.dart';
import '../models/charge.dart';

class ChargeApiService {
  // Change this to your deployed backend URL
  static const String _baseUrl = 'https://your-backend.railway.app';
  // For local development: 'http://localhost:3000'

  // ── Called by geofence when driver enters a zone ──
  // Returns entry time, exit time, fee — straight from APCOA
  static Future<ApcoaChargeResult> checkCharge({
    required String plate,
    required String zoneId,
    required String fcmToken,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/zone-entry'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'plate': plate.replaceAll(' ', '').toUpperCase(),
        'zoneId': zoneId,
        'fcmToken': fcmToken,
      }),
    ).timeout(const Duration(seconds: 25));

    if (response.statusCode == 200) {
      return ApcoaChargeResult.fromJson(jsonDecode(response.body));
    }
    throw Exception('API error ${response.statusCode}: ${response.body}');
  }

  // ── Manual re-check (user taps "Refresh") ──
  static Future<ApcoaChargeResult> refreshCharge(String plate, String zoneId) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/api/check-charge?plate=${Uri.encodeComponent(plate)}&zone=$zoneId'),
    ).timeout(const Duration(seconds: 20));

    if (response.statusCode == 200) {
      return ApcoaChargeResult.fromJson(jsonDecode(response.body));
    }
    throw Exception('API error ${response.statusCode}');
  }

  // ── Create Stripe payment sheet (Apple Pay / Google Pay) ──
  static Future<Map<String, String>> createPaymentSheet({
    required double amount,
    required String plate,
    required String zoneId,
    String? customerId,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/payment-sheet'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'amount': amount,
        'plate': plate,
        'zoneId': zoneId,
        if (customerId != null) 'customerId': customerId,
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return {
        'paymentIntent': data['paymentIntent'],
        'ephemeralKey': data['ephemeralKey'],
        'customer': data['customer'],
      };
    }
    throw Exception('Payment sheet creation failed');
  }
}

// ── Data model for APCOA response ──
class ApcoaChargeResult {
  final bool hasCharge;
  final String plate;
  final String airportName;
  final String zoneId;
  final String? entryTime;   // "Mon 23 March 19:47:25"
  final String? exitTime;    // "Mon 23 March 19:49:13"
  final int? durationMinutes;
  final double fee;
  final double penaltyFee;
  final String payUrl;
  final String? payByDeadline;
  final bool needsManualCheck;
  final String? message;

  const ApcoaChargeResult({
    required this.hasCharge,
    required this.plate,
    required this.airportName,
    required this.zoneId,
    this.entryTime,
    this.exitTime,
    this.durationMinutes,
    required this.fee,
    required this.penaltyFee,
    required this.payUrl,
    this.payByDeadline,
    this.needsManualCheck = false,
    this.message,
  });

  factory ApcoaChargeResult.fromJson(Map<String, dynamic> j) => ApcoaChargeResult(
    hasCharge: j['hasCharge'] ?? false,
    plate: j['plate'] ?? '',
    airportName: j['airportName'] ?? '',
    zoneId: j['zoneId'] ?? '',
    entryTime: j['entryTime'],
    exitTime: j['exitTime'],
    durationMinutes: j['durationMinutes'],
    fee: (j['fee'] ?? 0).toDouble(),
    penaltyFee: (j['penaltyFee'] ?? 80).toDouble(),
    payUrl: j['payUrl'] ?? '',
    payByDeadline: j['payByDeadline'],
    needsManualCheck: j['needsManualCheck'] ?? false,
    message: j['message'],
  );

  String get durationLabel {
    if (durationMinutes == null) return '—';
    if (durationMinutes! < 60) return '${durationMinutes}min';
    return '${durationMinutes! ~/ 60}h ${durationMinutes! % 60}min';
  }

  String get feeLabel {
    if (fee <= 0) return 'No charge';
    return '£${fee.toStringAsFixed(2)}';
  }
}
