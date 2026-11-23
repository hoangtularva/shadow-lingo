import Capacitor
import UIKit
import WebKit

/// Bridges the YouTube embed and iOS to the app page:
/// - reads, without changing anything, the caption files the embedded player loads and whether
///   it shows an ad (a script that acts only inside youtube.com embed frames);
/// - opens videos from shadowlingo://open?v=ID links;
/// - opens allowed links outside the app;
/// - matches the status bar to the app's theme.
/// Nothing is stored or sent anywhere.
@objc(ShadowLingoPlugin)
public class ShadowLingoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShadowLingoPlugin"
    public let jsName = "ShadowLingo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openExternal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setDark", returnType: CAPPluginReturnPromise),
    ]

    private static let youtubeHosts: Set<String> = ["www.youtube.com", "www.youtube-nocookie.com"]
    private static let externalHosts: Set<String> = [
        "www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be",
        "dictionary.cambridge.org", "github.com", "en.wiktionary.org",
    ]
    private static let maxCaptionChars = 8 * 1024 * 1024
    private static let videoIdPattern = try? NSRegularExpression(pattern: "^[A-Za-z0-9_-]{6,20}$")
    private static let langPattern = try? NSRegularExpression(pattern: "^[A-Za-z0-9_-]{1,20}$")

    private static func matches(_ regex: NSRegularExpression?, _ text: String) -> Bool {
        guard let regex = regex else { return false }
        return regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    /// Adds the frame script and its message channel (called before the WebView exists).
    func install(on controller: WKUserContentController) {
        if let url = Bundle.main.url(forResource: "frame-hook", withExtension: "js", subdirectory: "public"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            controller.addUserScript(
                WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false)
            )
        }
        controller.add(WeakMessageHandler(self), name: "shadowLingoNative")
    }

    override public func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(onOpenURL(_:)), name: .capacitorOpenURL, object: nil
        )
        #if DEBUG
        // Test seam for the simulator smoke run in CI (debug builds only):
        // `-shadowLingoOpen VIDEO_ID` opens that video at launch.
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-shadowLingoOpen"), i + 1 < args.count,
           Self.matches(Self.videoIdPattern, args[i + 1]) {
            notifyListeners("shared", data: ["text": "https://youtu.be/\(args[i + 1])"], retainUntilConsumed: true)
        }
        #endif
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    fileprivate func onFrameMessage(_ message: WKScriptMessage) {
        let frame = message.frameInfo
        let origin = frame.securityOrigin
        // Only the YouTube embed frame, never the app page or any other site.
        guard !frame.isMainFrame, origin.protocol == "https", Self.youtubeHosts.contains(origin.host),
              let raw = message.body as? String, raw.count <= Self.maxCaptionChars + 4096,
              let data = raw.data(using: .utf8),
              let msg = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let type = msg["type"] as? String else { return }

        if type == "caption" {
            // Only the video id, languages and caption text: no URL, so no token, ever.
            guard let videoId = msg["videoId"] as? String, Self.matches(Self.videoIdPattern, videoId),
                  let lang = msg["lang"] as? String, Self.matches(Self.langPattern, lang),
                  let kind = msg["kind"] as? String, kind.isEmpty || kind == "asr",
                  let tlang = msg["tlang"] as? String, tlang.isEmpty || Self.matches(Self.langPattern, tlang),
                  let body = msg["body"] as? String, !body.isEmpty, body.count <= Self.maxCaptionChars
            else { return }
            notifyListeners("caption", data: [
                "videoId": videoId, "lang": lang, "kind": kind, "tlang": tlang, "body": body,
            ])
        } else if type == "ad", let showing = msg["showing"] as? Bool {
            notifyListeners("ad", data: ["showing": showing])
        }
    }

    /// shadowlingo://open?v=VIDEO_ID opens that video (the page treats it like a shared link).
    @objc private func onOpenURL(_ notification: Notification) {
        guard let object = notification.object as? [String: Any],
              let url = object["url"] as? URL, url.scheme == "shadowlingo", url.host == "open",
              let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "v" })?.value,
              Self.matches(Self.videoIdPattern, id) else { return }
        notifyListeners("shared", data: ["text": "https://youtu.be/\(id)"], retainUntilConsumed: true)
    }

    @objc func openExternal(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https",
              let host = url.host, Self.externalHosts.contains(host) else {
            call.reject("not allowed")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url)
            call.resolve()
        }
    }

    @objc func setDark(_ call: CAPPluginCall) {
        let dark = call.getBool("dark") ?? false
        DispatchQueue.main.async {
            // The status bar follows the window's style.
            self.bridge?.viewController?.view.window?.overrideUserInterfaceStyle = dark ? .dark : .light
            call.resolve()
        }
    }
}

/// WKUserContentController keeps its handlers strongly; this avoids a retain cycle.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var plugin: ShadowLingoPlugin?

    init(_ plugin: ShadowLingoPlugin) {
        self.plugin = plugin
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        plugin?.onFrameMessage(message)
    }
}
