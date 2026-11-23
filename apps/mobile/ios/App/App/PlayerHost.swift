import UIKit
import WebKit

/// The YouTube embed in its own WebView, laid over the app page's player slot.
///
/// The app page is served from capacitor://, which sends no Referer, and YouTube refuses to
/// play embeds without one (error 153). This WebView loads the bundled player.html with an
/// https base URL instead, so the embed gets the app's address as its Referer. The page only
/// relays the embed's postMessage traffic; nothing here changes the player or its ads.
final class PlayerHost: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    static let baseURL = URL(string: "https://hoangtularva.github.io/shadow-lingo/app/")!
    private static let origin = "https://hoangtularva.github.io"
    private static let videoIdPattern = try? NSRegularExpression(pattern: "^[A-Za-z0-9_-]{6,20}$")
    private static let externalHosts: Set<String> = ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"]

    private weak var container: UIView?
    private var webView: WKWebView?
    private let configure: (WKUserContentController) -> Void
    private let onMessage: (String) -> Void

    /// `configure` adds the caption script to the player's frames; `onMessage` gets the embed's
    /// messages for the page.
    init(container: UIView, configure: @escaping (WKUserContentController) -> Void, onMessage: @escaping (String) -> Void) {
        self.container = container
        self.configure = configure
        self.onMessage = onMessage
    }

    static func isVideoId(_ id: String) -> Bool {
        guard let regex = videoIdPattern else { return false }
        return regex.firstMatch(in: id, range: NSRange(id.startIndex..., in: id)) != nil
    }

    func show(videoId: String, start: Int, frame: CGRect) {
        guard Self.isVideoId(videoId),
              let url = Bundle.main.url(forResource: "player", withExtension: "html", subdirectory: "public"),
              let template = try? String(contentsOf: url, encoding: .utf8),
              let container = container else { return }
        hide()
        var src = "https://www.youtube.com/embed/\(videoId)?enablejsapi=1"
            + "&origin=https%3A%2F%2Fhoangtularva.github.io&rel=0&playsinline=1"
            + "&cc_load_policy=1&cc_lang_pref=en&hl=vi"
        if start > 0 { src += "&start=\(start)" }

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = true
        configure(configuration.userContentController)
        configuration.userContentController.add(WeakPlayerHandler(self), name: "shadowLingoPlayer")

        let view = WKWebView(frame: frame, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.navigationDelegate = self
        view.uiDelegate = self
        view.accessibilityIdentifier = "shadowlingo-player"
        container.addSubview(view)
        webView = view
        view.loadHTMLString(template.replacingOccurrences(of: "__EMBED_SRC__", with: src), baseURL: Self.baseURL)
    }

    func move(frame: CGRect) {
        webView?.frame = frame
    }

    func hide() {
        guard let view = webView else { return }
        view.configuration.userContentController.removeAllScriptMessageHandlers()
        view.stopLoading()
        view.removeFromSuperview()
        webView = nil
    }

    /// A command for the embed (JSON text from the page's player client).
    func post(_ data: String) {
        guard data.count < 10_000, let view = webView,
              let json = try? JSONSerialization.data(withJSONObject: [data]),
              let array = String(data: json, encoding: .utf8) else { return }
        // `array` is a JSON array literal: the string arrives as data, never as code.
        view.evaluateJavaScript("window.shadowLingoPost && window.shadowLingoPost(\(array)[0])")
    }

    // Messages from player.html itself (its main frame, at the app's https address).
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let frame = message.frameInfo
        guard frame.isMainFrame, frame.securityOrigin.protocol == "https",
              "https://\(frame.securityOrigin.host)" == Self.origin,
              let data = message.body as? String, data.count <= 200_000 else { return }
        onMessage(data)
    }

    // Only player.html and the embed load here; any other page opens outside the app.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let isMain = action.targetFrame?.isMainFrame ?? true
        if isMain && url != Self.baseURL && url.absoluteString != "about:blank" {
            openOutside(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    // Links the embed opens in a new window (title, "Xem trên YouTube").
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { openOutside(url) }
        return nil
    }

    private func openOutside(_ url: URL) {
        guard url.scheme == "https", let host = url.host, Self.externalHosts.contains(host) else { return }
        UIApplication.shared.open(url)
    }
}

/// WKUserContentController keeps its handlers strongly; this avoids a retain cycle.
private final class WeakPlayerHandler: NSObject, WKScriptMessageHandler {
    private weak var host: PlayerHost?

    init(_ host: PlayerHost) {
        self.host = host
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        host?.userContentController(controller, didReceive: message)
    }
}
