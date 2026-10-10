package io.github.vorchunello.polygraph;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свои плагины регистрируются до super.onCreate — так требует Capacitor.
        registerPlugin(PolygraphNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
