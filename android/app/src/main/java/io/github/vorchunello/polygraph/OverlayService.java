package io.github.vorchunello.polygraph;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Полоска со словами поверх любых приложений (TikTok, игры). Слова сменяются
 * сами; каждое N-е спрашивает «знаю / не знаю». Ответы «не знаю» копятся в
 * SharedPreferences, приложение забирает их и ставит слова на повторение.
 */
public class OverlayService extends Service {

    static final String EXTRA_WORDS = "words";
    static final String EXTRA_INTERVAL = "interval";
    static final String EXTRA_ASK_EVERY = "askEvery";
    static final String PREFS = "polygraph_overlay";
    static final String KEY_UNKNOWN = "unknown";
    private static final String CHANNEL = "polygraph_overlay";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String[]> words = new ArrayList<>();
    private WindowManager windowManager;
    private LinearLayout root;
    private TextView mainText;
    private TextView subText;
    private LinearLayout buttons;
    private int index = -1;
    private int shown = 0;
    private int intervalMs = 6000;
    private int askEvery = 5;

    private final Runnable tick = this::next;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startInForeground();
        if (intent != null) {
            parseWords(intent.getStringExtra(EXTRA_WORDS));
            intervalMs = Math.max(2, intent.getIntExtra(EXTRA_INTERVAL, 6)) * 1000;
            askEvery = Math.max(0, intent.getIntExtra(EXTRA_ASK_EVERY, 5));
        }
        if (words.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (root == null) createView();
        handler.removeCallbacks(tick);
        next();
        return START_NOT_STICKY;
    }

    private void parseWords(String json) {
        words.clear();
        if (json == null) return;
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                words.add(new String[] { o.optString("id"), o.optString("tgt"), o.optString("sub") });
            }
        } catch (JSONException ignored) {
            // Пустой список — сервис остановится.
        }
    }

    private void startInForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Polygraph", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        Notification n = b.setContentTitle("Polygraph")
                .setContentText("Words on top of other apps")
                .setSmallIcon(android.R.drawable.ic_menu_sort_alphabetically)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private Button smallButton(String label, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setPadding(dp(10), dp(4), dp(10), dp(4));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x33FFFFFF);
        bg.setCornerRadius(dp(14));
        b.setBackground(bg);
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 0, dp(6), 0);
        b.setLayoutParams(lp);
        return b;
    }

    private void createView() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(8), dp(14), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xDD1D2025);
        bg.setCornerRadius(dp(14));
        root.setBackground(bg);

        mainText = new TextView(this);
        mainText.setTextColor(Color.WHITE);
        mainText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        mainText.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(mainText);

        subText = new TextView(this);
        subText.setTextColor(0xFFB8C4D0);
        subText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        root.addView(subText);

        buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setPadding(0, dp(6), 0, 0);
        buttons.addView(smallButton("✓", v -> answer(true)));
        buttons.addView(smallButton("✗", v -> answer(false)));
        buttons.addView(smallButton("✕", v -> stopSelf()));
        buttons.setVisibility(View.GONE);
        root.addView(buttons);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = dp(12);
        params.y = dp(48);

        // Полоску можно перетащить; короткое касание показывает кнопки.
        root.setOnTouchListener(new View.OnTouchListener() {
            private int startX, startY;
            private float touchX, touchY;
            private boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = params.x;
                        startY = params.y;
                        touchX = e.getRawX();
                        touchY = e.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (e.getRawX() - touchX);
                        int dy = (int) (e.getRawY() - touchY);
                        if (Math.abs(dx) > dp(4) || Math.abs(dy) > dp(4)) moved = true;
                        params.x = startX + dx;
                        params.y = startY + dy;
                        windowManager.updateViewLayout(root, params);
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) {
                            buttons.setVisibility(buttons.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });

        windowManager.addView(root, params);
    }

    private void next() {
        if (words.isEmpty() || root == null) return;
        index = (index + 1) % words.size();
        shown++;
        String[] w = words.get(index);
        mainText.setText(w[1]);
        subText.setText(w[2]);
        boolean ask = askEvery > 0 && shown % askEvery == 0;
        buttons.setVisibility(ask ? View.VISIBLE : View.GONE);
        // Вопрос ждёт ответа дольше обычного, но не вечно: полоска не должна мешать.
        handler.postDelayed(tick, ask ? intervalMs * 3L : intervalMs);
    }

    private void answer(boolean known) {
        if (!known && index >= 0) {
            SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            try {
                JSONArray arr = new JSONArray(prefs.getString(KEY_UNKNOWN, "[]"));
                arr.put(words.get(index)[0]);
                prefs.edit().putString(KEY_UNKNOWN, arr.toString()).apply();
            } catch (JSONException ignored) {
                // Ответ потеряется — не страшно.
            }
        }
        handler.removeCallbacks(tick);
        buttons.setVisibility(View.GONE);
        handler.postDelayed(tick, 600);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        if (root != null && windowManager != null) {
            try {
                windowManager.removeView(root);
            } catch (IllegalArgumentException ignored) {
                // Уже убрана.
            }
        }
        root = null;
        super.onDestroy();
    }
}
