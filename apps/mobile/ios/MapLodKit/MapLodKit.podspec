Pod::Spec.new do |s|
  s.name         = 'MapLodKit'
  s.version      = '0.1.0'
  s.summary      = 'Pure, dependency-free native LOD logic for the search map (single source of truth, unit-tested via `swift test`).'
  s.description  = 'Screen-space visibility / LOD decision logic extracted from SearchMapRenderController so it can be unit-tested without a simulator, Mapbox, or React. Consumed by the app as a local pod; tested via the sibling Swift Package.'
  s.homepage     = 'https://crave.local/maplodkit'
  s.license      = { :type => 'MIT', :text => 'Internal' }
  s.author       = { 'Crave' => 'dev@crave.local' }
  s.platform     = :ios, '15.1'
  s.swift_version = '5.9'
  # Local development pod (referenced via :path in the Podfile); source is not fetched.
  s.source       = { :git => 'https://crave.local/maplodkit.git', :tag => s.version.to_s }
  s.source_files = 'Sources/MapLodKit/**/*.swift'
  s.frameworks   = 'CoreGraphics', 'CoreLocation'
end
