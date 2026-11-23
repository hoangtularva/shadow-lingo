package io.github.hoangtularva.shadowlingo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShadowLingoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
