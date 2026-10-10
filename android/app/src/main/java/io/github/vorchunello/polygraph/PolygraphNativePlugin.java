package io.github.vorchunello.polygraph;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

/**
 * Мост к Android: плавающая полоска со словами поверх других приложений
 * (OverlayService) и приём текста через системное «Поделиться».
 */
@CapacitorPlugin(name = "PolygraphNative")
public class PolygraphNativePlugin extends Plugin {

    private String pendingShare;

    @Override
    public void load() {
        pendingShare = extractShare(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String text = extractShare(intent);
        if (text != null) {
            JSObject data = new JSObject();
            data.put("text", text);
            notifyListeners("sharedText", data, true);
        }
    }

    private String extractShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        // Чтобы текст не пришёл повторно при пересоздании активности.
        intent.setAction(null);
        return text;
    }

    @PluginMethod
    public void takeSharedText(PluginCall call) {
        JSObject r = new JSObject();
        r.put("text", pendingShare);
        pendingShare = null;
        call.resolve(r);
    }

    @PluginMethod
    public void canDrawOverlays(PluginCall call) {
        JSObject r = new JSObject();
        r.put("value", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void startOverlay(PluginCall call) {
        JSArray words = call.getArray("words");
        if (words == null || words.length() == 0) {
            call.reject("No words");
            return;
        }
        Intent intent = new Intent(getContext(), OverlayService.class);
        intent.putExtra(OverlayService.EXTRA_WORDS, words.toString());
        intent.putExtra(OverlayService.EXTRA_INTERVAL, call.getInt("intervalSec", 6));
        intent.putExtra(OverlayService.EXTRA_ASK_EVERY, call.getInt("askEvery", 5));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
        else getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stopOverlay(PluginCall call) {
        getContext().stopService(new Intent(getContext(), OverlayService.class));
        call.resolve();
    }

    @PluginMethod
    public void takeOverlayResults(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(OverlayService.PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(OverlayService.KEY_UNKNOWN, "[]");
        prefs.edit().remove(OverlayService.KEY_UNKNOWN).apply();
        JSObject r = new JSObject();
        try {
            r.put("unknown", new JSArray(raw));
        } catch (JSONException e) {
            r.put("unknown", new JSArray());
        }
        call.resolve(r);
    }
}
