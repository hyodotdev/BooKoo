import Foundation

enum ReceiptRecognitionLanguages {
  static func select(preferred: [String], supported: [String]) -> [String] {
    var selected: String?
    for identifier in preferred {
      let normalized = identifier.replacingOccurrences(of: "_", with: "-")
      if let exact = supported.first(where: { $0.caseInsensitiveCompare(normalized) == .orderedSame }) {
        selected = exact
        break
      }
      let language = Locale.Language(identifier: normalized)
      let matches = supported.filter {
        Locale.Language(identifier: $0).languageCode == language.languageCode
      }
      if let matchingScript = matches.first(where: {
        Locale.Language(identifier: $0).script == language.script
      }) ?? matches.first {
        selected = matchingScript
        break
      }
    }
    let english = supported.first(where: { $0 == "en-US" })
      ?? supported.first(where: { Locale.Language(identifier: $0).languageCode?.identifier == "en" })
    guard let primary = selected ?? english else { return [] }
    if Locale.Language(identifier: primary).languageCode?.identifier == "en" { return [primary] }
    return english.map { [primary, $0] } ?? [primary]
  }
}
