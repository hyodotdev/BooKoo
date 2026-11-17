Pod::Spec.new do |s|
  s.name = 'BookooReceiptOcr'
  s.version = '1.0.0'
  s.summary = 'Local receipt text recognition for BooKoo'
  s.description = 'On-device receipt text recognition using Apple Vision'
  s.license = { :type => 'AGPL-3.0-only' }
  s.author = 'BooKoo'
  s.homepage = 'https://github.com/hyodotdev/BooKoo'
  s.source = { :git => 'https://github.com/hyodotdev/BooKoo.git' }
  s.platform = :ios, '17.0'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'UIKit'
  s.source_files = '**/*.{h,m,swift}'
end
