import CoreGraphics
import CoreLocation
import Foundation

/// Screen-space visibility decision for the map LOD layer.
///
/// This is the pure half of `SearchMapRenderController.computeOnScreenMarkerKeys`:
/// given a way to project/unproject coordinates (injected, because that part needs
/// a live Mapbox map), it decides which catalog markers are actually on-screen
/// under the current camera — accurately under pitch/twist, which a lat/lng AABB
/// cannot be. The projection itself stays in the controller; ALL the decision
/// logic (rect containment, the +pad ring, finiteness, and the behind-camera /
/// over-horizon round-trip guard) lives here so it can be unit-tested without a
/// simulator or Mapbox.
public enum ScreenSpaceVisibility {
  public struct CatalogEntry: Equatable {
    public let markerKey: String
    public let coordinate: CLLocationCoordinate2D

    public init(markerKey: String, coordinate: CLLocationCoordinate2D) {
      self.markerKey = markerKey
      self.coordinate = coordinate
    }

    public static func == (lhs: CatalogEntry, rhs: CatalogEntry) -> Bool {
      lhs.markerKey == rhs.markerKey
        && lhs.coordinate.latitude == rhs.coordinate.latitude
        && lhs.coordinate.longitude == rhs.coordinate.longitude
    }
  }

  /// Default tolerance (degrees) for the round-trip guard. A valid on-screen
  /// projection round-trips to within floating-point error; a coordinate behind
  /// the camera or over the horizon projects to a bogus point that, unprojected,
  /// diverges by whole degrees.
  public static let defaultCoordinateTolerance: Double = 0.001

  /// Decide whether a single projected marker is on-screen.
  /// - Parameters:
  ///   - point: screen projection of `original` (e.g. `mapboxMap.point(for:)`)
  ///   - roundTrip: `point` unprojected back to a coordinate (`mapboxMap.coordinate(for:)`)
  ///   - original: the marker's true coordinate
  ///   - viewBounds: the map view's bounds
  ///   - padPx: extra ring (px) around the view kept eligible (absorbs gesture lag)
  public static func isProjectionOnScreen(
    point: CGPoint,
    roundTrip: CLLocationCoordinate2D,
    original: CLLocationCoordinate2D,
    viewBounds: CGRect,
    padPx: CGFloat,
    coordinateTolerance: Double = defaultCoordinateTolerance
  ) -> Bool {
    guard point.x.isFinite, point.y.isFinite else {
      return false
    }
    let expanded = viewBounds.insetBy(dx: -padPx, dy: -padPx)
    guard expanded.contains(point) else {
      return false
    }
    guard roundTrip.latitude.isFinite, roundTrip.longitude.isFinite else {
      return false
    }
    return abs(roundTrip.latitude - original.latitude) < coordinateTolerance
      && abs(roundTrip.longitude - original.longitude) < coordinateTolerance
  }

  /// The on-screen marker-key set for a catalog under the current camera. The
  /// projection functions are injected so this whole loop is testable without a
  /// live map. Result order follows catalog order.
  public static func onScreenMarkerKeys(
    catalog: [CatalogEntry],
    viewBounds: CGRect,
    padPx: CGFloat,
    project: (CLLocationCoordinate2D) -> CGPoint,
    unproject: (CGPoint) -> CLLocationCoordinate2D,
    coordinateTolerance: Double = defaultCoordinateTolerance
  ) -> [String] {
    guard !catalog.isEmpty else {
      return []
    }
    var visible: [String] = []
    visible.reserveCapacity(catalog.count)
    for entry in catalog {
      let point = project(entry.coordinate)
      // Cheap finiteness/containment check before paying for the unproject.
      guard point.x.isFinite, point.y.isFinite,
            viewBounds.insetBy(dx: -padPx, dy: -padPx).contains(point) else {
        continue
      }
      if isProjectionOnScreen(
        point: point,
        roundTrip: unproject(point),
        original: entry.coordinate,
        viewBounds: viewBounds,
        padPx: padPx,
        coordinateTolerance: coordinateTolerance
      ) {
        visible.append(entry.markerKey)
      }
    }
    return visible
  }
}
