package com.churchstudio.phonecamera;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.core.ZoomState;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.util.Locale;
import java.util.concurrent.TimeUnit;

public class MainActivity extends AppCompatActivity {

    private PreviewView previewView;
    private SeekBar zoomSeekBar;
    private TextView zoomText;
    private TextView zoomRangeText;
    private TextView statusText;
    private Button resetZoomButton;
    private View focusRing;

    private Camera camera;
    private ScaleGestureDetector scaleGestureDetector;
    private float currentLinearZoom = 0f;
    private boolean gestureWasScaling = false;

    private final ActivityResultLauncher<String> cameraPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) {
                    startCamera();
                } else {
                    setStatus(R.string.camera_permission_needed);
                    Toast.makeText(this, R.string.camera_permission_needed, Toast.LENGTH_LONG).show();
                }
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_main);

        previewView = findViewById(R.id.previewView);
        zoomSeekBar = findViewById(R.id.zoomSeekBar);
        zoomText = findViewById(R.id.zoomText);
        zoomRangeText = findViewById(R.id.zoomRangeText);
        statusText = findViewById(R.id.statusText);
        resetZoomButton = findViewById(R.id.resetZoomButton);
        focusRing = findViewById(R.id.focusRing);

        previewView.setImplementationMode(PreviewView.ImplementationMode.PERFORMANCE);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);

        setupZoomControls();
        setupTouchFocusAndPinchZoom();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void startCamera() {
        setStatus(R.string.camera_starting);

        ListenableFuture<ProcessCameraProvider> providerFuture =
                ProcessCameraProvider.getInstance(this);

        providerFuture.addListener(() -> {
            try {
                ProcessCameraProvider cameraProvider = providerFuture.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                cameraProvider.unbindAll();
                camera = cameraProvider.bindToLifecycle(
                        this,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview
                );

                observeZoomState();
                setStatus(R.string.camera_ready);
            } catch (Exception e) {
                camera = null;
                zoomSeekBar.setEnabled(false);
                resetZoomButton.setEnabled(false);
                setStatus(R.string.camera_error);
                Toast.makeText(this, R.string.camera_error, Toast.LENGTH_LONG).show();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void setupZoomControls() {
        zoomSeekBar.setEnabled(false);
        resetZoomButton.setEnabled(false);

        zoomSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (!fromUser || camera == null) {
                    return;
                }
                setLinearZoom(progress / 100f);
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
            }
        });

        resetZoomButton.setOnClickListener(v -> {
            if (camera != null) {
                camera.getCameraControl().setZoomRatio(1f);
            }
        });

        scaleGestureDetector = new ScaleGestureDetector(this,
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    @Override
                    public boolean onScaleBegin(@NonNull ScaleGestureDetector detector) {
                        gestureWasScaling = true;
                        return camera != null;
                    }

                    @Override
                    public boolean onScale(@NonNull ScaleGestureDetector detector) {
                        if (camera == null) {
                            return false;
                        }
                        float change = (detector.getScaleFactor() - 1f) * 0.22f;
                        setLinearZoom(clamp(currentLinearZoom + change, 0f, 1f));
                        return true;
                    }
                });
    }

    private void setupTouchFocusAndPinchZoom() {
        previewView.setOnTouchListener((view, event) -> {
            scaleGestureDetector.onTouchEvent(event);

            if (event.getAction() == MotionEvent.ACTION_UP) {
                boolean shouldFocus = camera != null && !gestureWasScaling;
                gestureWasScaling = false;

                if (shouldFocus) {
                    focusAt(event.getX(), event.getY());
                    view.performClick();
                }
            } else if (event.getAction() == MotionEvent.ACTION_CANCEL) {
                gestureWasScaling = false;
            }
            return true;
        });
    }

    private void focusAt(float x, float y) {
        if (camera == null) {
            return;
        }

        MeteringPoint point = previewView.getMeteringPointFactory().createPoint(x, y);
        FocusMeteringAction action = new FocusMeteringAction.Builder(point)
                .setAutoCancelDuration(3, TimeUnit.SECONDS)
                .build();

        camera.getCameraControl().startFocusAndMetering(action);
        showFocusRing(x, y);
    }

    private void showFocusRing(float x, float y) {
        focusRing.animate().cancel();
        focusRing.setX(x - focusRing.getWidth() / 2f);
        focusRing.setY(y - focusRing.getHeight() / 2f);
        focusRing.setAlpha(1f);
        focusRing.setVisibility(View.VISIBLE);
        focusRing.animate()
                .alpha(0f)
                .setStartDelay(700)
                .setDuration(350)
                .withEndAction(() -> focusRing.setVisibility(View.INVISIBLE))
                .start();
    }

    private void observeZoomState() {
        if (camera == null) {
            return;
        }
        camera.getCameraInfo().getZoomState().observe(this, this::updateZoomUi);
    }

    private void updateZoomUi(@NonNull ZoomState zoomState) {
        currentLinearZoom = zoomState.getLinearZoom();
        zoomSeekBar.setProgress(Math.round(currentLinearZoom * 100f));
        zoomSeekBar.setEnabled(zoomState.getMaxZoomRatio() > zoomState.getMinZoomRatio());
        resetZoomButton.setEnabled(true);

        zoomText.setText(String.format(Locale.US, "%.1fx", zoomState.getZoomRatio()));
        zoomRangeText.setText(String.format(
                Locale.US,
                "%.1f-%.1fx",
                zoomState.getMinZoomRatio(),
                zoomState.getMaxZoomRatio()
        ));
    }

    private void setLinearZoom(float linearZoom) {
        if (camera == null) {
            return;
        }
        currentLinearZoom = clamp(linearZoom, 0f, 1f);
        camera.getCameraControl().setLinearZoom(currentLinearZoom);
    }

    private void setStatus(int stringRes) {
        if (statusText != null) {
            statusText.setText(stringRes);
        }
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }
}
