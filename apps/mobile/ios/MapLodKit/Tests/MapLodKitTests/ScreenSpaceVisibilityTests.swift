import CoreGraphics
import CoreLocation
import XCTest

@testable import MapLodKit

final class ScreenSpaceVisibilityTests: XCTestCase {
  private let viewBounds = CGRect(x: 0, y: 0, width: 400, height: 800)
  private let pad: CGFloat = 64
  private let austin = CLLocationCoordinate2D(latitude: 30.2672, longitude: -97.7431)

  // A round-trip that matches the original (a valid on-screen projection).
  private func exact(_ c: CLLocationCoordinate2D) -> CLLocationCoordinate2D { c }

  // MARK: isProjectionOnScreen

  func testPointInsideViewIsVisible() {
    XCTAssertTrue(
      ScreenSpaceVisibility.isProjectionOnScreen(
        point: CGPoint(x: 200, y: 400),
        roundTrip: exact(austin), original: austin,
        viewBounds: viewBounds, padPx: pad
      )
    )
  }

  func testPointWellOutsideViewIsNotVisible() {
    XCTAssertFalse(
      ScreenSpaceVisibility.isProjectionOnScreen(
        point: CGPoint(x: -500, y: 400),
        roundTrip: exact(austin), original: austin,
        viewBounds: viewBounds, padPx: pad
      )
    )
  }

  func testPointInsidePadRingIsVisible() {
    // 30px off the left edge — outside the view, inside the 64px pad.
    XCTAssertTrue(
      ScreenSpaceVisibility.isProjectionOnScreen(
        point: CGPoint(x: -30, y: 400),
        roundTrip: exact(austin), original: austin,
        viewBounds: viewBounds, padPx: pad
      )
    )
  }

  func testPointJustBeyondPadIsNotVisible() {
    XCTAssertFalse(
      ScreenSpaceVisibility.isProjectionOnScreen(
        point: CGPoint(x: -65, y: 400),
        roundTrip: exact(austin), original: austin,
        viewBounds: viewBounds, padPx: pad
      )
    )
  }

  func testNonFinitePointIsNotVisible() {
    for bad in [CGPoint(x: CGFloat.infinity, y: 400), CGPoint(x: 200, y: CGFloat.nan)] {
      XCTAssertFalse(
        ScreenSpaceVisibility.isProjectionOnScreen(
          point: bad, roundTrip: exact(austin), original: austin,
          viewBounds: viewBounds, padPx: pad
        ),
        "expected non-finite point \(bad) to be rejected"
      )
    }
  }

  func testBehindCameraRoundTripDivergenceIsRejected() {
    // The point lands inside the view, but unprojecting it yields a coordinate
    // whole degrees away — the classic behind-camera / over-horizon projection
    // that `point(for:)` happily returns. Must be rejected.
    let divergent = CLLocationCoordinate2D(latitude: 31.9, longitude: -96.1)
    XCTAssertFalse(
      ScreenSpaceVisibility.isProjectionOnScreen(
        point: CGPoint(x: 200, y: 400),
        roundTrip: divergent, original: austin,
        viewBounds: viewBounds, padPx: pad
      )
    )
  }

  func testRoundTripWithinToleranceIsAccepted() {
    let withinEps = CLLocationCoordinate2D(
      latitude: austin.latitude + 0.0005, longitude: austin.longitude - 0.0005
    )
    XCTAssertTrue(
      ScreenSpaceVisibility.isProjectionOnScreen(
        point: CGPoint(x: 200, y: 400),
        roundTrip: withinEps, original: austin,
        viewBounds: viewBounds, padPx: pad
      )
    )
  }

  func testNonFiniteRoundTripIsRejected() {
    let badRoundTrip = CLLocationCoordinate2D(latitude: .nan, longitude: -97.7431)
    XCTAssertFalse(
      ScreenSpaceVisibility.isProjectionOnScreen(
        point: CGPoint(x: 200, y: 400),
        roundTrip: badRoundTrip, original: austin,
        viewBounds: viewBounds, padPx: pad
      )
    )
  }

  // MARK: onScreenMarkerKeys (full loop with injected projection)

  func testEmptyCatalogReturnsEmpty() {
    XCTAssertEqual(
      ScreenSpaceVisibility.onScreenMarkerKeys(
        catalog: [], viewBounds: viewBounds, padPx: pad,
        project: { _ in .zero }, unproject: { _ in self.austin }
      ),
      []
    )
  }

  func testLoopKeepsOnlyOnScreenWellFormedMarkers() {
    let onScreen = CLLocationCoordinate2D(latitude: 30.30, longitude: -97.74)
    let offScreen = CLLocationCoordinate2D(latitude: 30.20, longitude: -97.60)
    let behindCamera = CLLocationCoordinate2D(latitude: 30.35, longitude: -97.80)
    let catalog = [
      ScreenSpaceVisibility.CatalogEntry(markerKey: "on", coordinate: onScreen),
      ScreenSpaceVisibility.CatalogEntry(markerKey: "off", coordinate: offScreen),
      ScreenSpaceVisibility.CatalogEntry(markerKey: "behind", coordinate: behindCamera),
    ]
    // Fake projector: "on" → center, "off" → far off-screen, "behind" → inside the
    // view but unprojects to a divergent coordinate (behind-camera artifact).
    let project: (CLLocationCoordinate2D) -> CGPoint = { coord in
      if coord.latitude == onScreen.latitude { return CGPoint(x: 200, y: 400) }
      if coord.latitude == offScreen.latitude { return CGPoint(x: 5000, y: 400) }
      return CGPoint(x: 210, y: 410) // behind: lands on-screen
    }
    let unproject: (CGPoint) -> CLLocationCoordinate2D = { point in
      // Only the "behind" point (210,410) round-trips to garbage; others round-trip exact.
      if point == CGPoint(x: 210, y: 410) {
        return CLLocationCoordinate2D(latitude: 10, longitude: 10)
      }
      if point == CGPoint(x: 200, y: 400) { return onScreen }
      return offScreen
    }
    let visible = ScreenSpaceVisibility.onScreenMarkerKeys(
      catalog: catalog, viewBounds: viewBounds, padPx: pad,
      project: project, unproject: unproject
    )
    XCTAssertEqual(visible, ["on"])
  }

  func testLoopPreservesCatalogOrderWhenAllVisible() {
    let coords = (0..<5).map {
      CLLocationCoordinate2D(latitude: 30.0 + Double($0) * 0.01, longitude: -97.7)
    }
    let catalog = coords.enumerated().map {
      ScreenSpaceVisibility.CatalogEntry(markerKey: "m\($0.offset)", coordinate: $0.element)
    }
    // Each marker projects to its own distinct on-screen point (y encodes the
    // latitude index), and unproject inverts it exactly → all five visible, in
    // catalog order.
    let project: (CLLocationCoordinate2D) -> CGPoint = { coord in
      CGPoint(x: 100, y: 100 + (coord.latitude - 30.0) / 0.01 * 10)
    }
    let unproject: (CGPoint) -> CLLocationCoordinate2D = { point in
      let index = Int(((point.y - 100) / 10).rounded())
      return coords[index]
    }
    let visible = ScreenSpaceVisibility.onScreenMarkerKeys(
      catalog: catalog, viewBounds: viewBounds, padPx: pad,
      project: project, unproject: unproject
    )
    XCTAssertEqual(visible, ["m0", "m1", "m2", "m3", "m4"])
  }
}
