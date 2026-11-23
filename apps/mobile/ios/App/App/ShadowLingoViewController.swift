import Capacitor
import UIKit
import WebKit

/// Capacitor's view controller plus the app's own plugin. The frame script and its message
/// handler go into the WebView configuration before the first page loads.
class ShadowLingoViewController: CAPBridgeViewController {
    private let shadowLingo = ShadowLingoPlugin()

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        shadowLingo.install(on: configuration.userContentController)
        return configuration
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(shadowLingo)
    }
}
