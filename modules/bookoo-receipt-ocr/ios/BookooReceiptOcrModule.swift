import ExpoModulesCore
import ImageIO
import UIKit
import Vision

private enum ReceiptRecognitionError: Error {
  case invalidImage
  case unsupportedLanguage
}

public class BookooReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BookooReceiptOcr")

    AsyncFunction("recognize") { (uri: String, language: String) throws -> [String] in
      guard let url = URL(string: uri), url.isFileURL,
        let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else {
        throw ReceiptRecognitionError.invalidImage
      }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.automaticallyDetectsLanguage = false
      let supported = try request.supportedRecognitionLanguages()
      let selected = ReceiptRecognitionLanguages.select(
        preferred: Locale.preferredLanguages,
        supported: supported
      )
      guard !selected.isEmpty else { throw ReceiptRecognitionError.unsupportedLanguage }
      request.recognitionLanguages = selected
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: Self.orientation(image.imageOrientation))
      try handler.perform([request])
      return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    }
  }

  private static func orientation(_ value: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch value {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
