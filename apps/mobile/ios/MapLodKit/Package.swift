// swift-tools-version:5.9
import PackageDescription

// Canonical home for the PURE native LOD logic that the map render controller
// depends on. Kept dependency-free (Foundation/CoreGraphics/CoreLocation only)
// so it builds for the macOS host and its tests run via `swift test` — fast,
// deterministic, no simulator, no Mapbox, no React. Mirrors the JS property-test
// discipline for the half of the LOD brain that lives in Swift.
let package = Package(
  name: "MapLodKit",
  platforms: [.iOS(.v15), .macOS(.v12)],
  products: [
    .library(name: "MapLodKit", targets: ["MapLodKit"]),
  ],
  targets: [
    .target(name: "MapLodKit"),
    .testTarget(name: "MapLodKitTests", dependencies: ["MapLodKit"]),
  ]
)
