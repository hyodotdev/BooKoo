import Foundation

let supported = ["en-US", "en-GB", "ko-KR", "ja-JP", "zh-Hans", "zh-Hant", "fr-FR"]
let cases: [(String, [String], [String], [String])] = [
  ("device Korean precedes English", ["ko-KR", "ja-JP"], supported, ["ko-KR", "en-US"]),
  ("region maps to one Japanese model", ["ja-US"], supported, ["ja-JP", "en-US"]),
  ("English region is preserved without duplicate", ["en-GB", "ko-KR"], supported, ["en-GB"]),
  ("traditional Chinese stays traditional", ["zh-Hant-TW"], supported, ["zh-Hant", "en-US"]),
  ("Taiwan infers traditional Chinese", ["zh-TW"], supported, ["zh-Hant", "en-US"]),
  ("simplified Chinese stays simplified", ["zh-Hans-CN"], supported, ["zh-Hans", "en-US"]),
  ("unsupported preference skips to next device language", ["xx-XX", "fr-CA"], supported, ["fr-FR", "en-US"]),
  ("unsupported device language falls back to English", ["xx-XX"], supported, ["en-US"]),
  ("empty preferences fall back to English", [], supported, ["en-US"]),
  ("no English model does not add unsupported language", ["ko-KR"], ["ko-KR"], ["ko-KR"]),
  ("no supported preference does not select unrelated models", ["xx-XX"], ["ko-KR"], [])
]
for (name, preferred, available, expected) in cases {
  let actual = ReceiptRecognitionLanguages.select(preferred: preferred, supported: available)
  guard actual == expected else {
    fatalError("\(name): expected \(expected), got \(actual)")
  }
}
print("Receipt recognition language selection: \(cases.count) cases passed")
