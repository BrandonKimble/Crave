Pod::Spec.new do |s|
  s.name         = 'TrackScrollKit'
  s.version      = '0.1.0'
  s.summary      = 'The ONE TRACK native hatch: phase-dependent bounds + detent targeting at the UIScrollView delegate level.'
  s.description  = 'Attaches a delegate proxy to any RN-hosted UIScrollView so the ballistic lower bound is engine-known before deceleration is configured (real native bounce at the list top) and detent snaps ride targetContentOffset (the platform snap API). Design: plans/page-composition-from-scratch-design.md sec THE ONE TRACK / sec 8.'
  s.homepage     = 'https://crave.local/trackscrollkit'
  s.license      = { :type => 'MIT', :text => 'Internal' }
  s.author       = { 'Crave' => 'dev@crave.local' }
  s.platform     = :ios, '15.1'
  s.source       = { :git => 'https://crave.local/trackscrollkit.git', :tag => s.version.to_s }
  s.source_files = 'Sources/**/*.{h,m}'
  s.dependency 'React-Core'
end
