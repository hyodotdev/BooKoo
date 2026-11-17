# BooKoo receipt text recognition

Local Expo module, autolinked by `expo-module.config.json`. Requires a new native
build; Expo Go cannot supply it. JavaScript calls `recognize(localUri, locale)`
and receives text lines. Only local `file:`/Android `content:` images are
accepted. Recognition never uploads the image or text and does not log either.

- Android: bundled ML Kit Text Recognition v2 16.0.1. Latin, Korean, Japanese
  and Chinese scripts are selected from the app locale. Bundled models work
  without a model download or a billable cloud OCR API. ML Kit can send SDK
  diagnostics and API usage metrics to Google; these exclude the recognition
  image, text and result content. See the [official disclosure](https://developers.google.com/ml-kit/android-data-disclosure)
  and the versioned public privacy notice.
- iOS: Apple's Vision accurate text recognizer, using the first supported
  device-preferred language, with English as a secondary language for receipt
  totals. Priority order is preserved; no alphabetic sort, all-language request
  or separate bundled ML Kit language models. The JS locale argument remains
  for the parser and Android script selection. Image orientation is preserved.
  This supports the arm64 iOS simulator, unlike the inspected
  MLKitTextRecognition 7.0.0 CocoaPod's device-only arm64 slice.

The media adapter normalizes a temporary JPEG to at most 2400 pixels per side
and deletes that derivative after recognition. Raw text is passed directly to
the bounded parser and discarded. The selected original stays pending after Apply
to draft and follows the existing private attachment flow only when the user
presses Done.

`shared/receiptSuggestions.ts` returns a unique labelled total and a validated
calendar date. Conflicting totals/dates stay blank; foreign currency is never
converted. The editor requires confirmation, retains ordinary validation and
saves only through the existing user action.

Development verification: use the existing iOS simulator and a separate
connected-Android QA package with synthetic receipts. Do not replace or clear
the installed Play app's data. Store builds retain `dev.hyo.bookoo`.

The native language-selection regression cases run on macOS with `xcrun swiftc
modules/bookoo-receipt-ocr/ios/ReceiptRecognitionLanguages.swift
test/native/receiptRecognitionLanguages/main.swift -o /tmp/bookoo-receipt-languages`,
then `/tmp/bookoo-receipt-languages`. Simulator OCR remains a separate check.
