import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:mister/core/data/services.dart';

/// تنفيذ ConnectivityService — connectivity_plus.
class ConnectivityServiceImpl implements ConnectivityService {
  ConnectivityServiceImpl([Connectivity? connectivity])
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  @override
  Stream<bool> get online => _connectivity.onConnectivityChanged
      .map((results) => results.any((r) => r != ConnectivityResult.none));
}
