package io.github.hoangtularva.shadowlingo;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.PixelCopy;
import android.view.Window;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Bridges the YouTube embed and the Android system to the app page:
 * - reads, without changing anything, the caption files the embedded player loads and whether
 *   it shows an ad (a small script injected into youtube.com embed frames only);
 * - receives links shared from other apps (Share in the YouTube app);
 * - opens allowed links outside the app;
 * - copies the player's subtitle band from the app's own window for "Đọc chữ trên hình"
 *   (in memory only, handed to the page, which reads the text on the device).
 * Nothing is stored or sent anywhere.
 */
@CapacitorPlugin(name = "ShadowLingo")
public class ShadowLingoPlugin extends Plugin {

    private static final Set<String> YOUTUBE_ORIGINS = new HashSet<>(
        Arrays.asList("https://www.youtube.com", "https://www.youtube-nocookie.com")
    );
    private static final List<String> EXTERNAL_HOSTS = Arrays.asList(
        "www.youtube.com",
        "youtube.com",
        "m.youtube.com",
        "youtu.be",
        "dictionary.cambridge.org",
        "github.com",
        "en.wiktionary.org"
    );
    private static final int MAX_CAPTION_CHARS = 8 * 1024 * 1024;
    private static final int MAX_SHARED_CHARS = 2000;
    private static final Pattern VIDEO_ID = Pattern.compile("^[\\w-]{6,20}$");
    private static final Pattern LANG = Pattern.compile("^[\\w-]{1,20}$");
    /** Captured pictures are scaled down to this width (subtitles stay legible). */
    private static final int MAX_CAPTURE_WIDTH = 960;
    private final ExecutorService encoder = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        WebView webView = getBridge().getWebView();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                webView,
                "shadowLingoNative",
                YOUTUBE_ORIGINS,
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> onFrameMessage(message.getData())
            );
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            String hook = readAsset("public/frame-hook.js");
            if (hook != null) WebViewCompat.addDocumentStartJavaScript(webView, hook, YOUTUBE_ORIGINS);
        }
        handleShare(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleShare(intent);
    }

    private void handleShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (!"text/plain".equals(intent.getType())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty() || text.length() > MAX_SHARED_CHARS) return;
        JSObject data = new JSObject();
        data.put("text", text);
        // Kept until the page listens (the app may still be starting).
        notifyListeners("shared", data, true);
        // Handled once: recreating the activity must not open it again.
        intent.setAction(Intent.ACTION_MAIN);
    }

    private void onFrameMessage(String raw) {
        if (raw == null || raw.length() > MAX_CAPTION_CHARS + 4096) return;
        try {
            JSONObject msg = new JSONObject(raw);
            String type = msg.optString("type");
            if ("caption".equals(type)) {
                // Only the video id, languages and caption text: no URL, so no token, ever.
                String videoId = msg.optString("videoId");
                String lang = msg.optString("lang");
                String kind = msg.optString("kind");
                String tlang = msg.optString("tlang");
                String body = msg.optString("body");
                if (!VIDEO_ID.matcher(videoId).matches() || !LANG.matcher(lang).matches()) return;
                if (!kind.isEmpty() && !"asr".equals(kind)) return;
                if (!tlang.isEmpty() && !LANG.matcher(tlang).matches()) return;
                if (body.isEmpty() || body.length() > MAX_CAPTION_CHARS) return;
                JSObject data = new JSObject();
                data.put("videoId", videoId);
                data.put("lang", lang);
                data.put("kind", kind);
                data.put("tlang", tlang);
                data.put("body", body);
                notifyListeners("caption", data);
            } else if ("ad".equals(type) && msg.has("showing")) {
                JSObject data = new JSObject();
                data.put("showing", msg.optBoolean("showing"));
                notifyListeners("ad", data);
            }
        } catch (JSONException ignored) {
            // Not ours: ignore.
        }
    }

    /** System bars in the app's colours (UI spec: top bar #171A20 dark, #FFFFFF light). */
    @PluginMethod
    public void setDark(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            int color = dark ? 0xFF171A20 : 0xFFFFFFFF;
            window.getDecorView().setBackgroundColor(color);
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
            bars.setAppearanceLightStatusBars(!dark);
            bars.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        Uri uri = url == null ? null : Uri.parse(url);
        if (uri == null || !"https".equals(uri.getScheme()) || !EXTERNAL_HOSTS.contains(uri.getHost())) {
            call.reject("not allowed");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("no app");
        }
    }

    /**
     * The picture inside a rectangle of the page (CSS pixels), as PNG in base64, or no "png"
     * when there is none. Only the app's own WebView area can be copied.
     */
    @PluginMethod
    public void captureFrame(PluginCall call) {
        Double x = call.getDouble("x");
        Double y = call.getDouble("y");
        Double w = call.getDouble("width");
        Double h = call.getDouble("height");
        if (!finite(x) || !finite(y) || !finite(w) || !finite(h)) {
            call.reject("bad rect");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(new JSObject());
            return;
        }
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            float scale = webView.getResources().getDisplayMetrics().density;
            int[] at = new int[2];
            webView.getLocationInWindow(at);
            Rect view = new Rect(at[0], at[1], at[0] + webView.getWidth(), at[1] + webView.getHeight());
            Rect rect = new Rect(
                at[0] + (int) Math.floor(x * scale),
                at[1] + (int) Math.floor(y * scale),
                at[0] + (int) Math.ceil((x + w) * scale),
                at[1] + (int) Math.ceil((y + h) * scale)
            );
            if (!rect.intersect(view) || rect.width() < 32 || rect.height() < 8) {
                call.resolve(new JSObject());
                return;
            }
            Bitmap bitmap = Bitmap.createBitmap(rect.width(), rect.height(), Bitmap.Config.ARGB_8888);
            PixelCopy.request(
                getActivity().getWindow(),
                rect,
                bitmap,
                (result) -> {
                    if (result != PixelCopy.SUCCESS) {
                        bitmap.recycle();
                        call.resolve(new JSObject());
                        return;
                    }
                    encoder.execute(() -> call.resolve(encodePng(bitmap)));
                },
                new Handler(Looper.getMainLooper())
            );
        });
    }

    private static boolean finite(Double v) {
        return v != null && !v.isNaN() && !v.isInfinite();
    }

    private static JSObject encodePng(Bitmap bitmap) {
        Bitmap out = bitmap;
        if (bitmap.getWidth() > MAX_CAPTURE_WIDTH) {
            int height = Math.max(1, Math.round(bitmap.getHeight() * (float) MAX_CAPTURE_WIDTH / bitmap.getWidth()));
            out = Bitmap.createScaledBitmap(bitmap, MAX_CAPTURE_WIDTH, height, true);
        }
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.PNG, 100, png);
        if (out != bitmap) out.recycle();
        bitmap.recycle();
        JSObject data = new JSObject();
        data.put("png", Base64.encodeToString(png.toByteArray(), Base64.NO_WRAP));
        return data;
    }

    private String readAsset(String path) {
        try (InputStream in = getContext().getAssets().open(path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            return null;
        }
    }
}
