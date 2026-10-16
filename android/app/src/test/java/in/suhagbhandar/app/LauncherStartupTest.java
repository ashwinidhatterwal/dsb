package in.suhagbhandar.app;

import static org.junit.Assert.assertNotNull;
import android.app.Activity;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.ActivityController;
import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.Utils;
import com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity;
import org.robolectric.RuntimeEnvironment;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {35, 36})
public class LauncherStartupTest {
    @Test public void browserSettingsActivityIsRegistered() throws Exception {
        // LauncherActivity always enables/disables this component during startup.
        // Android rejects that call if the component is missing from the manifest.
        android.app.Application app = RuntimeEnvironment.getApplication();
        assertNotNull(app.getPackageManager().getActivityInfo(
                new ComponentName(app, ManageDataLauncherActivity.class),
                PackageManager.MATCH_DISABLED_COMPONENTS));
    }
    @Test public void splashDrawableCanBeRasterized() {
        assertNotNull(Utils.convertDrawableToBitmap(RuntimeEnvironment.getApplication(), R.drawable.splash));
    }
    @Test public void startsWithoutACompatibleBrowser() {
        try (ActivityController<LauncherActivity> controller =
                Robolectric.buildActivity(LauncherActivity.class)) {
            Activity activity = controller.create().start().resume().get();
            assertNotNull(activity.getWindow().getDecorView());
        }
    }
}
