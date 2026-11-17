package dev.hyo.bookoo.receipt

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BookooReceiptOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BookooReceiptOcr")

    AsyncFunction("recognize") { uriString: String, language: String, promise: Promise ->
      val context = appContext.reactContext
      val uri = Uri.parse(uriString)
      if (context == null || (uri.scheme != "file" && uri.scheme != "content")) {
        promise.reject("INVALID_RECEIPT_IMAGE", "A local receipt image is required", null)
        return@AsyncFunction
      }
      try {
        val image = InputImage.fromFilePath(context, uri)
        val recognizer = when (language.substringBefore('-')) {
          "ko" -> TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
          "ja" -> TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build())
          "zh" -> TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
          else -> TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        }
        val task = try {
          recognizer.process(image)
        } catch (error: Exception) {
          recognizer.close()
          throw error
        }
        task
          .addOnSuccessListener { text ->
            promise.resolve(text.textBlocks.flatMap { block -> block.lines.map { it.text } })
          }
          .addOnFailureListener {
            promise.reject("RECEIPT_RECOGNITION_FAILED", "Receipt recognition failed", null)
          }
          .addOnCompleteListener { recognizer.close() }
      } catch (_: Exception) {
        promise.reject("RECEIPT_RECOGNITION_FAILED", "Receipt recognition failed", null)
      }
    }
  }
}
